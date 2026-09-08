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
  type HostConnectionDescriptor,
  type GetAgentRuntimeDefaultsResult,
  type ListAgentRuntimeModelsResult,
  type UpdateAgentRuntimeDefaultsRequest,
  type UpdateAgentRuntimeDefaultsResult,
} from "@spacezero/host-contracts";
import { withHostCallDebugLogging } from "../connection/host-call-logging.js";

export interface AgentRuntimeClient {
  readonly listAgentRuntimeModels: () => Promise<ListAgentRuntimeModelsResult>;
  readonly getAgentRuntimeDefaults: () => Promise<GetAgentRuntimeDefaultsResult>;
  readonly updateAgentRuntimeDefaults: (
    request: UpdateAgentRuntimeDefaultsRequest,
  ) => Promise<UpdateAgentRuntimeDefaultsResult>;
}

export interface AgentRuntimeClientOptions {
  readonly getConnectionDescriptor: () => Promise<HostConnectionDescriptor>;
  readonly fetch?: typeof globalThis.fetch;
}

interface GeneratedAgentRuntimeApiClient {
  readonly agentRuntime: {
    readonly listAgentRuntimeModels: (input: {
      readonly headers: { readonly authorization: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly getAgentRuntimeDefaults: (input: {
      readonly headers: { readonly authorization: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly updateAgentRuntimeDefaults: (input: {
      readonly payload: UpdateAgentRuntimeDefaultsRequest;
      readonly headers: { readonly authorization: string };
    }) => Effect.Effect<unknown, unknown, never>;
  };
}

const runClient = async <A>(
  descriptor: HostConnectionDescriptor,
  fetchImpl: typeof globalThis.fetch,
  operation: (
    client: GeneratedAgentRuntimeApiClient,
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
      client as unknown as GeneratedAgentRuntimeApiClient,
    );
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetchImpl),
    Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  );
  return Effect.runPromise(program);
};

export const createAgentRuntimeClient = (
  options: AgentRuntimeClientOptions,
): AgentRuntimeClient => {
  const fetchImpl = options.fetch ?? withHostCallDebugLogging(globalThis.fetch);
  const descriptor = async () =>
    parseHostConnectionDescriptor(await options.getConnectionDescriptor());
  return {
    listAgentRuntimeModels: async () => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.agentRuntime.listAgentRuntimeModels({
          headers: { authorization: `Bearer ${current.clientCapability}` },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as ListAgentRuntimeModelsResult;
    },
    getAgentRuntimeDefaults: async () => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.agentRuntime.getAgentRuntimeDefaults({
          headers: { authorization: `Bearer ${current.clientCapability}` },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as GetAgentRuntimeDefaultsResult;
    },
    updateAgentRuntimeDefaults: async (
      request: UpdateAgentRuntimeDefaultsRequest,
    ) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.agentRuntime.updateAgentRuntimeDefaults({
          payload: request,
          headers: { authorization: `Bearer ${current.clientCapability}` },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as UpdateAgentRuntimeDefaultsResult;
    },
  };
};
