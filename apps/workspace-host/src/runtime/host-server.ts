import { NodeHttpServer } from "@effect/platform-node";
import { mkdir, realpath } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { Effect, Exit, Layer, Option, Scope, Stream } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  authorizationError,
  HOST_PROTOCOL_VERSION,
  HostApi,
  parseHostConnectedEvent,
  parseHostConnectionSnapshot,
  harnessAuthErrorBody,
  projectErrorBody,
  projectSessionErrorBody,
  type HarnessAuthError,
  type HostAuthorizationError,
  type HostConnectedEvent,
  type ProjectCatalogError,
  type ProjectSessionError,
  type ProjectSessionEventEnvelope,
} from "@spacezero/host-contracts";
import {
  createProjectCatalog,
  ProjectServiceError,
} from "../features/projects/projects.service.js";
import { createProjectSessionService } from "../features/project-sessions/project-session.service.js";
import { ProjectSessionServiceError } from "../features/project-sessions/project-session.model.js";
import {
  createFileCredentialStore,
  createPiConversationRunner,
  createProviderAuthService,
  ProviderAuthError,
  type ConversationRunner,
} from "@spacezero/pi-adapter";
import { runHostDatabaseMigrations } from "./host-database.js";
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

type AuthScope =
  | "supervisor"
  | "host:connection:read"
  | "host:events:subscribe"
  | "projects:read"
  | "projects:register"
  | "harness-auth:read"
  | "harness-auth:write"
  | "project-sessions:read"
  | "project-sessions:create"
  | "project-sessions:prompt";

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
  scope: AuthScope,
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
const effectTry = <A, E = HostAuthorizationError>(
  run: () => A,
): Effect.Effect<A, E> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(run());
    } catch (error) {
      return Effect.fail(error as E);
    }
  });
const effectPromise = <A, E>(
  run: (signal: AbortSignal) => Promise<A>,
): Effect.Effect<A, E> =>
  Effect.tryPromise({
    try: run,
    catch: (error) => error as E,
  });
const projectHttpError = (error: unknown): ProjectCatalogError => {
  if (error instanceof ProjectServiceError) {
    if (error.code === "project_not_found")
      return projectErrorBody("project_catalog_unavailable");
    return projectErrorBody(error.code);
  }
  return projectErrorBody("project_catalog_unavailable");
};
const projectSessionHttpError = (error: unknown): ProjectSessionError => {
  if (error instanceof ProjectSessionServiceError)
    return projectSessionErrorBody(error.code);
  return projectSessionErrorBody("project_session_catalog_unavailable");
};
const textEncoder = new TextEncoder();
const encodeSessionEvent = (
  envelope: ProjectSessionEventEnvelope,
): Uint8Array =>
  textEncoder.encode(
    `id: ${envelope.sequence}\nevent: project-session.event\ndata: ${JSON.stringify(envelope)}\n\n`,
  );
