import { Effect, flow } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import {
  HostApi,
  parseHostConnectionDescriptor,
  parseProjectSessionEventEnvelope,
  parseProjectSessionLiveEventEnvelope,
  type CancelProjectSessionFollowUpResult,
  type CreateProjectSessionResult,
  type EnqueueProjectSessionFollowUpResult,
  type InterruptProjectSessionTurnResult,
  type HostConnectionDescriptor,
  type GetProjectSessionRuntimeResult,
  type ListProjectSessionFollowUpsResult,
  type ListSessionMessagesResult,
  type ProjectId,
  type ProjectSessionCommandId,
  type ProjectSessionEventEnvelope,
  type ProjectSessionLiveEventEnvelope,
  type ProjectSessionSummary,
  type SubmitSessionPromptResult,
  type UpdateProjectSessionRuntimeResult,
} from "@spacezero/host-contracts";

export interface ProjectSessionClient {
  readonly listProjectSessions: () => Promise<readonly ProjectSessionSummary[]>;
  readonly createProjectSession: (
    projectId: ProjectId,
  ) => Promise<CreateProjectSessionResult>;
  readonly submitPrompt: (
    sessionId: string,
    prompt: string,
  ) => Promise<SubmitSessionPromptResult>;
  readonly getRuntime: (
    sessionId: string,
  ) => Promise<GetProjectSessionRuntimeResult>;
  readonly updateRuntime: (
    sessionId: string,
    input: {
      readonly providerId: string;
      readonly modelId: string;
      readonly defaultThinkingLevel:
        "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
      readonly expectedRevision: number;
    },
  ) => Promise<UpdateProjectSessionRuntimeResult>;
  readonly listFollowUps: (
    sessionId: string,
  ) => Promise<ListProjectSessionFollowUpsResult>;
  readonly enqueueFollowUp: (
    sessionId: string,
    prompt: string,
  ) => Promise<EnqueueProjectSessionFollowUpResult>;
  readonly cancelFollowUp: (
    sessionId: string,
    followUpId: string,
  ) => Promise<CancelProjectSessionFollowUpResult>;
  readonly listSessionMessages: (
    sessionId: string,
  ) => Promise<ListSessionMessagesResult>;
  readonly interruptTurn: (
    sessionId: string,
    turnId: string,
  ) => Promise<InterruptProjectSessionTurnResult>;
  readonly subscribeProjectSessionEvents: (
    input: SubscribeProjectSessionEventsInput,
  ) => ProjectSessionEventSubscription;
}

export interface SubscribeProjectSessionEventsInput {
  readonly sessionId: string;
  readonly after: number;
  readonly onEvent: (event: ProjectSessionEventEnvelope) => void;
  readonly onLiveEvent?: (event: ProjectSessionLiveEventEnvelope) => void;
  readonly onError?: (error: Error) => void;
}

export interface ProjectSessionEventSubscription {
  readonly cancel: () => void;
  readonly closed: Promise<void>;
}

export interface ProjectSessionClientOptions {
  readonly getConnectionDescriptor: () => Promise<HostConnectionDescriptor>;
  readonly createCommandId?: () => ProjectSessionCommandId;
  readonly fetch?: typeof globalThis.fetch;
}

