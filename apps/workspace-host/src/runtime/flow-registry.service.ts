import { randomBytes } from "node:crypto";
import type {
  FlowEvent,
  FlowEventEnvelope,
  FlowPromptOption,
  FlowPromptType,
} from "@spacezero/host-contracts";
import type {
  ProviderAuthStatus,
  ProviderLoginEvent,
  ProviderLoginPrompt,
} from "@spacezero/pi-adapter";

export type FlowRegistryErrorCode =
  | "flow_not_found"
  | "flow_prompt_not_pending"
  | "invalid_flow_response"
  | "flow_unavailable";

export class FlowRegistryError extends Error {
  constructor(readonly code: FlowRegistryErrorCode) {
    super(code);
  }
}

export interface FlowInteraction {
  readonly signal: AbortSignal;
  readonly prompt: (prompt: ProviderLoginPrompt) => Promise<string>;
  readonly notify: (event: ProviderLoginEvent) => void;
}

export interface FlowRegistry {
  readonly start: (
    run: (interaction: FlowInteraction) => Promise<ProviderAuthStatus | void>,
  ) => string;
  readonly listEventsAfter: (
    flowId: string,
    after: number,
  ) => readonly FlowEventEnvelope[];
  readonly waitForEventsAfter: (
    flowId: string,
    after: number,
    signal: AbortSignal,
  ) => Promise<readonly FlowEventEnvelope[]>;
  readonly respondToPrompt: (
    flowId: string,
    promptId: string,
    response: string,
  ) => void;
  readonly cancel: (flowId: string) => void;
}

interface PendingPrompt {
  readonly promptId: string;
  readonly resolve: (response: string) => void;
  readonly reject: (error: Error) => void;
}

interface Waiter {
  readonly after: number;
  readonly resolve: (events: readonly FlowEventEnvelope[]) => void;
  readonly reject: (error: Error) => void;
  readonly onAbort: () => void;
  readonly signal: AbortSignal;
}

interface FlowState {
  readonly flowId: string;
  readonly controller: AbortController;
  readonly events: FlowEventEnvelope[];
  readonly waiters: Set<Waiter>;
  terminal: boolean;
  pendingPrompt: PendingPrompt | undefined;
}

const id = (): string => randomBytes(24).toString("base64url");
const MAX_RESPONSE_BYTES = 16 * 1024;
const textBytes = (value: string): number => Buffer.byteLength(value, "utf8");
const safeFailureReason = "The sign-in flow failed.";

const promptType = (type: ProviderLoginPrompt["type"]): FlowPromptType => type;

const promptOptions = (
  prompt: ProviderLoginPrompt,
): readonly FlowPromptOption[] | undefined =>
  prompt.type === "select" ? prompt.options : undefined;

const promptEvent = (
  promptId: string,
  prompt: ProviderLoginPrompt,
): FlowEvent => {
  const event: {
    type: "flow.prompt";
    promptId: string;
    promptType: FlowPromptType;
    message: string;
    placeholder?: string;
    options?: readonly FlowPromptOption[];
  } = {
    type: "flow.prompt",
    promptId,
    promptType: promptType(prompt.type),
    message: prompt.message,
  };
  if ("placeholder" in prompt && prompt.placeholder)
    event.placeholder = prompt.placeholder;
  const options = promptOptions(prompt);
  if (options) event.options = options;
  return event;
};

const notifyEvent = (event: ProviderLoginEvent): FlowEvent => {
  switch (event.type) {
    case "info":
      return {
        type: "flow.info",
        message: event.message,
        ...(event.links ? { links: event.links } : {}),
      };
    case "auth_url":
      return {
        type: "flow.external_url",
        url: event.url,
        ...(event.instructions ? { instructions: event.instructions } : {}),
      };
    case "device_code":
      return {
        type: "flow.device_code",
        userCode: event.userCode,
        verificationUri: event.verificationUri,
        ...(event.intervalSeconds !== undefined
          ? { intervalSeconds: event.intervalSeconds }
          : {}),
        ...(event.expiresInSeconds !== undefined
          ? { expiresInSeconds: event.expiresInSeconds }
          : {}),
      };
    case "progress":
      return { type: "flow.progress", message: event.message };
  }
};

