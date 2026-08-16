import { Effect, flow, Option, Stream } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import {
  HostApi,
  parseHostConnectionDescriptor,
  type HostConnectedEvent,
  type HostConnectionDescriptor,
  type HostConnectionSnapshot,
} from "@spacezero/host-contracts";

export interface HostConnectedResult {
  readonly snapshot: HostConnectionSnapshot;
  readonly event: HostConnectedEvent;
}
export interface LocalHostConnectionClient {
  readonly connect: () => Promise<HostConnectedResult>;
  readonly dispose: () => void;
}
export interface LocalHostConnectionClientOptions {
  readonly acquireDescriptor: () => Promise<HostConnectionDescriptor>;
  readonly fetch?: typeof globalThis.fetch;
  readonly startupTimeoutMs?: number;
}
export class LocalHostConnectionError extends Error {
  constructor(
    readonly code:
      "unauthorized" | "forbidden" | "unavailable" | "protocol_mismatch",
  ) {
    super(code);
  }
}

const isExpired = (descriptor: HostConnectionDescriptor): boolean =>
  Date.now() >= Date.parse(descriptor.expiresAt);
const mapUnknownError = (error: unknown): LocalHostConnectionError => {
  if (error instanceof LocalHostConnectionError) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "unauthorized"
  )
    return new LocalHostConnectionError("unauthorized");
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "forbidden"
  )
    return new LocalHostConnectionError("forbidden");
  return new LocalHostConnectionError("unavailable");
};
const runGeneratedClient = async (
  descriptor: HostConnectionDescriptor,
  timeoutMs: number,
  fetchImpl: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<HostConnectedResult> => {
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
    const snapshot = yield* client.connection.connection({
      headers: { authorization: `Bearer ${descriptor.clientCapability}` },
    });
    const stream = yield* client.connection.events({
      headers: { authorization: `Bearer ${descriptor.clientCapability}` },
    });
    const first = yield* Stream.runHead(stream).pipe(Effect.timeout(timeoutMs));
    const event = Option.getOrThrow(first);
    return { snapshot, event };
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetchImpl),
    Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  );
  return await Effect.runPromise(program, { signal }).catch(
    (error: unknown) => {
      throw mapUnknownError(error);
    },
  );
};
const assertMatchesDescriptor = (
  result: HostConnectedResult,
  descriptor: HostConnectionDescriptor,
): HostConnectedResult => {
  if (
    result.snapshot.instanceId !== descriptor.instanceId ||
    result.event.instanceId !== descriptor.instanceId ||
    result.snapshot.protocolVersion !== descriptor.protocolVersion ||
    result.event.protocolVersion !== descriptor.protocolVersion
  )
    throw new LocalHostConnectionError("protocol_mismatch");
  return result;
};
export const createLocalHostConnectionClient = (
  options: LocalHostConnectionClientOptions,
): LocalHostConnectionClient => {
  const startupTimeoutMs = options.startupTimeoutMs ?? 5000;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let controller: AbortController | undefined;
  return {
    connect: async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      let descriptor = parseHostConnectionDescriptor(
        await options.acquireDescriptor(),
      );
      const connectOnce = async (): Promise<HostConnectedResult> =>
        assertMatchesDescriptor(
          await runGeneratedClient(
            descriptor,
            startupTimeoutMs,
            fetchImpl,
            signal,
          ),
          descriptor,
        );
      try {
        if (isExpired(descriptor))
          throw new LocalHostConnectionError("unauthorized");
        return await connectOnce();
      } catch (error) {
        const mapped = mapUnknownError(error);
        if (mapped.code !== "unauthorized") throw mapped;
        descriptor = parseHostConnectionDescriptor(
          await options.acquireDescriptor(),
        );
        return await connectOnce();
      }
    },
    dispose: () => {
      controller?.abort();
      controller = undefined;
    },
  };
};
