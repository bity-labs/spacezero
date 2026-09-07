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
  type ProjectCommandId,
  type ProjectSummary,
  type RegisterProjectResult,
} from "@spacezero/host-contracts";
import { withHostCallDebugLogging } from "../connection/host-call-logging.js";

export interface ProjectCatalogClient {
  readonly listProjects: () => Promise<readonly ProjectSummary[]>;
  readonly registerProject: (path: string) => Promise<RegisterProjectResult>;
}

export interface ProjectCatalogClientOptions {
  readonly getConnectionDescriptor: () => Promise<HostConnectionDescriptor>;
  readonly createCommandId?: () => ProjectCommandId;
  readonly fetch?: typeof globalThis.fetch;
}

interface GeneratedProjectApiClient {
  readonly projects: {
    readonly listProjects: (input: {
      readonly headers: { readonly authorization: string };
    }) => Effect.Effect<unknown, unknown, never>;
    readonly registerProject: (input: {
      readonly headers: { readonly authorization: string };
      readonly payload: { readonly commandId: string; readonly path: string };
    }) => Effect.Effect<unknown, unknown, never>;
  };
}

const runClient = async <A>(
  descriptor: HostConnectionDescriptor,
  fetchImpl: typeof globalThis.fetch,
  operation: (
    client: GeneratedProjectApiClient,
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
    return yield* operation(client as unknown as GeneratedProjectApiClient);
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetchImpl),
    Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  );
  return Effect.runPromise(program);
};

export const createProjectCatalogClient = (
  options: ProjectCatalogClientOptions,
): ProjectCatalogClient => {
  const fetchImpl = options.fetch ?? withHostCallDebugLogging(globalThis.fetch);
  const createCommandId =
    options.createCommandId ?? (() => globalThis.crypto.randomUUID());
  const descriptor = async () =>
    parseHostConnectionDescriptor(await options.getConnectionDescriptor());
  return {
    listProjects: async () => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.projects.listProjects({
          headers: { authorization: `Bearer ${current.clientCapability}` },
        }),
      );
      const body = Array.isArray(result) ? result[0] : result;
      return (body as { readonly projects: readonly ProjectSummary[] })
        .projects;
    },
    registerProject: async (path) => {
      const current = await descriptor();
      const result = await runClient(current, fetchImpl, (client) =>
        client.projects.registerProject({
          headers: { authorization: `Bearer ${current.clientCapability}` },
          payload: { commandId: createCommandId(), path },
        }),
      );
      return (
        Array.isArray(result) ? result[0] : result
      ) as RegisterProjectResult;
    },
  };
};