interface GeneratedProjectSessionApiClient {
  readonly projectSessions: {
    readonly listProjectSessions: (input: {
      readonly headers: { readonly authorization: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly createProjectSession: (input: {
      readonly headers: { readonly authorization: string };
      readonly payload: {
        readonly commandId: string;
        readonly projectId: string;
      };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly getProjectSessionRuntime: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly updateProjectSessionRuntime: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string };
      readonly payload: {
        readonly commandId: string;
        readonly providerId: string;
        readonly modelId: string;
        readonly defaultThinkingLevel:
          "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
        readonly expectedRevision: number;
      };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly listProjectSessionFollowUps: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly enqueueProjectSessionFollowUp: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string };
      readonly payload: {
        readonly commandId: string;
        readonly prompt: string;
      };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly cancelProjectSessionFollowUp: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: {
        readonly sessionId: string;
        readonly followUpId: string;
      };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly submitSessionPrompt: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string };
      readonly payload: {
        readonly commandId: string;
        readonly prompt: string;
      };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly listSessionMessages: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly interruptSessionTurn: (input: {
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
  ProjectSessionEventEnvelope | ProjectSessionLiveEventEnvelope | undefined => {
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
  if (eventName === "project-session.live")
    return parseProjectSessionLiveEventEnvelope(value);
  const envelope = parseProjectSessionEventEnvelope(value);
  if (id !== undefined && id !== String(envelope.sequence))
    throw new Error("invalid project session event id");
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

const runProjectSessionEventSubscription = async (
  input: SubscribeProjectSessionEventsInput,
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
        `/v1/project-sessions/${input.sessionId}/events`,
        descriptor.endpoint,
      );
      url.searchParams.set("after", String(cursor));
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${descriptor.clientCapability}` },
        signal,
      });
      if (!response.ok || !response.body)
        throw new Error("project session event subscription unavailable");
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
          : new Error("project session event subscription failed"),
      );
      await delay(100, signal);
    }
  }
};

const runClient = async <A>(
  descriptor: HostConnectionDescriptor,
  fetchImpl: typeof globalThis.fetch,
  operation: (
    client: GeneratedProjectSessionApiClient,
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
      client as unknown as GeneratedProjectSessionApiClient,
    );
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetchImpl),
    Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  );
  return Effect.runPromise(program);
};

export const createProjectSessionClient = (
  options: ProjectSessionClientOptions,
): ProjectSessionClient => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const createCommandId =
    options.createCommandId ?? (() => globalThis.crypto.randomUUID());
  const descriptor = async () =>
    parseHostConnectionDescriptor(await options.getConnectionDescriptor());
  return {
    listProjectSessions: async () => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.projectSessions.listProjectSessions({
          headers: { authorization: `Bearer ${current.clientCapability}` },
        }),
      );
      const body = Array.isArray(result) ? result[0] : result;
      return (body as { readonly sessions: readonly ProjectSessionSummary[] })
        .sessions;
    },
    createProjectSession: async (projectId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.projectSessions.createProjectSession({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          payload: { commandId: createCommandId(), projectId },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as CreateProjectSessionResult;
    },
    submitPrompt: async (sessionId, prompt) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.projectSessions.submitSessionPrompt({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId },
          payload: { commandId: createCommandId(), prompt },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as SubmitSessionPromptResult;
    },
    getRuntime: async (sessionId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.projectSessions.getProjectSessionRuntime({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as GetProjectSessionRuntimeResult;
    },
    updateRuntime: async (sessionId, input) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.projectSessions.updateProjectSessionRuntime({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId },
          payload: { commandId: createCommandId(), ...input },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as UpdateProjectSessionRuntimeResult;
    },
    listFollowUps: async (sessionId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.projectSessions.listProjectSessionFollowUps({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as ListProjectSessionFollowUpsResult;
    },
    enqueueFollowUp: async (sessionId, prompt) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.projectSessions.enqueueProjectSessionFollowUp({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId },
          payload: { commandId: createCommandId(), prompt },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as EnqueueProjectSessionFollowUpResult;
    },
    cancelFollowUp: async (sessionId, followUpId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.projectSessions.cancelProjectSessionFollowUp({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId, followUpId },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as CancelProjectSessionFollowUpResult;
    },
    listSessionMessages: async (sessionId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.projectSessions.listSessionMessages({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as ListSessionMessagesResult;
    },
    interruptTurn: async (sessionId, turnId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.projectSessions.interruptSessionTurn({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId, turnId },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as InterruptProjectSessionTurnResult;
    },
    subscribeProjectSessionEvents: (input) => {
      const controller = new AbortController();
      const closed = runProjectSessionEventSubscription(
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
