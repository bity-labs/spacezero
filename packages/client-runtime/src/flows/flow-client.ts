import {
  parseFlowEventEnvelope,
  parseFlowPromptResponseRequest,
  parseHostConnectionDescriptor,
  type FlowEventEnvelope,
  type HostConnectionDescriptor,
} from "@spacezero/host-contracts";

export interface SubscribeFlowEventsInput {
  readonly flowId: string;
  readonly after?: number;
  readonly onEvent: (event: FlowEventEnvelope) => void;
  readonly onError?: (error: Error) => void;
}

export interface FlowEventSubscription {
  readonly cancel: () => void;
  readonly closed: Promise<void>;
}

export interface FlowClient {
  readonly subscribeFlowEvents: (
    input: SubscribeFlowEventsInput,
  ) => FlowEventSubscription;
  readonly respondToPrompt: (
    flowId: string,
    promptId: string,
    response: string,
  ) => Promise<void>;
  readonly cancelFlow: (flowId: string) => Promise<void>;
}

export interface FlowClientOptions {
  readonly getConnectionDescriptor: () => Promise<HostConnectionDescriptor>;
  readonly fetch?: typeof globalThis.fetch;
}

export class FlowClientError extends Error {
  constructor() {
    super("flow request failed");
  }
}

const parseSseFrames = (
  text: string,
): { readonly frames: readonly string[]; readonly rest: string } => {
  const normalized = text.replaceAll("\r\n", "\n");
  const parts = normalized.split("\n\n");
  return { frames: parts.slice(0, -1), rest: parts.at(-1) ?? "" };
};

const parseSseEnvelope = (frame: string): FlowEventEnvelope | undefined => {
  const dataLines: string[] = [];
  let id: string | undefined;
  let eventName: string | undefined;
  for (const line of frame.split("\n")) {
    if (line.startsWith("id:")) id = line.slice(3).trim();
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (eventName !== "flow.event") return undefined;
  const data = dataLines.join("\n");
  if (!data) return undefined;
  const envelope = parseFlowEventEnvelope(JSON.parse(data) as unknown);
  if (id !== String(envelope.sequence))
    throw new Error("invalid flow event id");
  return envelope;
};

const delay = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

const subscription = async (
  input: SubscribeFlowEventsInput,
  descriptorFactory: () => Promise<HostConnectionDescriptor>,
  fetchImpl: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<void> => {
  let cursor = input.after ?? 0;
  const decoder = new TextDecoder();
  while (!signal.aborted) {
    let sawTerminal = false;
    try {
      const descriptor = await descriptorFactory();
      const url = new URL(
        `/v1/flows/${encodeURIComponent(input.flowId)}/events`,
        descriptor.endpoint,
      );
      url.searchParams.set("after", String(cursor));
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${descriptor.clientCapability}` },
        signal,
      });
      if (!response.ok || !response.body) throw new FlowClientError();
      const reader = response.body.getReader();
      let buffered = "";
      for (;;) {
        const read = await reader.read();
        if (read.done) break;
        buffered += decoder.decode(read.value, { stream: true });
        const parsed = parseSseFrames(buffered);
        buffered = parsed.rest;
        for (const frame of parsed.frames) {
          const event = parseSseEnvelope(frame);
          if (!event) continue;
          cursor = event.sequence;
          input.onEvent(event);
          sawTerminal =
            event.event.type === "flow.completed" ||
            event.event.type === "flow.failed" ||
            event.event.type === "flow.cancelled";
        }
      }
      if (sawTerminal) return;
    } catch (error) {
      if (signal.aborted) return;
      input.onError?.(error instanceof Error ? error : new FlowClientError());
      await delay(100, signal);
    }
  }
};

export const createFlowClient = (options: FlowClientOptions): FlowClient => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const descriptor = async () =>
    parseHostConnectionDescriptor(await options.getConnectionDescriptor());
  const command = async (
    path: string,
    init?: Omit<RequestInit, "headers">,
  ): Promise<void> => {
    const current = await descriptor();
    const response = await fetchImpl(new URL(path, current.endpoint), {
      ...init,
      method: init?.method ?? "POST",
      headers: {
        Authorization: `Bearer ${current.clientCapability}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) throw new FlowClientError();
  };
  return {
    subscribeFlowEvents: (input) => {
      const controller = new AbortController();
      const closed = subscription(
        input,
        descriptor,
        fetchImpl,
        controller.signal,
      );
      return {
        cancel: () => controller.abort(),
        closed,
      };
    },
    respondToPrompt: async (flowId, promptId, response) => {
      try {
        parseFlowPromptResponseRequest({ response });
        await command(
          `/v1/flows/${encodeURIComponent(flowId)}/prompts/${encodeURIComponent(promptId)}/responses`,
          {
            body: JSON.stringify({ response }),
          },
        );
      } catch {
        throw new FlowClientError();
      }
    },
    cancelFlow: async (flowId) => {
      try {
        await command(`/v1/flows/${encodeURIComponent(flowId)}/cancel`);
      } catch {
        throw new FlowClientError();
      }
    },
  };
};
