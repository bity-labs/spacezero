import { Effect, flow } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import {
  HostApi,
  parseGlobalChatSessionEventEnvelope,
  parseGlobalChatSessionLiveEventEnvelope,
  parseHostConnectionDescriptor,
  type CreateGlobalChatSessionWithFirstPromptResult,
  type GetGlobalChatSessionRuntimeResult,
  type GlobalChatSessionCommandId,
  type GlobalChatSessionEventEnvelope,
  type GlobalChatSessionLiveEventEnvelope,
  type GlobalChatSessionSummary,
  type HostConnectionDescriptor,
  type InterruptGlobalChatSessionTurnResult,
  type ListGlobalChatSessionMessagesResult,
  type SubmitGlobalChatSessionPromptResult,
  type UpdateGlobalChatSessionRuntimeResult,
} from "@spacezero/host-contracts";

export interface GlobalChatSessionClient {
  readonly listGlobalChatSessions: () => Promise<
    readonly GlobalChatSessionSummary[]
  >;
  readonly createWithFirstPrompt: (
    firstPrompt: string,
    commandId?: GlobalChatSessionCommandId,
  ) => Promise<CreateGlobalChatSessionWithFirstPromptResult>;
  readonly submitPrompt: (
    sessionId: string,
    prompt: string,
    commandId?: GlobalChatSessionCommandId,
  ) => Promise<SubmitGlobalChatSessionPromptResult>;
  readonly getRuntime: (
    sessionId: string,
  ) => Promise<GetGlobalChatSessionRuntimeResult>;
  readonly updateRuntime: (
    sessionId: string,
    input: {
      readonly providerId: string;
      readonly modelId: string;
      readonly defaultThinkingLevel:
        | "off"
        | "minimal"
        | "low"
        | "medium"
        | "high"
        | "xhigh"
        | "max";
      readonly expectedRevision: number;
      readonly commandId?: GlobalChatSessionCommandId;
    },
  ) => Promise<UpdateGlobalChatSessionRuntimeResult>;
  readonly listMessages: (
    sessionId: string,
  ) => Promise<ListGlobalChatSessionMessagesResult>;
  readonly interruptTurn: (
    sessionId: string,
    turnId: string,
  ) => Promise<InterruptGlobalChatSessionTurnResult>;
  readonly subscribeEvents: (
    input: SubscribeGlobalChatSessionEventsInput,
  ) => GlobalChatSessionEventSubscription;
}

export interface SubscribeGlobalChatSessionEventsInput {
  readonly sessionId: string;
  readonly after: number;
  readonly onEvent: (event: GlobalChatSessionEventEnvelope) => void;
  readonly onLiveEvent?: (event: GlobalChatSessionLiveEventEnvelope) => void;
  readonly onError?: (error: Error) => void;
}

export interface GlobalChatSessionEventSubscription {
  readonly cancel: () => void;
  readonly closed: Promise<void>;
}

export interface GlobalChatSessionClientOptions {
  readonly getConnectionDescriptor: () => Promise<HostConnectionDescriptor>;
  readonly createCommandId?: () => GlobalChatSessionCommandId;
  readonly fetch?: typeof globalThis.fetch;
}

interface GeneratedGlobalChatSessionApiClient {
  readonly globalChatSessions: {
    readonly listGlobalChatSessions: (input: {
      readonly headers: { readonly authorization: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly createGlobalChatSessionWithFirstPrompt: (input: {
      readonly headers: { readonly authorization: string };
      readonly payload: {
        readonly commandId: string;
        readonly firstPrompt: string;
      };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly submitGlobalChatSessionPrompt: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string };
      readonly payload: {
        readonly commandId: string;
        readonly prompt: string;
      };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly listGlobalChatSessionMessages: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly getGlobalChatSessionRuntime: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly updateGlobalChatSessionRuntime: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string };
      readonly payload: {
        readonly commandId: string;
        readonly providerId: string;
        readonly modelId: string;
        readonly defaultThinkingLevel:
          | "off"
          | "minimal"
          | "low"
          | "medium"
          | "high"
          | "xhigh"
          | "max";
        readonly expectedRevision: number;
      };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly interruptGlobalChatSessionTurn: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string; readonly turnId: string };
    }) => Effect.Effect<unknown, unknown, never>;
  };
}

const parseSseFrames = (
  text: string,
): { readonly frames: readonly string[]; readonly rest: string } => {
  const normalized = text.replaceAll("\r\n", "\n");
  const parts = normalized.split("\n\n");
  return { frames: parts.slice(0, -1), rest: parts.at(-1) ?? "" };
};

