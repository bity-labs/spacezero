import { mkdir } from "node:fs/promises";
import type {
  CancelProjectSessionFollowUpResult,
  CreateProjectSessionRequest,
  CreateProjectSessionResult,
  EnqueueProjectSessionFollowUpRequest,
  EnqueueProjectSessionFollowUpResult,
  ListProjectSessionFollowUpsResult,
  ListProjectSessionsResult,
  ListProjectSessionSkillsResult,
  ProjectSessionErrorCode,
  ProjectSessionEventEnvelope,
  ProjectSessionLiveEventEnvelope,
  ProjectSessionSseEnvelope,
  ProjectSessionTurn,
  SessionMessage,
  SubmitSessionPromptResult,
  InterruptProjectSessionTurnResult,
  GetProjectSessionRuntimeResult,
  UpdateProjectSessionRuntimeRequest,
  UpdateProjectSessionRuntimeResult,
} from "@spacezero/host-contracts";
import {
  PiModelCatalogError,
  createScriptedConversationRunner,
  type ConversationRunner,
  type PiModelCatalogService,
  type PiPrivateSessionStateRepository,
} from "@spacezero/pi-adapter";
import {
  ProjectServiceError,
  createProjectAuthority,
} from "../projects/projects.service.js";
import {
  authenticateManagedWorktree,
  createManagedWorktree,
} from "./project-session-worktree.adapter.js";
import {
  ProjectSessionServiceError,
  type PreparedWorktreeIdentity,
  type SubmitSessionPromptInput,
} from "./project-session.model.js";
import { toPublicProjectSessionEvent } from "./project-session-event.internal.js";
import {
  createProjectSessionRepository,
  type SessionWorktreeIdentity,
} from "./project-session.repository.js";
import type { SkillDiscoveryResult } from "../agent-resources/skill-discovery.service.js";
import type { SessionNameEntropy } from "./project-session-name.service.js";
import { createWorkspaceToolRegistry } from "./workspace-tool-registry.js";
import { createChatTurnRunner } from "../chat-sessions/chat-turn-runner.service.js";

export interface ProjectSessionService {
  readonly create: (
    input: CreateProjectSessionRequest,
  ) => Promise<CreateProjectSessionResult>;
  readonly list: () => Promise<ListProjectSessionsResult>;
  readonly submitPrompt: (
    input: SubmitSessionPromptInput,
  ) => Promise<SubmitSessionPromptResult>;
  readonly getRuntime: (
    sessionId: string,
  ) => Promise<GetProjectSessionRuntimeResult>;
  readonly updateRuntime: (
    sessionId: string,
    input: UpdateProjectSessionRuntimeRequest,
  ) => Promise<UpdateProjectSessionRuntimeResult>;
  readonly listFollowUps: (
    sessionId: string,
  ) => Promise<ListProjectSessionFollowUpsResult>;
  readonly enqueueFollowUp: (
    sessionId: string,
    input: EnqueueProjectSessionFollowUpRequest,
  ) => Promise<EnqueueProjectSessionFollowUpResult>;
  readonly cancelFollowUp: (
    sessionId: string,
    followUpId: string,
  ) => Promise<CancelProjectSessionFollowUpResult>;
  readonly listSkills: (
    sessionId: string,
  ) => Promise<ListProjectSessionSkillsResult>;
  readonly listMessages: (sessionId: string) => Promise<{
    readonly session: SubmitSessionPromptResult["session"];
    readonly messages: readonly SessionMessage[];
    readonly activeTurn?: ProjectSessionTurn;
    readonly latestTurn?: ProjectSessionTurn;
  }>;
  readonly listEventsAfter: (
    sessionId: string,
    after: number,
  ) => Promise<readonly ProjectSessionEventEnvelope[]>;
  readonly waitForSseAfter: (
    sessionId: string,
    after: number,
    afterLive: number,
    signal?: AbortSignal,
  ) => Promise<{
    readonly envelopes: readonly ProjectSessionSseEnvelope[];
    readonly liveCursor: number;
  }>;
  readonly liveCursor: (sessionId: string) => number;
  readonly interruptTurn: (
    sessionId: string,
    turnId: string,
  ) => Promise<InterruptProjectSessionTurnResult>;
  readonly reconcile: () => Promise<void>;
  readonly waitForIdle: () => Promise<void>;
}

const mapProjectError = (
  error: ProjectServiceError,
): ProjectSessionErrorCode => {
  switch (error.code) {
    case "project_not_found":
      return "project_not_found";
    case "invalid_project_path":
    case "not_git_repository":
      return "project_repository_unavailable";
    case "repository_has_no_commit":
      return "source_revision_unavailable";
    case "repository_identity_mismatch":
      return "project_repository_identity_mismatch";
    case "command_id_conflict":
      return "command_id_conflict";
    case "project_catalog_unavailable":
      return "project_session_catalog_unavailable";
  }
};

