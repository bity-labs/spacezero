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
  parseListGlobalChatSessionSkillsResult,
  parseListProjectSessionSkillsResult,
  type HostConnectionDescriptor,
  type ListGlobalChatSessionSkillsResult,
  type ListProjectSessionSkillsResult,
} from "@spacezero/host-contracts";

export interface AgentResourcesClient {
  readonly listSessionSkills: (
    sessionId: string,
  ) => Promise<ListProjectSessionSkillsResult>;
  readonly listGlobalChatSessionSkills: (
    sessionId: string,
  ) => Promise<ListGlobalChatSessionSkillsResult>;
}

export interface AgentResourcesClientOptions {
  readonly getConnectionDescriptor: () => Promise<HostConnectionDescriptor>;
  readonly fetch?: typeof globalThis.fetch;
}

interface GeneratedAgentResourcesApiClient {
  readonly agentResources: {
    readonly listProjectSessionSkills: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly listGlobalChatSessionSkills: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly sessionId: string };
    }) => Effect.Effect<unknown, unknown, never>;
  };
}

const runClient = async <A>(
  descriptor: HostConnectionDescriptor,
  fetchImpl: typeof globalThis.fetch,
  operation: (
    client: GeneratedAgentResourcesApiClient,
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
      client as unknown as GeneratedAgentResourcesApiClient,
    );
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetchImpl),
    Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  );
  return Effect.runPromise(program);
};

export const createAgentResourcesClient = (
  options: AgentResourcesClientOptions,
): AgentResourcesClient => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const descriptor = async () =>
    parseHostConnectionDescriptor(await options.getConnectionDescriptor());
  return {
    listSessionSkills: async (sessionId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.agentResources.listProjectSessionSkills({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId },
        }),
      );
      return parseListProjectSessionSkillsResult(
        Array.isArray(result) ? result[0] : result,
      );
    },
    listGlobalChatSessionSkills: async (sessionId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.agentResources.listGlobalChatSessionSkills({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { sessionId },
        }),
      );
      return parseListGlobalChatSessionSkillsResult(
        Array.isArray(result) ? result[0] : result,
      );
    },
  };
};
