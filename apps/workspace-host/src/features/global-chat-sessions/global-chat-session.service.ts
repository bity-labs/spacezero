import type {
  CancelGlobalChatSessionFollowUpResult,
  CreateGlobalChatSessionWithFirstPromptRequest,
  CreateGlobalChatSessionWithFirstPromptResult,
  EnqueueGlobalChatSessionFollowUpRequest,
  EnqueueGlobalChatSessionFollowUpResult,
  GetGlobalChatSessionRuntimeResult,
  GlobalChatSessionEventEnvelope,
  GlobalChatSessionLiveEventEnvelope,
  GlobalChatSessionSseEnvelope,
  InterruptGlobalChatSessionTurnResult,
  ListGlobalChatSessionFollowUpsResult,
  ListGlobalChatSessionMessagesResult,
  ListGlobalChatSessionsResult,
  SubmitGlobalChatSessionPromptResult,
  UpdateGlobalChatSessionRuntimeRequest,
  UpdateGlobalChatSessionRuntimeResult,
} from "@spacezero/host-contracts";
import {
  PiModelCatalogError,
  createScriptedConversationRunner,
  type ConversationRunner,
  type PiModelCatalogService,
  type PiPrivateSessionStateRepository,
} from "@spacezero/pi-adapter";
import { createChatTurnRunner } from "../chat-sessions/chat-turn-runner.service.js";
import { GlobalChatSessionServiceError } from "./global-chat-session.model.js";
import { createGlobalChatSessionRepository } from "./global-chat-session.repository.js";

export interface GlobalChatSessionService {
  readonly createWithFirstPrompt: (
    input: CreateGlobalChatSessionWithFirstPromptRequest,
  ) => Promise<CreateGlobalChatSessionWithFirstPromptResult>;
  readonly list: () => Promise<ListGlobalChatSessionsResult>;
  readonly submitPrompt: (input: {
    readonly sessionId: string;
    readonly commandId: string;
    readonly prompt: string;
  }) => Promise<SubmitGlobalChatSessionPromptResult>;
  readonly getRuntime: (
    sessionId: string,
  ) => Promise<GetGlobalChatSessionRuntimeResult>;
  readonly updateRuntime: (
    sessionId: string,
    input: UpdateGlobalChatSessionRuntimeRequest,
  ) => Promise<UpdateGlobalChatSessionRuntimeResult>;
  readonly listFollowUps: (
    sessionId: string,
  ) => Promise<ListGlobalChatSessionFollowUpsResult>;
  readonly enqueueFollowUp: (
    sessionId: string,
    input: EnqueueGlobalChatSessionFollowUpRequest,
  ) => Promise<EnqueueGlobalChatSessionFollowUpResult>;
  readonly cancelFollowUp: (
    sessionId: string,
    followUpId: string,
  ) => Promise<CancelGlobalChatSessionFollowUpResult>;
  readonly listMessages: (
    sessionId: string,
  ) => Promise<ListGlobalChatSessionMessagesResult>;
  readonly listEventsAfter: (
    sessionId: string,
    after: number,
  ) => Promise<readonly GlobalChatSessionEventEnvelope[]>;
  readonly waitForSseAfter: (
    sessionId: string,
    after: number,
    afterLive: number,
    signal?: AbortSignal,
  ) => Promise<{
    readonly envelopes: readonly GlobalChatSessionSseEnvelope[];
    readonly liveCursor: number;
  }>;
  readonly liveCursor: (sessionId: string) => number;
  readonly interruptTurn: (
    sessionId: string,
    turnId: string,
  ) => Promise<InterruptGlobalChatSessionTurnResult>;
  readonly reconcile: () => Promise<void>;
  readonly waitForIdle: () => Promise<void>;
}

const mapModelCatalogError = (
  error: PiModelCatalogError,
): GlobalChatSessionServiceError => {
  switch (error.code) {
    case "provider_not_authenticated":
      return new GlobalChatSessionServiceError("agent_authentication_required");
    case "model_not_found":
    case "model_unavailable":
    case "thinking_level_unsupported":
      return new GlobalChatSessionServiceError("agent_configuration_invalid");
  }
};

