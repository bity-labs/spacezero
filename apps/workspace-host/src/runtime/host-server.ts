import { NodeHttpServer } from "@effect/platform-node";
import { mkdir, realpath } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";
import { Effect, Exit, Layer, Option, Scope, Stream } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  authorizationError,
  HOST_PROTOCOL_VERSION,
  HostApi,
  parseHostConnectedEvent,
  parseHostConnectionSnapshot,
  flowErrorBody,
  harnessAuthErrorBody,
  projectErrorBody,
  projectSessionErrorBody,
  type FlowError,
  type FlowEventEnvelope,
  type HarnessAuthError,
  type HostAuthorizationError,
  type HostConnectedEvent,
  type ProjectCatalogError,
  type ProjectSessionError,
  type ProjectSessionEventEnvelope,
  type ProjectSessionSseEnvelope,
} from "@spacezero/host-contracts";
import {
  createProjectCatalog,
  ProjectServiceError,
} from "../features/projects/projects.service.js";
import { createSkillDiscoveryService } from "../features/agent-resources/skill-discovery.service.js";
import { createProjectSessionService } from "../features/project-sessions/project-session.service.js";
import { ProjectSessionServiceError } from "../features/project-sessions/project-session.model.js";
import {
  createFileCredentialStore,
  createPiPrivateSessionStateRepository,
  createPiRuntimeServices,
  createProviderAuthService,
  ProviderAuthError,
  type ConversationRunner,
  type PiModelCatalogService,
  type ProviderAuthService,
} from "@spacezero/pi-adapter";
import { runHostDatabaseMigrations } from "./host-database.js";
import {
  createCapabilityService,
  type CapabilityService,
} from "./capability.service.js";
import {
  createFlowRegistry,
  FlowRegistryError,
} from "./flow-registry.service.js";

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
  | "agent-runtime:read"
  | "agent-resources:read"
  | "flows:read"
  | "flows:write"
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
  envelope: ProjectSessionSseEnvelope,
): Uint8Array => {
  if ("sequence" in envelope)
    return textEncoder.encode(
      `id: ${envelope.sequence}\nevent: project-session.event\ndata: ${JSON.stringify(envelope)}\n\n`,
    );
  return textEncoder.encode(
    `event: project-session.live\ndata: ${JSON.stringify(envelope)}\n\n`,
  );
};
const encodeFlowEvent = (envelope: FlowEventEnvelope): Uint8Array =>
  textEncoder.encode(
    `id: ${envelope.sequence}\nevent: flow.event\ndata: ${JSON.stringify(envelope)}\n\n`,
  );