const mapModelCatalogError = (
  error: PiModelCatalogError,
): ProjectSessionErrorCode => {
  switch (error.code) {
    case "provider_not_authenticated":
      return "agent_authentication_required";
    case "model_not_found":
    case "model_unavailable":
    case "thinking_level_unsupported":
      return "agent_configuration_invalid";
  }
};

const mapError = (error: unknown): ProjectSessionServiceError => {
  if (error instanceof ProjectSessionServiceError) return error;
  if (error instanceof ProjectServiceError)
    return new ProjectSessionServiceError(mapProjectError(error));
  if (error instanceof PiModelCatalogError)
    return new ProjectSessionServiceError(mapModelCatalogError(error));
  return new ProjectSessionServiceError("project_session_catalog_unavailable");
};

export const createProjectSessionService = (options: {
  readonly databasePath: string;
  readonly spaceZeroHome: string;
  readonly entropy?: SessionNameEntropy;
  readonly conversationRunner?: ConversationRunner;
  readonly modelCatalog?: PiModelCatalogService;
  readonly privatePiStateRepository?: PiPrivateSessionStateRepository;
  readonly listSessionSkills?: (input: {
    readonly sessionId: string;
    readonly projectRoot: string;
    readonly projectTrusted: boolean;
  }) => Promise<SkillDiscoveryResult>;
}): ProjectSessionService => {
  const projectAuthority = createProjectAuthority(options.databasePath);
  const repository = createProjectSessionRepository(options);
  const workspaceTools = createWorkspaceToolRegistry();
  const conversationRunner =
    options.conversationRunner ?? createScriptedConversationRunner();
  const modelCatalog = options.modelCatalog;
  const locks = new Map<string, Promise<unknown>>();
  const sessionLocks = new Map<string, Promise<unknown>>();
  const drainingSessions = new Set<string>();
  const inFlight = new Set<Promise<unknown>>();
  const turnRunner = createChatTurnRunner<
    ProjectSessionEventEnvelope,
    ProjectSessionLiveEventEnvelope
  >({
    conversationRunner,
    ...(options.privatePiStateRepository === undefined
      ? {}
      : { privatePiStateRepository: options.privatePiStateRepository }),
  });
  let shuttingDown = false;

  const withLock = async <A>(
    registry: Map<string, Promise<unknown>>,
    key: string,
    run: () => Promise<A>,
  ) => {
    const previous = registry.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(run);
    registry.set(key, current);
    try {
      return await current;
    } finally {
      if (registry.get(key) === current) registry.delete(key);
    }
  };
  const withProjectLock = async <A>(projectId: string, run: () => Promise<A>) =>
    withLock(locks, projectId, run);
  const withSessionLock = async <A>(sessionId: string, run: () => Promise<A>) =>
    withLock(sessionLocks, sessionId, run);
  const wakeEvents = turnRunner.wakeEvents;
  const toEnvelopes = (
    events: Awaited<ReturnType<typeof repository.listEventsAfter>>,
  ): readonly ProjectSessionEventEnvelope[] =>
    events.map((event) => {
      const publicEvent = toPublicProjectSessionEvent(event.event);
      return {
        sequence: event.sequence,
        eventType: publicEvent.type,
        event: publicEvent,
      };
    });
  const liveCursor = turnRunner.liveCursor;
  const waitForSseAfter = async (
    sessionId: string,
    after: number,
    afterLive: number,
    signal?: AbortSignal,
  ): Promise<{
    readonly envelopes: readonly ProjectSessionSseEnvelope[];
    readonly liveCursor: number;
  }> => turnRunner.waitForSseAfter(
    sessionId,
    after,
    afterLive,
    async (id, cursor) => toEnvelopes(await repository.listEventsAfter(id, cursor)),
    signal,
  );

  const create = async (
    input: CreateProjectSessionRequest,
  ): Promise<CreateProjectSessionResult> =>
    withProjectLock(input.projectId, async () => {
      try {
        const project = await projectAuthority.authenticateProject(
          input.projectId,
        );
        const admission = await repository.replayOrAdmit(input, project);
        if (admission.kind === "replayed")
          return { session: admission.session };
        await options.privatePiStateRepository?.create({
          id: admission.session.id,
          conversationId: admission.session.id,
        });
        await mkdir(admission.worktreeRoot, { recursive: true });
        const operation = createManagedWorktree({
          project,
          worktreePath: admission.worktreePath,
          managedBranch: admission.session.managedBranch,
          sourceCommit: admission.session.sourceCommit,
        })
          .then((prepared) =>
            repository.markReady(
              input.commandId,
              admission.session.id,
              prepared,
            ),
          )
          .catch(() =>
            repository.markRecoveryRequired(
              input.commandId,
              admission.session.id,
            ),
          );
        inFlight.add(operation);
        operation.finally(() => inFlight.delete(operation));
        const result = await operation;
        wakeEvents(admission.session.id);
        return result;
      } catch (error) {
        throw mapError(error);
      }
    });

  const assertPersistedIdentity = (
    persisted: SessionWorktreeIdentity,
    prepared: PreparedWorktreeIdentity,
  ): void => {
    if (
      persisted.canonicalWorktreePath !== prepared.canonicalWorktreePath ||
      persisted.canonicalGitDirPath !== prepared.canonicalGitDirPath ||
      persisted.canonicalGitCommonDirPath !==
        prepared.canonicalGitCommonDirPath ||
      persisted.worktreeDeviceId !== prepared.worktreeDeviceId ||
      persisted.worktreeFileId !== prepared.worktreeFileId ||
      persisted.gitDirDeviceId !== prepared.gitDirDeviceId ||
      persisted.gitDirFileId !== prepared.gitDirFileId ||
      persisted.commonDirDeviceId !== prepared.commonDirDeviceId ||
      persisted.commonDirFileId !== prepared.commonDirFileId
    )
      throw new ProjectSessionServiceError("session_recovery_required");
  };

  const submitPrompt = async (
    input: SubmitSessionPromptInput,
  ): Promise<SubmitSessionPromptResult> =>
    withSessionLock(input.sessionId, async () => {
      try {
        const existing = await repository.replayOrRejectPromptReceipt({
          commandId: input.commandId,
          sessionId: input.sessionId,
          prompt: input.prompt.trim(),
        });
        if (existing) return existing;
        const identity = await repository.getSessionForPrompt(input.sessionId);
        const project = await projectAuthority.authenticateProject(
          identity.projectId,
        );
        const prepared = await authenticateManagedWorktree({
          project,
          worktreePath: identity.intendedWorktreePath,
          managedBranch: identity.managedBranch,
          sourceCommit: identity.sourceCommit,
        });
        assertPersistedIdentity(identity, prepared);
        const currentRuntime = await repository.getRuntime(input.sessionId);
        if (modelCatalog)
          await modelCatalog.validateSelection({
            providerId: currentRuntime.runtime.providerId,
            modelId: currentRuntime.runtime.modelId,
            thinkingLevel: currentRuntime.runtime.defaultThinkingLevel,
          });

        const prompt = input.prompt.trim();
        const admission = await repository.admitPrompt({
          commandId: input.commandId,
          sessionId: input.sessionId,
          prompt,
        });
        if (admission.kind === "replayed") return admission.result;
        wakeEvents(input.sessionId);

        const skills =
          (await options
            .listSessionSkills?.({
              sessionId: input.sessionId,
              projectRoot: project.canonicalRootPath,
              projectTrusted: false,
            })
            .then((result) => result.internalSkills)
            .catch(() => [])) ?? [];
        turnRunner.runAdmittedTurn({
          sessionId: input.sessionId,
          commandId: input.commandId,
          prompt,
          conversationId: identity.conversationId,
          admission,
          repository,
          tools: {
            kind: "managedWorktree" as const,
            workingDirectory: prepared.canonicalWorktreePath,
            enabledToolNames: workspaceTools.enabledToolNamesForTurn(),
          },
          toolPolicy: workspaceTools,
          resources: { skills },
          makeAssistantTextDelta: ({
            sessionId,
            turnId,
            messageId,
            text,
            order,
            timestamp,
          }) => ({
            live: true,
            eventType: "AssistantTextDeltaV1",
            event: {
              type: "AssistantTextDeltaV1",
              version: 1,
              sessionId,
              turnId,
              messageId,
              text,
              ...(order === undefined ? {} : { order }),
              timestamp,
            },
          }),
          makeAssistantReasoningDelta: ({
            sessionId,
            turnId,
            messageId,
            order,
            text,
            timestamp,
          }) => ({
            live: true,
            eventType: "AssistantReasoningDeltaV1",
            event: {
              type: "AssistantReasoningDeltaV1",
              version: 1,
              sessionId,
              turnId,
              messageId,
              order,
              text,
              timestamp,
            },
          }),
          makeToolCallUpdated: ({
            sessionId,
            turnId,
            toolCallId,
            toolName,
            summary,
            timestamp,
          }) => ({
            live: true,
            eventType: "AgentToolCallUpdatedV1",
            event: {
              type: "AgentToolCallUpdatedV1",
              version: 1,
              sessionId,
              turnId,
              toolCallId,
              toolName,
              summary,
              timestamp,
            },
          }),
          onTurnSettled: scheduleFollowUpDrain,
        });
        return admission.result;
      } catch (error) {
        throw mapError(error);
      }
    });

  const drainFollowUps = async (sessionId: string): Promise<void> => {
    if (drainingSessions.has(sessionId)) return;
    drainingSessions.add(sessionId);
    try {
      while (!turnRunner.hasActiveTurn(sessionId)) {
        const followUp = await repository.dispatchNextFollowUp(sessionId);
        if (!followUp) return;
        try {
          const result = await submitPrompt({
            sessionId,
            commandId: followUp.commandId,
            prompt: followUp.prompt,
          });
          await repository.markFollowUpConsumed({
            sessionId,
            followUpId: followUp.id,
            turnId: result.turn.id,
          });
          wakeEvents(sessionId);
        } catch {
          await repository.markFollowUpRecoveryRequired({
            sessionId,
            followUpId: followUp.id,
          });
          wakeEvents(sessionId);
          return;
        }
      }
    } finally {
      drainingSessions.delete(sessionId);
    }
  };

  const scheduleFollowUpDrain = (sessionId: string): void => {
    if (shuttingDown) return;
    const operation = drainFollowUps(sessionId).catch(() => undefined);
    inFlight.add(operation);
    operation.finally(() => inFlight.delete(operation));
  };

  return {
    create,
    list: async () => ({ sessions: await repository.list() }),
    submitPrompt,
    getRuntime: async (sessionId) => {
      try {
        return await repository.getRuntime(sessionId);
      } catch (error) {
        throw mapError(error);
      }
    },
    updateRuntime: async (sessionId, input) => {
      try {
        return await repository.updateRuntime(
          sessionId,
          input,
          modelCatalog
            ? () =>
                modelCatalog.validateSelection({
                  providerId: input.providerId,
                  modelId: input.modelId,
                  thinkingLevel: input.defaultThinkingLevel,
                })
            : undefined,
        );
      } catch (error) {
        throw mapError(error);
      }
    },
    listFollowUps: async (sessionId) => {
      try {
        return await repository.listFollowUps(sessionId);
      } catch (error) {
        throw mapError(error);
      }
    },
    enqueueFollowUp: async (sessionId, input) => {
      try {
        const result = await repository.enqueueFollowUp(sessionId, input);
        wakeEvents(sessionId);
        scheduleFollowUpDrain(sessionId);
        return result;
      } catch (error) {
        throw mapError(error);
      }
    },
    cancelFollowUp: async (sessionId, followUpId) => {
      try {
        const result = await repository.cancelFollowUp(sessionId, followUpId);
        wakeEvents(sessionId);
        return result;
      } catch (error) {
        throw mapError(error);
      }
    },
    listSkills: async (sessionId) => {
      try {
        const identity = await repository.getSessionForPrompt(sessionId);
        const project = await projectAuthority.authenticateProject(
          identity.projectId,
        );
        const result = await options.listSessionSkills?.({
          sessionId,
          projectRoot: project.canonicalRootPath,
          projectTrusted: false,
        });
        return (result ?? {
          sessionId,
          skills: [],
          diagnostics: [],
        }) as ListProjectSessionSkillsResult;
      } catch (error) {
        throw mapError(error);
      }
    },
    listMessages: async (sessionId) => {
      try {
        return await repository.listMessages(sessionId);
      } catch (error) {
        throw mapError(error);
      }
    },
    listEventsAfter: async (sessionId, after) => {
      try {
        return toEnvelopes(await repository.listEventsAfter(sessionId, after));
      } catch (error) {
        throw mapError(error);
      }
    },
    waitForSseAfter: async (sessionId, after, afterLive, signal) => {
      try {
        return await waitForSseAfter(sessionId, after, afterLive, signal);
      } catch (error) {
        throw mapError(error);
      }
    },
    liveCursor,
    interruptTurn: async (sessionId, turnId) => {
      try {
        await turnRunner.interruptActiveTurn(sessionId, turnId);
        const result = await repository.interruptTurn({
          sessionId,
          turnId,
          reason: "user_interrupted",
        });
        wakeEvents(sessionId);
        return result;
      } catch (error) {
        throw mapError(error);
      }
    },
    reconcile: async () => {
      await repository.markDispatchedFollowUpsRecoveryRequired();
      const candidates = await repository.recoveryCandidates();
      await Promise.all(
        candidates.map(async (session) => {
          await repository.markExistingRecoveryRequired(session.id);
          wakeEvents(session.id);
        }),
      );
      for (const session of await repository.list())
        scheduleFollowUpDrain(session.id);
    },
    waitForIdle: async () => {
      shuttingDown = true;
      await turnRunner.waitForIdle();
      await Promise.allSettled([...inFlight]);
    },
  };
};