const mapError = (error: unknown): GlobalChatSessionServiceError => {
  if (error instanceof GlobalChatSessionServiceError) return error;
  if (error instanceof PiModelCatalogError) return mapModelCatalogError(error);
  return new GlobalChatSessionServiceError("global_chat_session_unavailable");
};

const noTools = {
  listTurnTools: () => [],
  approvalForTool: () => ({}),
};

export const createGlobalChatSessionService = (options: {
  readonly databasePath: string;
  readonly conversationRunner?: ConversationRunner;
  readonly modelCatalog?: PiModelCatalogService;
  readonly privatePiStateRepository?: PiPrivateSessionStateRepository;
}): GlobalChatSessionService => {
  const repository = createGlobalChatSessionRepository(options);
  const conversationRunner =
    options.conversationRunner ?? createScriptedConversationRunner();
  const turnRunner = createChatTurnRunner<
    GlobalChatSessionEventEnvelope,
    GlobalChatSessionLiveEventEnvelope
  >({
    conversationRunner,
    ...(options.privatePiStateRepository === undefined
      ? {}
      : { privatePiStateRepository: options.privatePiStateRepository }),
  });
  const locks = new Map<string, Promise<unknown>>();
  const inFlight = new Set<Promise<unknown>>();
  const drainingSessions = new Set<string>();
  let shuttingDown = false;

  const withSessionLock = async <A>(
    sessionId: string,
    run: () => Promise<A>,
  ) => {
    const previous = locks.get(sessionId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(run);
    locks.set(sessionId, current);
    try {
      return await current;
    } finally {
      if (locks.get(sessionId) === current) locks.delete(sessionId);
    }
  };

  const ensurePrivateState = async (sessionId: string) => {
    const status = await options.privatePiStateRepository?.reconcile(sessionId);
    if (status === "missing") {
      await options.privatePiStateRepository?.create({
        id: sessionId,
        conversationId: sessionId,
      });
    }
  };

  const runTurn = async <
    Result extends {
      readonly turn: {
        readonly id: string;
        readonly assistantMessageId: string;
        readonly providerId: string;
        readonly modelId: string;
        readonly thinkingLevel:
          "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
      };
    },
  >(input: {
    readonly sessionId: string;
    readonly commandId: string;
    readonly prompt: string;
    readonly admitted: {
      readonly kind: "admitted";
      readonly turnId: string;
      readonly userSequence: number;
      readonly conversationId: string;
      readonly result: Result;
    };
  }) => {
    turnRunner.runAdmittedTurn({
      sessionId: input.sessionId,
      commandId: input.commandId,
      prompt: input.prompt,
      conversationId: input.admitted.conversationId,
      admission: input.admitted,
      repository,
      tools: { kind: "none", enabledToolNames: [] },
      toolPolicy: noTools,
      makeAssistantTextDelta: ({
        sessionId,
        turnId,
        messageId,
        text,
        order,
        timestamp,
      }) => ({
        live: true,
        eventType: "GlobalChatAssistantTextDeltaV1",
        event: {
          type: "GlobalChatAssistantTextDeltaV1",
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
        eventType: "GlobalChatAssistantReasoningDeltaV1",
        event: {
          type: "GlobalChatAssistantReasoningDeltaV1",
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
        progress,
        timestamp,
      }) => ({
        live: true,
        eventType: "GlobalChatAgentToolCallUpdatedV1",
        event: {
          type: "GlobalChatAgentToolCallUpdatedV1",
          version: 1,
          sessionId,
          turnId,
          toolCallId,
          toolName,
          summary,
          ...(progress === undefined ? {} : { progress }),
          timestamp,
        },
      }),
      onTurnSettled: scheduleFollowUpDrain,
    });
  };

  const submitPrompt: GlobalChatSessionService["submitPrompt"] = async (
    input,
  ) =>
    withSessionLock(input.sessionId, async () => {
      try {
        const result = await repository.submitPrompt({
          ...input,
          prompt: input.prompt.trim(),
        });
        if (result.kind === "replayed") return result.result;
        try {
          await ensurePrivateState(input.sessionId);
        } catch (error) {
          await repository.markTurnRecoveryRequired({
            sessionId: input.sessionId,
            turnId: result.turnId,
          });
          turnRunner.wakeEvents(input.sessionId);
          throw error;
        }
        turnRunner.wakeEvents(input.sessionId);
        await runTurn({
          sessionId: input.sessionId,
          commandId: input.commandId,
          prompt: input.prompt.trim(),
          admitted: result,
        });
        return result.result;
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
          turnRunner.wakeEvents(sessionId);
        } catch {
          await repository.markFollowUpRecoveryRequired({
            sessionId,
            followUpId: followUp.id,
          });
          turnRunner.wakeEvents(sessionId);
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
    createWithFirstPrompt: async (input) => {
      try {
        const result = await repository.createWithFirstPrompt(input);
        if (result.kind === "replayed") return result.result;
        try {
          await ensurePrivateState(result.result.session.id);
        } catch (error) {
          await repository.markTurnRecoveryRequired({
            sessionId: result.result.session.id,
            turnId: result.turnId,
          });
          turnRunner.wakeEvents(result.result.session.id);
          throw error;
        }
        turnRunner.wakeEvents(result.result.session.id);
        await runTurn({
          sessionId: result.result.session.id,
          commandId: input.commandId,
          prompt: input.firstPrompt.trim(),
          admitted: result,
        });
        return result.result;
      } catch (error) {
        throw mapError(error);
      }
    },
    list: async () => {
      try {
        return await repository.list();
      } catch (error) {
        throw mapError(error);
      }
    },
    submitPrompt,
    getRuntime: async (sessionId) => {
      try {
        return await repository.getRuntime(sessionId);
      } catch (error) {
        throw mapError(error);
      }
    },
    updateRuntime: async (sessionId, input) =>
      withSessionLock(sessionId, async () => {
        try {
          return await repository.updateRuntime(
            sessionId,
            input,
            options.modelCatalog
              ? () =>
                  options.modelCatalog!.validateSelection({
                    providerId: input.providerId,
                    modelId: input.modelId,
                    thinkingLevel: input.defaultThinkingLevel,
                  })
              : undefined,
          );
        } catch (error) {
          throw mapError(error);
        }
      }),
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
        turnRunner.wakeEvents(sessionId);
        scheduleFollowUpDrain(sessionId);
        return result;
      } catch (error) {
        throw mapError(error);
      }
    },
    cancelFollowUp: async (sessionId, followUpId) => {
      try {
        const result = await repository.cancelFollowUp(sessionId, followUpId);
        turnRunner.wakeEvents(sessionId);
        return result;
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
        return await repository.listEventsAfter(sessionId, after);
      } catch (error) {
        throw mapError(error);
      }
    },
    waitForSseAfter: async (sessionId, after, afterLive, signal) => {
      try {
        return await turnRunner.waitForSseAfter(
          sessionId,
          after,
          afterLive,
          repository.listEventsAfter,
          signal,
        );
      } catch (error) {
        throw mapError(error);
      }
    },
    liveCursor: turnRunner.liveCursor,
    interruptTurn: async (sessionId, turnId) => {
      try {
        await turnRunner.interruptActiveTurn(sessionId, turnId);
        const result = await repository.interruptTurn({
          sessionId,
          turnId,
          reason: "user_interrupted",
        });
        turnRunner.wakeEvents(sessionId);
        return result;
      } catch (error) {
        throw mapError(error);
      }
    },
    reconcile: async () => {
      await repository.markDispatchedFollowUpsRecoveryRequired();
      await repository.markInFlightTurnsRecoveryRequired();
      for (const session of (await repository.list()).sessions)
        scheduleFollowUpDrain(session.id);
    },
    waitForIdle: async () => {
      shuttingDown = true;
      await turnRunner.waitForIdle();
      await Promise.allSettled([...inFlight]);
    },
  };
};
