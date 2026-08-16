import { NodeHttpServer } from "@effect/platform-node";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { Effect, Exit, Layer, Scope, Stream } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  authorizationError,
  HOST_PROTOCOL_VERSION,
  HostApi,
  parseHostConnectedEvent,
  parseHostConnectionSnapshot,
  type HostAuthorizationError,
  type HostConnectedEvent,
} from "@spacezero/host-contracts";
import {
  createCapabilityService,
  type CapabilityService,
} from "./capability.service.js";

export interface BootstrapAuthority {
  readonly consume: (candidateSecret: string) => void;
}
export interface StartedHostServer {
  readonly server: Server;
  readonly endpoint: string;
  readonly instanceId: string;
  readonly capabilities: CapabilityService;
  readonly stop: () => Promise<void>;
}

type Scope = "supervisor" | "host:connection:read" | "host:events:subscribe";

const instanceId = (): string => randomBytes(16).toString("hex");
const bearerValue = (authorization: string | undefined): string | undefined => {
  if (!authorization) return undefined;
  const match = /^Bearer ([A-Za-z0-9_-]{32,})$/.exec(authorization);
  return match?.[1];
};
const exactAllowedOrigin = (
  origin: string | undefined,
  allowedRendererOrigin: string,
): origin is string => origin === allowedRendererOrigin;
const auth = (
  authorization: string | undefined,
  cap: CapabilityService,
  scope: Scope,
  allowedRendererOrigin: string,
  origin?: string,
): void => {
  const token = bearerValue(authorization);
  if (!token || !cap.authenticate(token))
    throw authorizationError("unauthorized");
  if (!cap.authorize(token, scope)) throw authorizationError("forbidden");
  if (scope !== "supervisor") {
    if (!exactAllowedOrigin(origin, allowedRendererOrigin))
      throw authorizationError("forbidden");
    return;
  }
  if (origin && !exactAllowedOrigin(origin, allowedRendererOrigin))
    throw authorizationError("forbidden");
};
const effectTry = <A>(run: () => A): Effect.Effect<A, HostAuthorizationError> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(run());
    } catch (error) {
      return Effect.fail(error as HostAuthorizationError);
    }
  });
export const startHostServer = async (options: {
  readonly allowedRendererOrigin: string;
  readonly bootstrap: BootstrapAuthority;
  readonly onShutdown?: () => void;
}): Promise<StartedHostServer> => {
  let stopPromise: Promise<void> | undefined;
  const id = instanceId();
  const state: { cap?: CapabilityService } = {};

  const bootstrapHandlers = HttpApiBuilder.group(
    HostApi,
    "bootstrap",
    (handlers) =>
      handlers.handle("bootstrapSupervisor", ({ headers }) =>
        effectTry(() => {
          const token = bearerValue(headers.authorization);
          if (!token) throw authorizationError("unauthorized");
          try {
            options.bootstrap.consume(token);
          } catch {
            throw authorizationError("unauthorized");
          }
          return { supervisorCapability: state.cap!.issueSupervisor() };
        }),
      ),
  );
  const connectionHandlers = HttpApiBuilder.group(
    HostApi,
    "connection",
    (handlers) =>
      handlers.handleAll({
        connection: ({ headers, request }) =>
          effectTry(() => {
            auth(
              headers.authorization,
              state.cap!,
              "host:connection:read",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
            return parseHostConnectionSnapshot({
              instanceId: id,
              protocolVersion: HOST_PROTOCOL_VERSION,
              status: "ready",
            });
          }),
        events: ({ headers, request }) =>
          effectTry(() => {
            auth(
              headers.authorization,
              state.cap!,
              "host:events:subscribe",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
            const event: HostConnectedEvent = parseHostConnectedEvent({
              type: "host.connected",
              instanceId: id,
              protocolVersion: HOST_PROTOCOL_VERSION,
            });
            return Stream.make(event).pipe(Stream.concat(Stream.never));
          }),
      }),
  );
  const adminHandlers = HttpApiBuilder.group(HostApi, "admin", (handlers) =>
    handlers.handleAll({
      mintClientCapability: ({ headers, request }) =>
        effectTry(() => {
          auth(
            headers.authorization,
            state.cap!,
            "supervisor",
            options.allowedRendererOrigin,
            request.headers.origin,
          );
          return state.cap!.mintClient(bearerValue(headers.authorization)!);
        }),
      shutdown: ({ headers, request }) =>
        effectTry(() => {
          auth(
            headers.authorization,
            state.cap!,
            "supervisor",
            options.allowedRendererOrigin,
            request.headers.origin,
          );
          setTimeout(() => options.onShutdown?.(), 10).unref();
          return { ok: true };
        }),
    }),
  );
  const cors = HttpRouter.middleware(
    HttpMiddleware.cors({
      allowedOrigins: (origin) => origin === options.allowedRendererOrigin,
      allowedMethods: ["GET", "POST"],
      allowedHeaders: ["authorization"],
    }),
    { global: true },
  );
  const routes = Layer.mergeAll(
    HttpApiBuilder.layer(HostApi, { openapiPath: "/openapi.json" }).pipe(
      Layer.provide([bootstrapHandlers, connectionHandlers, adminHandlers]),
    ),
    cors,
  );
  const server = createServer();
  const serverLayer = NodeHttpServer.layer(() => server, {
    host: "127.0.0.1",
    port: 0,
    gracefulShutdownTimeout: "1 second",
  });
  const live = HttpRouter.serve(routes, {
    disableLogger: true,
    disableListenLog: true,
  }).pipe(Layer.provideMerge(serverLayer));
  const scope = await Effect.runPromise(Scope.make());
  try {
    await Effect.runPromise(Layer.buildWithScope(live, scope));
  } catch (error) {
    await Effect.runPromiseExit(Scope.close(scope, Exit.fail(error)));
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string") {
    await Effect.runPromiseExit(
      Scope.close(scope, Exit.fail(new Error("listen failed"))),
    );
    throw new Error("listen failed");
  }
  const endpoint = `http://127.0.0.1:${address.port}/`;
  state.cap = createCapabilityService({ endpoint, instanceId: id });
  const stop = async (): Promise<void> => {
    stopPromise ??= Effect.runPromiseExit(
      Scope.close(scope, Exit.succeed(undefined)),
    ).then(() => undefined);
    await stopPromise;
  };
  return { server, endpoint, instanceId: id, capabilities: state.cap, stop };
};