const harnessAuthHttpError = (error: unknown): HarnessAuthError => {
  if (error instanceof ProviderAuthError)
    return harnessAuthErrorBody(error.code);
  return harnessAuthErrorBody("harness_auth_unavailable");
};
const flowHttpError = (error: unknown): FlowError => {
  if (error instanceof FlowRegistryError) return flowErrorBody(error.code);
  return flowErrorBody("flow_unavailable");
};
export const startHostServer = async (options: {
  readonly allowedRendererOrigin: string;
  readonly bootstrap: BootstrapAuthority;
  readonly onShutdown?: () => void;
  readonly databasePath?: string;
  readonly spaceZeroHome?: string;
  readonly harnessAuthDirectory?: string;
  readonly conversationRunner?: ConversationRunner;
  readonly providerAuth?: ProviderAuthService;
  readonly modelCatalog?: PiModelCatalogService;
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
  const providerAuth =
    options.providerAuth ?? createProviderAuthService(credentialStore);
  const piRuntimeServices = createPiRuntimeServices({
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    credentials: credentialStore,
  });
  const modelCatalog = options.modelCatalog ?? piRuntimeServices.modelCatalog;
  const privatePiStateRepository = createPiPrivateSessionStateRepository({
    directory: join(dirname(databasePath), "private-pi-state"),
  });
  const skillDiscovery = createSkillDiscoveryService({ spaceZeroHome });
  const flowRegistry = createFlowRegistry();
  const conversationRunner =
    options.conversationRunner ?? piRuntimeServices.conversationRunner;
  await Effect.runPromise(runHostDatabaseMigrations(databasePath));
  const projectCatalog = createProjectCatalog(databasePath);
  const projectSessions = createProjectSessionService({
    databasePath,
    spaceZeroHome,
    conversationRunner,
    listSessionSkills: skillDiscovery.listSkills,
    privatePiStateRepository,
    ...(options.modelCatalog || !options.conversationRunner
      ? { modelCatalog }
      : {}),
  });
  await projectSessions.reconcile();
  const sessionEventStream = (
    sessionId: string,
    after: number,
    initialEvents: readonly ProjectSessionEventEnvelope[],
    initialLiveCursor: number,
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
      {
        cursor: initial.nextCursor,
        liveCursor: initialLiveCursor,
        first: true,
      },
      (state: {
        readonly cursor: number;
        readonly liveCursor: number;
        readonly first: boolean;
      }) =>
        Effect.tryPromise({
          try: async (signal) => {
            if (Date.now() >= expiresAt) return [[], Option.none()] as const;
            if (state.first) {
              return [
                [initialComment, ...initial.chunks],
                Option.some({
                  cursor: initial.nextCursor,
                  liveCursor: state.liveCursor,
                  first: false,
                }),
              ] as const;
            }
            const timeoutMs = Math.max(0, expiresAt - Date.now());
            const waitSignal = AbortSignal.any([
              signal,
              AbortSignal.timeout(timeoutMs),
            ]);
            const sse = await projectSessions.waitForSseAfter(
              sessionId,
              state.cursor,
              state.liveCursor,
              waitSignal,
            );
            if (Date.now() >= expiresAt || sse.envelopes.length === 0)
              return [[], Option.none()] as const;
            let nextCursor = state.cursor;
            const chunks = sse.envelopes.map((event) => {
              if ("sequence" in event) nextCursor = event.sequence;
              return encodeSessionEvent(event);
            });
            return [
              chunks,
              Option.some({
                cursor: nextCursor,
                liveCursor: sse.liveCursor,
                first: false,
              }),
            ] as const;
          },
          catch: projectSessionHttpError,
        }),
    );
  };

  const flowEventStream = (
    flowId: string,
    after: number,
    expiresAt: number,
  ): Stream.Stream<Uint8Array, FlowError> => {
    const initialComment = textEncoder.encode(": spacezero\n\n");
    const initialEvents = flowRegistry.listEventsAfter(flowId, after);
    const initialCursor = initialEvents.at(-1)?.sequence ?? after;
    return Stream.paginate(
      { cursor: initialCursor, first: true },
      (state: { readonly cursor: number; readonly first: boolean }) =>
        Effect.tryPromise({
          try: async (signal) => {
            if (Date.now() >= expiresAt) return [[], Option.none()] as const;
            if (state.first) {
              return [
                [initialComment, ...initialEvents.map(encodeFlowEvent)],
                Option.some({ cursor: initialCursor, first: false }),
              ] as const;
            }
            const timeoutMs = Math.max(0, expiresAt - Date.now());
            const waitSignal = AbortSignal.any([
              signal,
              AbortSignal.timeout(timeoutMs),
            ]);
            const events = await flowRegistry.waitForEventsAfter(
              flowId,
              state.cursor,
              waitSignal,
            );
            if (Date.now() >= expiresAt || events.length === 0)
              return [[], Option.none()] as const;
            const nextCursor = events.at(-1)?.sequence ?? state.cursor;
            return [
              events.map(encodeFlowEvent),
              Option.some({ cursor: nextCursor, first: false }),
            ] as const;
          },
          catch: flowHttpError,
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
        listProviderAuthOptions: ({ headers, request }) => {
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
          return effectPromise(() => providerAuth.listOptions()).pipe(
            Effect.map((providers) => ({ providers })),
            Effect.mapError(harnessAuthHttpError),
          );
        },
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
        startProviderOAuthLogin: ({ headers, request, params }) => {
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
          return effectPromise(async () => {
            await providerAuth.status(params.providerId);
            const option = (await providerAuth.listOptions()).find(
              (provider) => provider.providerId === params.providerId,
            );
            if (!option?.authMethods.includes("oauth"))
              throw new ProviderAuthError("provider_not_supported");
            const flowId = flowRegistry.start((interaction) =>
              providerAuth.loginOAuth(params.providerId, interaction),
            );
            return { flowId };
          }).pipe(
            Effect.mapError((error) => {
              if (error instanceof FlowRegistryError)
                return harnessAuthErrorBody("harness_auth_unavailable");
              return harnessAuthHttpError(error);
            }),
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
  const agentRuntimeHandlers = HttpApiBuilder.group(
    HostApi,
    "agentRuntime",
    (handlers) =>
      handlers.handleAll({
        listAgentRuntimeModels: ({ headers, request }) => {
          try {
            auth(
              headers.authorization,
              state.cap!,
              "agent-runtime:read",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
          } catch (error) {
            return Effect.fail(error as HostAuthorizationError);
          }
          return effectPromise(() => modelCatalog.listModels()).pipe(
            Effect.map((models) => ({ models })),
            Effect.mapError((error) => {
              if (error instanceof Error)
                return authorizationError("forbidden");
              return authorizationError("forbidden");
            }),
          );
        },
      }),
  );
  const agentResourcesHandlers = HttpApiBuilder.group(
    HostApi,
    "agentResources",
    (handlers) =>
      handlers.handleAll({
        listProjectSessionSkills: ({ headers, request, params }) => {
          try {
            auth(
              headers.authorization,
              state.cap!,
              "agent-resources:read",
              options.allowedRendererOrigin,
              request.headers.origin,
            );
          } catch (error) {
            return Effect.fail(error as HostAuthorizationError);
          }
          return effectPromise(() =>
            projectSessions.listSkills(params.sessionId),
          ).pipe(Effect.mapError(projectSessionHttpError));
        },
      }),
  );
  const flowHandlers = HttpApiBuilder.group(HostApi, "flows", (handlers) =>
    handlers.handleAll({
      subscribeFlowEvents: ({ headers, request, params, query }) => {
        let expiresAt: number | undefined;
        try {
          const token = bearerValue(headers.authorization);
          auth(
            headers.authorization,
            state.cap!,
            "flows:read",
            options.allowedRendererOrigin,
            request.headers.origin,
          );
          expiresAt = token ? state.cap!.expiresAt(token) : undefined;
          if (expiresAt === undefined) throw authorizationError("unauthorized");
          flowRegistry.listEventsAfter(params.flowId, query.after ?? 0);
        } catch (error) {
          if (error instanceof FlowRegistryError)
            return Effect.fail(flowHttpError(error));
          return Effect.fail(error as HostAuthorizationError);
        }
        return Effect.succeed(
          flowEventStream(params.flowId, query.after ?? 0, expiresAt),
        );
      },
      respondToFlowPrompt: ({ headers, request, params, payload }) => {
        try {
          auth(
            headers.authorization,
            state.cap!,
            "flows:write",
            options.allowedRendererOrigin,
            request.headers.origin,
          );
          flowRegistry.respondToPrompt(
            params.flowId,
            params.promptId,
            payload.response,
          );
          return Effect.succeed({ ok: true });
        } catch (error) {
          if (error instanceof FlowRegistryError)
            return Effect.fail(flowHttpError(error));
          return Effect.fail(error as HostAuthorizationError);
        }
      },
      cancelFlow: ({ headers, request, params }) => {
        try {
          auth(
            headers.authorization,
            state.cap!,
            "flows:write",
            options.allowedRendererOrigin,
            request.headers.origin,
          );
          flowRegistry.cancel(params.flowId);
          return Effect.succeed({ status: "cancelled" as const });
        } catch (error) {
          if (error instanceof FlowRegistryError)
            return Effect.fail(flowHttpError(error));
          return Effect.fail(error as HostAuthorizationError);
        }
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
        getProjectSessionRuntime: ({ headers, request, params }) => {
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
            projectSessions.getRuntime(params.sessionId),
          ).pipe(Effect.mapError(projectSessionHttpError));
        },
        updateProjectSessionRuntime: ({
          headers,
          request,
          params,
          payload,
        }) => {
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
            projectSessions.updateRuntime(params.sessionId, payload),
          ).pipe(Effect.mapError(projectSessionHttpError));
        },
        listProjectSessionFollowUps: ({ headers, request, params }) => {
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
            projectSessions.listFollowUps(params.sessionId),
          ).pipe(Effect.mapError(projectSessionHttpError));
        },
        enqueueProjectSessionFollowUp: ({
          headers,
          request,
          params,
          payload,
        }) => {
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
            projectSessions.enqueueFollowUp(params.sessionId, payload),
          ).pipe(Effect.mapError(projectSessionHttpError));
        },
        cancelProjectSessionFollowUp: ({ headers, request, params }) => {
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
            projectSessions.cancelFollowUp(params.sessionId, params.followUpId),
          ).pipe(Effect.mapError(projectSessionHttpError));
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
        interruptSessionTurn: ({ headers, request, params }) => {
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
            projectSessions.interruptTurn(params.sessionId, params.turnId),
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
          const initialLiveCursor = projectSessions.liveCursor(
            params.sessionId,
          );
          return effectPromise(() =>
            projectSessions.listEventsAfter(params.sessionId, query.after),
          ).pipe(
            Effect.map((initialEvents) =>
              sessionEventStream(
                params.sessionId,
                query.after,
                initialEvents,
                initialLiveCursor,
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
        agentRuntimeHandlers,
        agentResourcesHandlers,
        flowHandlers,
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
  const closeHttpServer = async (): Promise<void> => {
    server.closeIdleConnections();
    server.closeAllConnections();
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
    server.unref();
  };
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
      .then(() => closeHttpServer());
    await stopPromise;
  };
  return { server, endpoint, instanceId: id, capabilities: state.cap, stop };
};
