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
  type CreateProjectSessionResult,
  type HostConnectionDescriptor,
  type ListSessionMessagesResult,
  type ProjectId,
  type ProjectSessionCommandId,
  type ProjectSessionSummary,
  type SubmitSessionPromptResult,
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
  readonly listSessionMessages: (
    sessionId: string,
  ) => Promise<ListSessionMessagesResult>;
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
  };
}

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
  };
};