const harnessAuthHttpError = (error: unknown): HarnessAuthError => {
  if (error instanceof ProviderAuthError)
    return harnessAuthErrorBody(error.code);
  return harnessAuthErrorBody("harness_auth_unavailable");
};
export const startHostServer = async (options: {
  readonly allowedRendererOrigin: string;
  readonly bootstrap: BootstrapAuthority;
  readonly onShutdown?: () => void;
  readonly databasePath?: string;
  readonly spaceZeroHome?: string;
  readonly harnessAuthDirectory?: string;
  readonly conversationRunner?: ConversationRunner;
  readonly clientCapabilityTtlMs?: number;
}): Promise<StartedHostServer> => {
  let stopPromise: Promise<void> | undefined;
  const id = instanceId();
  const state: { cap?: CapabilityService } = {};
  const databasePath =
    options.databasePath ?? join(process.cwd(), "workspace-host.sqlite");
  const configuredHome =
    options.spaceZeroHome ?? join(process.cwd(), "SpaceZero");
  if (
    configuredHome.length === 0 ||
    configuredHome.includes("\0") ||
    !isAbsolute(configuredHome) ||
    Buffer.byteLength(configuredHome, "utf8") > 4096
  )
    throw new Error("invalid Space Zero Home");
  await mkdir(configuredHome, { recursive: true });
  const spaceZeroHome = await realpath(configuredHome);
  await mkdir(join(spaceZeroHome, "worktrees"), { recursive: true });
  const harnessAuthDirectory =
    options.harnessAuthDirectory ?? join(process.cwd(), "harness-auth");
  const credentialStore = createFileCredentialStore({
    directory: harnessAuthDirectory,
  });
  const providerAuth = createProviderAuthService(credentialStore);
  const conversationRunner =
    options.conversationRunner ??
    createPiConversationRunner({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      credentials: credentialStore,
    });
  await Effect.runPromise(runHostDatabaseMigrations(databasePath));
  const projectCatalog = createProjectCatalog(databasePath);
  const projectSessions = createProjectSessionService({
    databasePath,
    spaceZeroHome,
    conversationRunner,
  });
  await projectSessions.reconcile();
  const sessionEventStream = (
    sessionId: string,
    after: number,
    initialEvents: readonly ProjectSessionEventEnvelope[],
    expiresAt: number,
  ): Stream.Stream<Uint8Array, ProjectSessionError> => {
    const initialComment = textEncoder.encode(": spacezero\n\n");
    const encodeEvents = (events: readonly ProjectSessionEventEnvelope[]) => {
      let nextCursor = after;
      const chunks = events.map((event) => {
        nextCursor = event.sequence;
        return encodeSessionEvent(event);
      });
      return { chunks, nextCursor };
    };
    const initial = encodeEvents(initialEvents);
    return Stream.paginate(
      { cursor: initial.nextCursor, first: true },
      (state: { readonly cursor: number; readonly first: boolean }) =>
        Effect.tryPromise({
          try: async (signal) => {
            if (Date.now() >= expiresAt) return [[], Option.none()] as const;
            if (state.first) {
              return [
                [initialComment, ...initial.chunks],
                Option.some({ cursor: initial.nextCursor, first: false }),
              ] as const;
            }
            const timeoutMs = Math.max(0, expiresAt - Date.now());
            const waitSignal = AbortSignal.any([
              signal,
              AbortSignal.timeout(timeoutMs),
            ]);
            const eventRows = await projectSessions.waitForEventsAfter(
              sessionId,
              state.cursor,
              waitSignal,
            );
            if (Date.now() >= expiresAt || eventRows.length === 0)
              return [[], Option.none()] as const;
            let nextCursor = state.cursor;
            const chunks = eventRows.map((event) => {
              nextCursor = event.sequence;
              return encodeSessionEvent(event);
            });
            return [
              chunks,
              Option.some({ cursor: nextCursor, first: false }),
            ] as const;
          },
          catch: projectSessionHttpError,
        }),
    );
  };

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
  const harnessAuthHandlers = HttpApiBuilder.group(
    HostApi,
    "harnessAuth",
    (handlers) =>
      handlers.handleAll({
        getProviderAuthStatus: ({ headers, request, params }) => {
          try {
            auth(
              headers.authorization,
              state.cap!,
              "harness-auth:read",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
          } catch (error) {
            return Effect.fail(error as HostAuthorizationError);
          }
          return effectPromise(() =>
            providerAuth.status(params.providerId),
          ).pipe(
            Effect.map((status) => ({ status })),
            Effect.mapError(harnessAuthHttpError),
          );
        },
        setProviderApiKey: ({ headers, request, params, payload }) => {
          try {
            auth(
              headers.authorization,
              state.cap!,
              "harness-auth:write",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
          } catch (error) {
            return Effect.fail(error as HostAuthorizationError);
          }
          return effectPromise(() =>
            providerAuth.setApiKey(params.providerId, payload.apiKey),
          ).pipe(
            Effect.map((status) => ({ status })),
            Effect.mapError(harnessAuthHttpError),
          );
        },
        removeProviderApiKey: ({ headers, request, params }) => {
          try {
            auth(
              headers.authorization,
              state.cap!,
              "harness-auth:write",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
          } catch (error) {
            return Effect.fail(error as HostAuthorizationError);
          }
          return effectPromise(() =>
            providerAuth.removeApiKey(params.providerId),
          ).pipe(
            Effect.map((status) => ({ status })),
            Effect.mapError(harnessAuthHttpError),
          );
        },
      }),
  );
  const projectHandlers = HttpApiBuilder.group(
    HostApi,
    "projects",
    (handlers) =>
      handlers.handleAll({
        registerProject: ({ headers, request, payload }) => {
          try {
            auth(
              headers.authorization,
              state.cap!,
              "projects:register",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
          } catch (error) {
            return Effect.fail(error as HostAuthorizationError);
          }
          return effectPromise((signal) =>
            projectCatalog.register(payload, signal),
          ).pipe(Effect.mapError(projectHttpError));
        },
        listProjects: ({ headers, request }) => {
          try {
            auth(
              headers.authorization,
              state.cap!,
              "projects:read",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
          } catch (error) {
            return Effect.fail(error as HostAuthorizationError);
          }
          return effectPromise(() => projectCatalog.list()).pipe(
            Effect.mapError(projectHttpError),
          );
        },
      }),
  );
  const projectSessionHandlers = HttpApiBuilder.group(
    HostApi,
    "projectSessions",
    (handlers) =>
      handlers.handleAll({
        createProjectSession: ({ headers, request, payload }) => {
          try {
            auth(
              headers.authorization,
              state.cap!,
              "project-sessions:create",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
          } catch (error) {
            return Effect.fail(error as HostAuthorizationError);
          }
          return effectPromise(() => projectSessions.create(payload)).pipe(
            Effect.mapError(projectSessionHttpError),
          );
        },
        listProjectSessions: ({ headers, request }) => {
          try {
            auth(
              headers.authorization,
              state.cap!,
              "project-sessions:read",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
          } catch (error) {
            return Effect.fail(error as HostAuthorizationError);
          }
          return effectPromise(() => projectSessions.list()).pipe(
            Effect.mapError(projectSessionHttpError),
          );
        },
        submitSessionPrompt: ({ headers, request, params, payload }) => {
          try {
            auth(
              headers.authorization,
              state.cap!,
              "project-sessions:prompt",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
          } catch (error) {
            return Effect.fail(error as HostAuthorizationError);
          }
          return effectPromise(() =>
            projectSessions.submitPrompt({
              sessionId: params.sessionId,
              commandId: payload.commandId,
              prompt: payload.prompt,
            }),
          ).pipe(Effect.mapError(projectSessionHttpError));
        },
        listSessionMessages: ({ headers, request, params }) => {
          try {
            auth(
              headers.authorization,
              state.cap!,
              "project-sessions:read",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
          } catch (error) {
            return Effect.fail(error as HostAuthorizationError);
          }
          return effectPromise(() =>
            projectSessions.listMessages(params.sessionId),
          ).pipe(Effect.mapError(projectSessionHttpError));
        },
        subscribeProjectSessionEvents: ({
          headers,
          request,
          params,
          query,
        }) => {
          let expiresAt: number | undefined;
          try {
            const token = bearerValue(headers.authorization);
            auth(
              headers.authorization,
              state.cap!,
              "project-sessions:read",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
            expiresAt = token ? state.cap!.expiresAt(token) : undefined;
            if (expiresAt === undefined)
              throw authorizationError("unauthorized");
          } catch (error) {
            return Effect.fail(error as HostAuthorizationError);
          }
          return effectPromise(() =>
            projectSessions.listEventsAfter(params.sessionId, query.after),
          ).pipe(
            Effect.map((initialEvents) =>
              sessionEventStream(
                params.sessionId,
                query.after,
                initialEvents,
                expiresAt,
              ),
            ),
            Effect.mapError(projectSessionHttpError),
          );
        },
      }),
  );
  const cors = HttpRouter.middleware(
    HttpMiddleware.cors({
      allowedOrigins: (origin) => origin === options.allowedRendererOrigin,
      allowedMethods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["authorization", "content-type"],
    }),
    { global: true },
  );
  const routes = Layer.mergeAll(
    HttpApiBuilder.layer(HostApi, { openapiPath: "/openapi.json" }).pipe(
      Layer.provide([
        bootstrapHandlers,
        connectionHandlers,
        adminHandlers,
        harnessAuthHandlers,
        projectHandlers,
        projectSessionHandlers,
      ]),
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
    await projectSessions.waitForIdle();
    await Effect.runPromiseExit(
      Scope.close(scope, Exit.fail(new Error("listen failed"))),
    );
    throw new Error("listen failed");
  }
  const endpoint = `http://127.0.0.1:${address.port}/`;
  state.cap = createCapabilityService({
    endpoint,
    instanceId: id,
    ...(options.clientCapabilityTtlMs === undefined
      ? {}
      : { clientTtlMs: options.clientCapabilityTtlMs }),
  });
  const stop = async (): Promise<void> => {
    stopPromise ??= projectSessions
      .waitForIdle()
      .then(() =>
        Effect.runPromiseExit(Scope.close(scope, Exit.succeed(undefined))),
      )
      .then(() => undefined);
    await stopPromise;
  };
  return { server, endpoint, instanceId: id, capabilities: state.cap, stop };
};
