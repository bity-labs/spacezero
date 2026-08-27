import { mkdir } from "node:fs/promises";
import type {
  CreateProjectSessionRequest,
  CreateProjectSessionResult,
  ListProjectSessionsResult,
  ProjectSessionErrorCode,
  ProjectSessionEventEnvelope,
  ProjectSessionLiveEventEnvelope,
  ProjectSessionSseEnvelope,
  SessionMessage,
  SubmitSessionPromptResult,
  InterruptProjectSessionTurnResult,
} from "@spacezero/host-contracts";
import {
  AgentTurnError,
  createScriptedConversationRunner,
  type ConversationRunner,
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
  type AgentTurnFailureReason,
  type SessionWorktreeIdentity,
} from "./project-session.repository.js";
import type { SessionNameEntropy } from "./project-session-name.service.js";

export interface ProjectSessionService {
  readonly create: (
    input: CreateProjectSessionRequest,
  ) => Promise<CreateProjectSessionResult>;
  readonly list: () => Promise<ListProjectSessionsResult>;
  readonly submitPrompt: (
    input: SubmitSessionPromptInput,
  ) => Promise<SubmitSessionPromptResult>;
  readonly listMessages: (sessionId: string) => Promise<{
    readonly session: SubmitSessionPromptResult["session"];
    readonly messages: readonly SessionMessage[];
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

const mapError = (error: unknown): ProjectSessionServiceError => {
  if (error instanceof ProjectSessionServiceError) return error;
  if (error instanceof ProjectServiceError)
    return new ProjectSessionServiceError(mapProjectError(error));
  return new ProjectSessionServiceError("project_session_catalog_unavailable");
};

export const createProjectSessionService = (options: {
  readonly databasePath: string;
  readonly spaceZeroHome: string;
  readonly entropy?: SessionNameEntropy;
  readonly conversationRunner?: ConversationRunner;
}): ProjectSessionService => {
  const projectAuthority = createProjectAuthority(options.databasePath);
  const repository = createProjectSessionRepository(options);
  const conversationRunner =
    options.conversationRunner ?? createScriptedConversationRunner();
  const locks = new Map<string, Promise<unknown>>();
  const sessionLocks = new Map<string, Promise<unknown>>();
  const inFlight = new Set<Promise<unknown>>();
  const eventWaiters = new Map<string, Set<() => void>>();
  const activeTurns = new Map<
    string,
    { readonly sessionId: string; readonly controller: AbortController }
  >();
  let nextLiveSequence = 0;
  const liveEvents = new Map<
    string,
    {
      readonly liveSequence: number;
      readonly envelope: ProjectSessionLiveEventEnvelope;
    }[]
  >();

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
  const wakeEvents = (sessionId: string): void => {
    const waiters = eventWaiters.get(sessionId);
    if (!waiters) return;
    eventWaiters.delete(sessionId);
    for (const resolve of waiters) resolve();
  };
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
  const waitForEvent = (
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<void> =>
    new Promise((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const waiters = eventWaiters.get(sessionId) ?? new Set<() => void>();
      const complete = (): void => {
        waiters.delete(complete);
        if (waiters.size === 0) eventWaiters.delete(sessionId);
        signal?.removeEventListener("abort", complete);
        resolve();
      };
      waiters.add(complete);
      eventWaiters.set(sessionId, waiters);
      signal?.addEventListener("abort", complete, { once: true });
    });
  const publishLive = (
    sessionId: string,
    envelope: ProjectSessionLiveEventEnvelope,
  ): number => {
    const liveSequence = ++nextLiveSequence;
    const current = liveEvents.get(sessionId) ?? [];
    current.push({ liveSequence, envelope });
    if (current.length > 200) current.splice(0, current.length - 200);
    liveEvents.set(sessionId, current);
    wakeEvents(sessionId);
    return liveSequence;
  };
  const liveCursor = (sessionId: string): number =>
    liveEvents.get(sessionId)?.at(-1)?.liveSequence ?? nextLiveSequence;
  const waitForSseAfter = async (
    sessionId: string,
    after: number,
    afterLive: number,
    signal?: AbortSignal,
  ): Promise<{
    readonly envelopes: readonly ProjectSessionSseEnvelope[];
    readonly liveCursor: number;
  }> => {
    const waiting = waitForEvent(sessionId, signal);
    const events = toEnvelopes(
      await repository.listEventsAfter(sessionId, after),
    );
    const live = (liveEvents.get(sessionId) ?? []).filter(
      (event) => event.liveSequence > afterLive,
    );
    if (events.length > 0 || live.length > 0 || signal?.aborted)
      return {
        envelopes: [...events, ...live.map((event) => event.envelope)],
        liveCursor: live.at(-1)?.liveSequence ?? afterLive,
      };
    await waiting;
    const nextEvents = toEnvelopes(
      await repository.listEventsAfter(sessionId, after),
    );
    const nextLive = (liveEvents.get(sessionId) ?? []).filter(
      (event) => event.liveSequence > afterLive,
    );
    return {
      envelopes: [...nextEvents, ...nextLive.map((event) => event.envelope)],
      liveCursor: nextLive.at(-1)?.liveSequence ?? afterLive,
    };
  };

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

        const prompt = input.prompt.trim();
        const admission = await repository.admitPrompt({
          commandId: input.commandId,
          sessionId: input.sessionId,
          prompt,
        });
        if (admission.kind === "replayed") return admission.result;
        wakeEvents(input.sessionId);

        const controller = new AbortController();
        activeTurns.set(admission.turnId, {
          sessionId: input.sessionId,
          controller,
        });
        let draftText = "";
        const operation = (async () => {
          try {
            const history = await repository.listTurnHistoryBefore(
              input.sessionId,
              admission.userSequence,
            );
            const turn = await conversationRunner.submitTurn({
              sessionId: input.sessionId,
              conversationId: identity.conversationId,
              worktreePath: prepared.canonicalWorktreePath,
              history,
              tools: {
                workingDirectory: prepared.canonicalWorktreePath,
                enabledToolNames: ["read", "write", "edit"],
              },
              prompt,
              signal: controller.signal,
              onEvent: async (event) => {
                if (controller.signal.aborted) return;
                const timestamp = new Date().toISOString();
                if (event.type === "assistant_delta") {
                  draftText += event.text;
                  await repository.updateTurnDraft({
                    sessionId: input.sessionId,
                    turnId: admission.turnId,
                    text: draftText,
                  });
                  publishLive(input.sessionId, {
                    live: true,
                    eventType: "AssistantTextDeltaV1",
                    event: {
                      type: "AssistantTextDeltaV1",
                      version: 1,
                      sessionId: input.sessionId,
                      turnId: admission.turnId,
                      messageId: admission.result.turn.assistantMessageId,
                      text: event.text,
                      timestamp,
                    },
                  });
                  return;
                }
                if (event.type === "tool_started") {
                  await repository.recordToolStarted({
                    sessionId: input.sessionId,
                    turnId: admission.turnId,
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                  });
                  wakeEvents(input.sessionId);
                  return;
                }
                if (event.type === "tool_updated") {
                  publishLive(input.sessionId, {
                    live: true,
                    eventType: "AgentToolCallUpdatedV1",
                    event: {
                      type: "AgentToolCallUpdatedV1",
                      version: 1,
                      sessionId: input.sessionId,
                      turnId: admission.turnId,
                      toolCallId: event.toolCallId,
                      toolName: event.toolName,
                      summary: event.summary,
                      timestamp,
                    },
                  });
                  return;
                }
                await repository.recordToolCompleted({
                  sessionId: input.sessionId,
                  turnId: admission.turnId,
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  isError: event.isError,
                });
                wakeEvents(input.sessionId);
              },
            });
            if (controller.signal.aborted)
              throw new AgentTurnError("agent_turn_interrupted");
            if (typeof turn.text !== "string" || turn.text.length === 0)
              throw new AgentTurnError("agent_turn_failed");
            await repository.completeTurn({
              commandId: input.commandId,
              sessionId: input.sessionId,
              turnId: admission.turnId,
              text: turn.text,
            });
            wakeEvents(input.sessionId);
          } catch (error) {
            if (
              controller.signal.aborted &&
              error instanceof ProjectSessionServiceError &&
              error.code === "turn_not_active"
            ) {
              return;
            }
            if (
              error instanceof AgentTurnError &&
              error.code === "agent_turn_interrupted"
            ) {
              await repository
                .interruptTurn({
                  sessionId: input.sessionId,
                  turnId: admission.turnId,
                  reason: "user_interrupted",
                })
                .then(() => wakeEvents(input.sessionId))
                .catch(() => undefined);
              return;
            }
            const reason: AgentTurnFailureReason =
              error instanceof AgentTurnError &&
              error.code === "agent_unavailable"
                ? "agent_unavailable"
                : "agent_turn_failed";
            await repository
              .failTurn({
                commandId: input.commandId,
                sessionId: input.sessionId,
                turnId: admission.turnId,
                reason,
              })
              .then(() => wakeEvents(input.sessionId))
              .catch(() => undefined);
          } finally {
            activeTurns.delete(admission.turnId);
          }
        })();
        inFlight.add(operation);
        operation.finally(() => inFlight.delete(operation));
        return admission.result;
      } catch (error) {
        throw mapError(error);
      }
    });

  return {
    create,
    list: async () => ({ sessions: await repository.list() }),
    submitPrompt,
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
        const active = activeTurns.get(turnId);
        if (active?.sessionId === sessionId) active.controller.abort();
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
      const candidates = await repository.recoveryCandidates();
      await Promise.all(
        candidates.map(async (session) => {
          await repository.markExistingRecoveryRequired(session.id);
          wakeEvents(session.id);
        }),
      );
    },
    waitForIdle: async () => {
      await Promise.allSettled([...inFlight]);
    },
  };
};
