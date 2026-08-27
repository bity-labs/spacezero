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
  parseListProviderAuthOptionsResult,
  parseProviderAuthStatusResult,
  parseStartProviderOAuthLoginResult,
  type HostConnectionDescriptor,
  type ProviderAuthOption,
  type ProviderAuthStatus,
} from "@spacezero/host-contracts";

export interface HarnessAuthClient {
  readonly listProviderAuthOptions: () => Promise<
    readonly ProviderAuthOption[]
  >;
  readonly getProviderAuthStatus: (
    providerId: string,
  ) => Promise<ProviderAuthStatus>;
  readonly startProviderOAuthLogin: (
    providerId: string,
  ) => Promise<{ readonly flowId: string }>;
  readonly setProviderApiKey: (
    providerId: string,
    apiKey: string,
  ) => Promise<ProviderAuthStatus>;
  readonly removeProviderApiKey: (
    providerId: string,
  ) => Promise<ProviderAuthStatus>;
}

export interface HarnessAuthClientOptions {
  readonly getConnectionDescriptor: () => Promise<HostConnectionDescriptor>;
  readonly fetch?: typeof globalThis.fetch;
}

interface GeneratedHarnessAuthApiClient {
  readonly harnessAuth: {
    readonly listProviderAuthOptions: (input: {
      readonly headers: { readonly authorization: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly getProviderAuthStatus: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly providerId: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly startProviderOAuthLogin: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly providerId: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly setProviderApiKey: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly providerId: string };
      readonly payload: { readonly apiKey: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly removeProviderApiKey: (input: {
      readonly headers: { readonly authorization: string };
      readonly params: { readonly providerId: string };
    }) => Effect.Effect<unknown, unknown, never>;
  };
}

export class HarnessAuthClientError extends Error {
  constructor() {
    super("harness authentication request failed");
  }
}

const runClient = async <A>(
  descriptor: HostConnectionDescriptor,
  fetchImpl: typeof globalThis.fetch,
  operation: (
    client: GeneratedHarnessAuthApiClient,
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
    return yield* operation(client as unknown as GeneratedHarnessAuthApiClient);
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetchImpl),
    Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  );
  try {
    return await Effect.runPromise(program);
  } catch {
    throw new HarnessAuthClientError();
  }
};

const statusFromResult = (result: unknown): ProviderAuthStatus =>
  parseProviderAuthStatusResult(Array.isArray(result) ? result[0] : result)
    .status;

const providerOptionsFromResult = (
  result: unknown,
): readonly ProviderAuthOption[] =>
  parseListProviderAuthOptionsResult(Array.isArray(result) ? result[0] : result)
    .providers;

export const createHarnessAuthClient = (
  options: HarnessAuthClientOptions,
): HarnessAuthClient => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const descriptor = async () =>
    parseHostConnectionDescriptor(await options.getConnectionDescriptor());
  return {
    listProviderAuthOptions: async () => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.harnessAuth.listProviderAuthOptions({
          headers: { authorization: `Bearer ${current.clientCapability}` },
        }),
      );
      return providerOptionsFromResult(result);
    },
    getProviderAuthStatus: async (providerId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.harnessAuth.getProviderAuthStatus({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { providerId },
        }),
      );
      return statusFromResult(result);
    },
    startProviderOAuthLogin: async (providerId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.harnessAuth.startProviderOAuthLogin({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { providerId },
        }),
      );
      return parseStartProviderOAuthLoginResult(
        Array.isArray(result) ? result[0] : result,
      );
    },
    setProviderApiKey: async (providerId, apiKey) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.harnessAuth.setProviderApiKey({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { providerId },
          payload: { apiKey },
        }),
      );
      return statusFromResult(result);
    },
    removeProviderApiKey: async (providerId) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.harnessAuth.removeProviderApiKey({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          params: { providerId },
        }),
      );
      return statusFromResult(result);
    },
  };
};