const parseSseEnvelope = (
  frame: string,
):
  | GlobalChatSessionEventEnvelope
  | GlobalChatSessionLiveEventEnvelope
  | undefined => {
  const dataLines: string[] = [];
  let id: string | undefined;
  let eventName: string | undefined;
  for (const line of frame.split("\n")) {
    if (line.startsWith("id:")) id = line.slice(3).trim();
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  const data = dataLines.join("\n");
  if (!data) return undefined;
  const value = JSON.parse(data) as unknown;
  if (eventName === "global-chat-session.live")
    return parseGlobalChatSessionLiveEventEnvelope(value);
  const envelope = parseGlobalChatSessionEventEnvelope(value);
  if (id !== undefined && id !== String(envelope.sequence))
    throw new Error("invalid global chat session event id");
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

const runGlobalChatSessionEventSubscription = async (
  input: SubscribeGlobalChatSessionEventsInput,
  descriptorFactory: () => Promise<HostConnectionDescriptor>,
  fetchImpl: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<void> => {
  let cursor = input.after;
  const decoder = new TextDecoder();
  while (!signal.aborted) {
    try {
      const descriptor = await descriptorFactory();
      const url = new URL(
        `/v1/global-chat-sessions/${input.sessionId}/events`,
        descriptor.endpoint,
      );
      url.searchParams.set("after", String(cursor));
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${descriptor.clientCapability}` },
        signal,
      });
      if (!response.ok || !response.body)
        throw new Error("global chat session event subscription unavailable");
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
          if ("sequence" in event) {
            cursor = event.sequence;
            input.onEvent(event);
          } else {
            input.onLiveEvent?.(event);
          }
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      input.onError?.(
        error instanceof Error
          ? error
          : new Error("global chat session event subscription failed"),
      );
      await delay(100, signal);
    }
  }
};

const runClient = async <A>(
  descriptor: HostConnectionDescriptor,
  fetchImpl: typeof globalThis.fetch,
  operation: (
    client: GeneratedGlobalChatSessionApiClient,
  ) => Effect.Effect<A, unknown, never>,
): Promise<A> => {
  const program = Effect.gen(function* () {
    const client = yield* HttpApiClient.make(HostApi, {
      baseUrl: descriptor.endpoint,
      transformClient: (client) =>
        client.pipe(
          HttpClient.mapRequest(
            flow((request) =>
              HttpClientRequest.bearerToken(
                request,
                descriptor.clientCapability,
              ),
            ),
          ),
        ),
    });
    return yield* operation(
      client as unknown as GeneratedGlobalChatSessionApiClient,
    );
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetchImpl),
    Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  );
  return Effect.runPromise(program);
};

export const createGlobalChatSessionClient = (
  options: GlobalChatSessionClientOptions,
): GlobalChatSessionClient => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const createCommandId =
    options.createCommandId ?? (() => globalThis.crypto.randomUUID());
  const descriptor = async () =>
    parseHostConnectionDescriptor(await options.getConnectionDescriptor());
  return {
    listGlobalChatSessions: async () => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.globalChatSessions.listGlobalChatSessions({
          headers: { authorization: `Bearer ${current.clientCapability}` },
        }),
      );
      const body = Array.isArray(result) ? result[0] : result;
      return (body as { readonly sessions: readonly GlobalChatSessionSummary[] })
        .sessions;
    },
    createWithFirstPrompt: async (firstPrompt, commandId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.globalChatSessions.createGlobalChatSessionWithFirstPrompt({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          payload: { commandId: commandId ?? createCommandId(), firstPrompt },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as CreateGlobalChatSessionWithFirstPromptResult;
    },
    submitPrompt: async (sessionId, prompt, commandId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.globalChatSessions.submitGlobalChatSessionPrompt({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId },
          payload: { commandId: commandId ?? createCommandId(), prompt },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as SubmitGlobalChatSessionPromptResult;
    },
    getRuntime: async (sessionId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.globalChatSessions.getGlobalChatSessionRuntime({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as GetGlobalChatSessionRuntimeResult;
    },
    updateRuntime: async (sessionId, input) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.globalChatSessions.updateGlobalChatSessionRuntime({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId },
          payload: { ...input, commandId: input.commandId ?? createCommandId() },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as UpdateGlobalChatSessionRuntimeResult;
    },
    listMessages: async (sessionId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.globalChatSessions.listGlobalChatSessionMessages({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as ListGlobalChatSessionMessagesResult;
    },
    interruptTurn: async (sessionId, turnId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.globalChatSessions.interruptGlobalChatSessionTurn({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId, turnId },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as InterruptGlobalChatSessionTurnResult;
    },
    subscribeEvents: (input) => {
      const controller = new AbortController();
      const closed = runGlobalChatSessionEventSubscription(
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
  };
};