export const createFlowRegistry = (): FlowRegistry => {
  const flows = new Map<string, FlowState>();
  let activeFlowId: string | undefined;

  const stateFor = (flowId: string): FlowState => {
    const state = flows.get(flowId);
    if (!state) throw new FlowRegistryError("flow_not_found");
    return state;
  };

  const emit = (state: FlowState, event: FlowEvent): void => {
    if (state.terminal) return;
    const envelope = {
      flowId: state.flowId,
      sequence: state.events.length + 1,
      event,
    } satisfies FlowEventEnvelope;
    state.events.push(envelope);
    for (const waiter of [...state.waiters]) {
      if (envelope.sequence <= waiter.after) continue;
      state.waiters.delete(waiter);
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      waiter.resolve(
        state.events.filter((item) => item.sequence > waiter.after),
      );
    }
  };

  const terminal = (state: FlowState, event: FlowEvent): void => {
    if (state.terminal) return;
    if (state.pendingPrompt) {
      state.pendingPrompt.reject(
        new FlowRegistryError("flow_prompt_not_pending"),
      );
      state.pendingPrompt = undefined;
    }
    emit(state, event);
    state.terminal = true;
    if (activeFlowId === state.flowId) activeFlowId = undefined;
  };

  const prompt = async (
    state: FlowState,
    nextPrompt: ProviderLoginPrompt,
  ): Promise<string> => {
    if (state.terminal || state.controller.signal.aborted)
      throw new FlowRegistryError("flow_prompt_not_pending");
    if (state.pendingPrompt)
      throw new FlowRegistryError("flow_prompt_not_pending");
    const promptId = id();
    emit(state, promptEvent(promptId, nextPrompt));
    return await new Promise<string>((resolve, reject) => {
      const abort = () => {
        if (state.pendingPrompt?.promptId === promptId)
          state.pendingPrompt = undefined;
        reject(new FlowRegistryError("flow_prompt_not_pending"));
      };
      nextPrompt.signal?.addEventListener("abort", abort, { once: true });
      state.controller.signal.addEventListener("abort", abort, { once: true });
      state.pendingPrompt = {
        promptId,
        resolve: (response) => {
          nextPrompt.signal?.removeEventListener("abort", abort);
          state.controller.signal.removeEventListener("abort", abort);
          resolve(response);
        },
        reject: (error) => {
          nextPrompt.signal?.removeEventListener("abort", abort);
          state.controller.signal.removeEventListener("abort", abort);
          reject(error);
        },
      };
    });
  };

  return {
    start: (run) => {
      if (activeFlowId) throw new FlowRegistryError("flow_unavailable");
      const flowId = id();
      const state: FlowState = {
        flowId,
        controller: new AbortController(),
        events: [],
        waiters: new Set(),
        terminal: false,
        pendingPrompt: undefined,
      };
      flows.set(flowId, state);
      activeFlowId = flowId;
      emit(state, { type: "flow.started" });
      void (async () => {
        try {
          const status = await run({
            signal: state.controller.signal,
            prompt: (nextPrompt) => prompt(state, nextPrompt),
            notify: (event) => emit(state, notifyEvent(event)),
          });
          terminal(state, {
            type: "flow.completed",
            ...(status ? { status } : {}),
          });
        } catch {
          terminal(
            state,
            state.controller.signal.aborted
              ? { type: "flow.cancelled" }
              : { type: "flow.failed", reason: safeFailureReason },
          );
        }
      })();
      return flowId;
    },
    listEventsAfter: (flowId, after) =>
      stateFor(flowId).events.filter((event) => event.sequence > after),
    waitForEventsAfter: (flowId, after, signal) => {
      const state = stateFor(flowId);
      const existing = state.events.filter((event) => event.sequence > after);
      if (existing.length > 0 || state.terminal)
        return Promise.resolve(existing);
      return new Promise<readonly FlowEventEnvelope[]>((resolve, reject) => {
        const waiter: Waiter = {
          after,
          signal,
          resolve,
          reject,
          onAbort: () => {
            state.waiters.delete(waiter);
            reject(new FlowRegistryError("flow_not_found"));
          },
        };
        state.waiters.add(waiter);
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      });
    },
    respondToPrompt: (flowId, promptId, response) => {
      if (
        typeof response !== "string" ||
        textBytes(response) > MAX_RESPONSE_BYTES
      )
        throw new FlowRegistryError("invalid_flow_response");
      const state = stateFor(flowId);
      const pending = state.pendingPrompt;
      if (!pending || pending.promptId !== promptId)
        throw new FlowRegistryError("flow_prompt_not_pending");
      state.pendingPrompt = undefined;
      pending.resolve(response);
    },
    cancel: (flowId) => {
      const state = stateFor(flowId);
      if (state.terminal) throw new FlowRegistryError("flow_not_found");
      state.controller.abort();
      terminal(state, { type: "flow.cancelled" });
    },
  };
};
