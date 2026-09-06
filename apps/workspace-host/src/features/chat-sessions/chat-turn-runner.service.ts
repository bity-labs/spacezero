import { randomUUID } from "node:crypto";
import {
  AgentTurnError,
  type AgentRuntimeEvent,
  type AgentToolConfiguration,
  type AgentTurnAssistantMessage,
  type AgentTurnContentPart,
  type AgentTurnMessage,
  type AgentTurnResources,
  type ConversationRunner,
  type PiPrivateSessionStateRepository,
} from "@spacezero/pi-adapter";
import { createChatSessionStreamService } from "./chat-session-stream.service.js";

export type ChatTurnFailureReason =
  | "agent_configuration_invalid"
  | "agent_unavailable"
  | "agent_turn_failed"
  | "agent_authentication_required";

export interface ChatTurnView {
  readonly id: string;
  readonly assistantMessageId: string;
  readonly assistantMessageIds?: readonly string[];
  readonly providerId: string;
  readonly modelId: string;
  readonly thinkingLevel:
    "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}

export interface ChatPromptAdmission<
  PromptResult extends { readonly turn: ChatTurnView },
> {
  readonly kind: "admitted";
  readonly turnId: string;
  readonly userSequence: number;
  readonly result: PromptResult;
}

export interface ChatTurnToolMetadata {
  readonly name: string;
  readonly safety?: "read" | "write" | "dangerous";
}

export interface ChatTurnToolApproval {
  readonly status?: "approved" | "requires_approval";
  readonly reason?: string;
}

export interface ChatTurnToolPolicy {
  readonly listTurnTools: () => readonly ChatTurnToolMetadata[];
  readonly approvalForTool: (toolName: string) => ChatTurnToolApproval;
}

export interface ChatTurnRepository {
  readonly listTurnHistoryBefore: (
    sessionId: string,
    sequence: number,
  ) => Promise<readonly AgentTurnMessage[]>;
  readonly checkpointTurnDraft: (input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly text: string;
    readonly parts?: readonly AgentTurnContentPart[];
  }) => Promise<void>;
  readonly recordToolStarted: (input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly arguments?: Extract<
      AgentTurnContentPart,
      { readonly type: "tool-call" }
    >["arguments"];
    readonly safety?: "read" | "write" | "dangerous";
    readonly approvalStatus?: "approved" | "requires_approval";
    readonly approvalReason?: string;
  }) => Promise<void>;
  readonly recordToolCompleted: (input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly isError: boolean;
    readonly result?: Extract<
      AgentTurnContentPart,
      { readonly type: "tool-call" }
    >["result"];
    readonly safety?: "read" | "write" | "dangerous";
    readonly approvalStatus?: "approved" | "requires_approval";
    readonly approvalReason?: string;
  }) => Promise<void>;
  readonly completeTurn: (input: {
    readonly commandId: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly text: string;
    readonly parts?: readonly AgentTurnContentPart[];
    readonly messages?: readonly (AgentTurnAssistantMessage & {
      readonly id: string;
    })[];
  }) => Promise<unknown>;
  readonly failTurn: (input: {
    readonly commandId: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly reason: ChatTurnFailureReason;
  }) => Promise<void>;
  readonly interruptTurn: (input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly reason: "user_interrupted" | "host_shutdown";
  }) => Promise<unknown>;
  readonly markTurnRecoveryRequired: (input: {
    readonly sessionId: string;
    readonly turnId: string;
  }) => Promise<void>;
}

export interface RunAdmittedChatTurnInput<
  PromptResult extends { readonly turn: ChatTurnView },
  LiveEnvelope,
> {
  readonly sessionId: string;
  readonly commandId: string;
  readonly prompt: string;
  readonly conversationId: string;
  readonly admission: ChatPromptAdmission<PromptResult>;
  readonly repository: ChatTurnRepository;
  readonly tools: AgentToolConfiguration;
  readonly toolPolicy: ChatTurnToolPolicy;
  readonly resources?: AgentTurnResources;
  readonly makeAssistantTextDelta: (input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly messageId: string;
    readonly text: string;
    readonly order?: number;
    readonly timestamp: string;
  }) => LiveEnvelope;
  readonly makeAssistantReasoningDelta: (input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly messageId: string;
    readonly order: number;
    readonly text: string;
    readonly timestamp: string;
  }) => LiveEnvelope;
  readonly makeToolCallUpdated: (input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly summary: string;
    readonly progress?: Extract<
      AgentTurnContentPart,
      { readonly type: "tool-call" }
    >["result"];
    readonly timestamp: string;
  }) => LiveEnvelope;
  readonly makeConversationPersistenceFailed: (input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly messageId: string;
    readonly timestamp: string;
  }) => LiveEnvelope;
  readonly onTurnSettled?: (sessionId: string) => void;
}

export interface ChatTurnRunner<DurableEnvelope, LiveEnvelope> {
  readonly runAdmittedTurn: <
    PromptResult extends { readonly turn: ChatTurnView },
  >(
    input: RunAdmittedChatTurnInput<PromptResult, LiveEnvelope>,
  ) => void;
  readonly wakeEvents: (sessionId: string) => void;
  readonly liveCursor: (sessionId: string) => number;
  readonly waitForSseAfter: (
    sessionId: string,
    after: number,
    afterLive: number,
    listEventsAfter: (
      sessionId: string,
      after: number,
    ) => Promise<readonly DurableEnvelope[]>,
    signal?: AbortSignal,
  ) => Promise<{
    readonly envelopes: readonly (DurableEnvelope | LiveEnvelope)[];
    readonly liveCursor: number;
  }>;
  readonly interruptActiveTurn: (
    sessionId: string,
    turnId: string,
  ) => Promise<void>;
  readonly hasActiveTurn: (sessionId: string) => boolean;
  readonly hasStorageFault: (sessionId: string) => boolean;
  readonly storageFaultForSession: (sessionId: string) =>
    | {
        readonly turnId: string;
        readonly messageId: string;
        readonly occurredAt: string;
      }
    | undefined;
  readonly waitForIdle: () => Promise<void>;
}

const failureReason = (error: unknown): ChatTurnFailureReason =>
  error instanceof AgentTurnError && error.code !== "agent_turn_interrupted"
    ? error.code
    : "agent_turn_failed";

const partDisplayLength = (part: AgentTurnContentPart): number => {
  if (part.type === "text" || part.type === "reasoning")
    return part.text.length;
  const argumentLength = JSON.stringify(part.arguments ?? {}).length;
  const resultLength = JSON.stringify(part.result ?? {}).length;
  return argumentLength + resultLength + (part.progress?.length ?? 0);
};

const mergeParts = (
  existing: readonly AgentTurnContentPart[],
  completed: readonly AgentTurnContentPart[] | undefined,
  fallbackText: string,
): readonly AgentTurnContentPart[] => {
  const parts = new Map<number, AgentTurnContentPart>();
  for (const part of existing) parts.set(part.order, part);
  for (const part of completed ?? []) parts.set(part.order, part);
  if (
    fallbackText.length > 0 &&
    ![...parts.values()].some((part) => part.type === "text")
  )
    parts.set(Math.max(0, ...parts.keys()) + 1, {
      type: "text",
      order: Math.max(0, ...parts.keys()) + 1,
      text: fallbackText,
    });
  return [...parts.values()].sort((left, right) => left.order - right.order);
};

export const createChatTurnRunner = <DurableEnvelope, LiveEnvelope>(options: {
  readonly conversationRunner: ConversationRunner;
  readonly privatePiStateRepository?: PiPrivateSessionStateRepository;
}): ChatTurnRunner<DurableEnvelope, LiveEnvelope> => {
  const stream = createChatSessionStreamService<
    DurableEnvelope,
    LiveEnvelope
  >();
  const inFlight = new Set<Promise<unknown>>();
  const activeTurns = new Map<
    string,
    {
      readonly sessionId: string;
      readonly controller: AbortController;
      readonly flushDraft: () => Promise<void>;
    }
  >();
  const storageFaults = new Map<
    string,
    {
      readonly turnId: string;
      readonly messageId: string;
      readonly occurredAt: string;
    }
  >();
  let shuttingDown = false;

  const runAdmittedTurn = <
    PromptResult extends { readonly turn: ChatTurnView },
  >(
    input: RunAdmittedChatTurnInput<PromptResult, LiveEnvelope>,
  ): void => {
    const controller = new AbortController();
    let draftText = "";
    const draftParts = new Map<number, AgentTurnContentPart>();
    let checkpointedContentLength = 0;
    let checkpointedDurableFingerprint = "";
    let checkpointTimer: ReturnType<typeof setTimeout> | undefined;
    let checkpointChain = Promise.resolve();
    let storageFaulted = false;
    const turn = input.admission.result.turn;
    const assistantMessageIds = new Map<number, string>([
      [0, turn.assistantMessageId],
    ]);
    const messageIdForIndex = (messageIndex = 0): string => {
      const existing = assistantMessageIds.get(messageIndex);
      if (existing !== undefined) return existing;
      const id = randomUUID();
      assistantMessageIds.set(messageIndex, id);
      return id;
    };

    const reportPersistenceFailure = async (
      operation: string,
    ): Promise<void> => {
      if (storageFaulted) return;
      storageFaulted = true;
      const timestamp = new Date().toISOString();
      storageFaults.set(input.sessionId, {
        turnId: input.admission.turnId,
        messageId: turn.assistantMessageId,
        occurredAt: timestamp,
      });
      console.warn("conversation persistence failed", {
        operation,
        sessionId: input.sessionId,
        turnId: input.admission.turnId,
      });
      stream.publishLive(
        input.sessionId,
        input.makeConversationPersistenceFailed({
          sessionId: input.sessionId,
          turnId: input.admission.turnId,
          messageId: turn.assistantMessageId,
          timestamp,
        }),
      );
      controller.abort();
      await input.repository
        .markTurnRecoveryRequired({
          sessionId: input.sessionId,
          turnId: input.admission.turnId,
        })
        .then(() => stream.wakeEvents(input.sessionId))
        .catch(() => undefined);
    };

    const persistRequired = async <A>(
      operation: string,
      run: () => Promise<A>,
    ): Promise<A> => {
      if (storageFaulted) throw new AgentTurnError("agent_turn_interrupted");
      try {
        return await run();
      } catch (error) {
        await reportPersistenceFailure(operation);
        throw error;
      }
    };

    const currentParts = (): readonly AgentTurnContentPart[] =>
      [...draftParts.values()].sort((left, right) => left.order - right.order);

    const checkpointDraft = async (): Promise<void> => {
      const parts = currentParts();
      const capturedLength = parts.reduce(
        (total, part) => total + partDisplayLength(part),
        0,
      );
      if (capturedLength === checkpointedContentLength) return;
      const text = draftText;
      const fingerprint = JSON.stringify({ text, parts });
      if (fingerprint === checkpointedDurableFingerprint) {
        checkpointedContentLength = capturedLength;
        return;
      }
      const operation = checkpointChain
        .catch(() => undefined)
        .then(async () => {
          if (capturedLength <= checkpointedContentLength) return;
          await persistRequired("checkpointTurnDraft", () =>
            input.repository.checkpointTurnDraft({
              sessionId: input.sessionId,
              turnId: input.admission.turnId,
              text,
              parts,
            }),
          );
          checkpointedContentLength = capturedLength;
          checkpointedDurableFingerprint = fingerprint;
          stream.wakeEvents(input.sessionId);
        });
      checkpointChain = operation;
      await operation;
    };

    const scheduleCheckpoint = (): void => {
      if (checkpointTimer) return;
      checkpointTimer = setTimeout(() => {
        checkpointTimer = undefined;
        void checkpointDraft().catch(() => {
          // The checkpoint path reports persistence failures without relying on
          // the failing database; avoid a second diagnostic from this timer.
        });
      }, 250);
      checkpointTimer.unref?.();
    };

    activeTurns.set(input.admission.turnId, {
      sessionId: input.sessionId,
      controller,
      flushDraft: checkpointDraft,
    });

    const operation = (async () => {
      try {
        const history = await input.repository.listTurnHistoryBefore(
          input.sessionId,
          input.admission.userSequence,
        );
        const operationId = input.admission.turnId;
        await options.privatePiStateRepository?.recordOperationStarted({
          id: input.sessionId,
          operationId,
          turnId: input.admission.turnId,
          prompt: input.prompt,
        });
        if (controller.signal.aborted)
          throw new AgentTurnError("agent_turn_interrupted");
        const completed = await Promise.race([
          options.conversationRunner.submitTurn({
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            history,
            runtime: {
              providerId: turn.providerId,
              modelId: turn.modelId,
              thinkingLevel: turn.thinkingLevel,
            },
            privateState: {
              stateId: input.sessionId,
              operationId,
            },
            tools: input.tools,
            ...(input.resources === undefined
              ? {}
              : { resources: input.resources }),
            prompt: input.prompt,
            signal: controller.signal,
            onEvent: async (event: AgentRuntimeEvent) => {
              if (controller.signal.aborted) return;
              const timestamp = new Date().toISOString();
              if (event.type === "assistant_delta") {
                const existing = draftParts.get(event.part.order);
                const existingText =
                  existing?.type === "text" || existing?.type === "reasoning"
                    ? existing.text
                    : "";
                const nextPart = {
                  ...event.part,
                  text: `${existingText}${event.part.text}`,
                };
                draftParts.set(event.part.order, nextPart);
                if (event.part.type === "text") draftText += event.part.text;
                if (
                  currentParts().reduce(
                    (total, part) => total + partDisplayLength(part),
                    0,
                  ) -
                    checkpointedContentLength >=
                  2_048
                )
                  await checkpointDraft();
                else scheduleCheckpoint();
                const messageId = messageIdForIndex(event.messageIndex);
                stream.publishLive(
                  input.sessionId,
                  event.part.type === "reasoning"
                    ? input.makeAssistantReasoningDelta({
                        sessionId: input.sessionId,
                        turnId: input.admission.turnId,
                        messageId,
                        order: event.part.order,
                        text: event.part.text,
                        timestamp,
                      })
                    : input.makeAssistantTextDelta({
                        sessionId: input.sessionId,
                        turnId: input.admission.turnId,
                        messageId,
                        text: event.part.text,
                        order: event.part.order,
                        timestamp,
                      }),
                );
                return;
              }
              if (event.type === "tool_started") {
                const tool = input.toolPolicy
                  .listTurnTools()
                  .find((candidate) => candidate.name === event.toolName);
                const approval = input.toolPolicy.approvalForTool(
                  event.toolName,
                );
                const toolPart = {
                  type: "tool-call" as const,
                  order: currentParts().at(-1)?.order
                    ? currentParts().at(-1)!.order + 1
                    : 1,
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  status: "running" as const,
                  ...(event.arguments === undefined
                    ? {}
                    : { arguments: event.arguments }),
                  ...(tool?.safety === undefined
                    ? {}
                    : { safety: tool.safety }),
                  ...(approval.status === undefined
                    ? {}
                    : { approvalStatus: approval.status }),
                  ...(approval.reason === undefined
                    ? {}
                    : { approvalReason: approval.reason }),
                };
                draftParts.set(toolPart.order, toolPart);
                await checkpointDraft();
                await persistRequired("recordToolStarted", () =>
                  input.repository.recordToolStarted({
                    sessionId: input.sessionId,
                    turnId: input.admission.turnId,
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                    ...(event.arguments === undefined
                      ? {}
                      : { arguments: event.arguments }),
                    ...(tool?.safety === undefined
                      ? {}
                      : { safety: tool.safety }),
                    ...(approval.status === undefined
                      ? {}
                      : { approvalStatus: approval.status }),
                    ...(approval.reason === undefined
                      ? {}
                      : { approvalReason: approval.reason }),
                  }),
                );
                stream.wakeEvents(input.sessionId);
                return;
              }
              if (event.type === "tool_updated") {
                stream.publishLive(
                  input.sessionId,
                  input.makeToolCallUpdated({
                    sessionId: input.sessionId,
                    turnId: input.admission.turnId,
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                    summary: event.summary,
                    ...(event.progress === undefined
                      ? {}
                      : { progress: event.progress }),
                    timestamp,
                  }),
                );
                return;
              }
              const tool = input.toolPolicy
                .listTurnTools()
                .find((candidate) => candidate.name === event.toolName);
              const approval = input.toolPolicy.approvalForTool(event.toolName);
              const existingTool = [...draftParts.values()].find(
                (part) =>
                  part.type === "tool-call" &&
                  part.toolCallId === event.toolCallId,
              );
              const completedToolPart = {
                ...(existingTool?.type === "tool-call"
                  ? existingTool
                  : {
                      type: "tool-call" as const,
                      order: currentParts().at(-1)?.order
                        ? currentParts().at(-1)!.order + 1
                        : 1,
                      toolCallId: event.toolCallId,
                      toolName: event.toolName,
                    }),
                status: event.isError
                  ? ("failed" as const)
                  : ("succeeded" as const),
                ...(event.result === undefined ? {} : { result: event.result }),
                ...(tool?.safety === undefined ? {} : { safety: tool.safety }),
                ...(approval.status === undefined
                  ? {}
                  : { approvalStatus: approval.status }),
                ...(approval.reason === undefined
                  ? {}
                  : { approvalReason: approval.reason }),
              };
              draftParts.set(completedToolPart.order, completedToolPart);
              await checkpointDraft();
              await persistRequired("recordToolCompleted", () =>
                input.repository.recordToolCompleted({
                  sessionId: input.sessionId,
                  turnId: input.admission.turnId,
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  isError: event.isError,
                  ...(event.result === undefined
                    ? {}
                    : { result: event.result }),
                  ...(tool?.safety === undefined
                    ? {}
                    : { safety: tool.safety }),
                  ...(approval.status === undefined
                    ? {}
                    : { approvalStatus: approval.status }),
                  ...(approval.reason === undefined
                    ? {}
                    : { approvalReason: approval.reason }),
                }),
              );
              stream.wakeEvents(input.sessionId);
            },
          }),
          new Promise<never>((_, reject) => {
            if (controller.signal.aborted) {
              reject(new AgentTurnError("agent_turn_interrupted"));
              return;
            }
            controller.signal.addEventListener(
              "abort",
              () => reject(new AgentTurnError("agent_turn_interrupted")),
              { once: true },
            );
          }),
        ]);
        if (controller.signal.aborted)
          throw new AgentTurnError("agent_turn_interrupted");
        if (typeof completed.text !== "string" || completed.text.length === 0)
          throw new AgentTurnError("agent_turn_failed");
        await options.privatePiStateRepository?.recordOperationSettled({
          id: input.sessionId,
          operationId,
          assistantText: completed.text,
        });
        const completedMessages = completed.messages?.map((message, index) => ({
          id: messageIdForIndex(index),
          text: message.text,
          ...(message.parts === undefined ? {} : { parts: message.parts }),
        }));
        const finalParts = mergeParts(
          currentParts(),
          completed.parts,
          completed.text,
        );
        await persistRequired("completeTurn", () =>
          input.repository.completeTurn({
            commandId: input.commandId,
            sessionId: input.sessionId,
            turnId: input.admission.turnId,
            text: completed.text,
            parts: finalParts,
            ...(completedMessages === undefined
              ? {}
              : { messages: completedMessages }),
          }),
        );
        stream.wakeEvents(input.sessionId);
      } catch (error) {
        if (storageFaulted) return;
        if (
          error instanceof AgentTurnError &&
          error.code === "agent_turn_interrupted"
        ) {
          await checkpointDraft().catch(() => undefined);
          await input.repository
            .interruptTurn({
              sessionId: input.sessionId,
              turnId: input.admission.turnId,
              reason: shuttingDown ? "host_shutdown" : "user_interrupted",
            })
            .then(() => stream.wakeEvents(input.sessionId))
            .catch(() => undefined);
          return;
        }
        await checkpointDraft().catch(() => undefined);
        await input.repository
          .failTurn({
            commandId: input.commandId,
            sessionId: input.sessionId,
            turnId: input.admission.turnId,
            reason: failureReason(error),
          })
          .then(() => stream.wakeEvents(input.sessionId))
          .catch(() => undefined);
      } finally {
        if (checkpointTimer) clearTimeout(checkpointTimer);
        await checkpointChain.catch(() => undefined);
        activeTurns.delete(input.admission.turnId);
        if (!storageFaulted) input.onTurnSettled?.(input.sessionId);
      }
    })();

    inFlight.add(operation);
    operation.finally(() => inFlight.delete(operation));
  };

  return {
    runAdmittedTurn,
    wakeEvents: stream.wakeEvents,
    liveCursor: stream.liveCursor,
    waitForSseAfter: (sessionId, after, afterLive, listEventsAfter, signal) =>
      stream.waitForSseAfter(
        sessionId,
        after,
        afterLive,
        listEventsAfter,
        signal,
      ),
    interruptActiveTurn: async (sessionId, turnId) => {
      const active = activeTurns.get(turnId);
      if (active?.sessionId !== sessionId) return;
      await active.flushDraft();
      active.controller.abort();
    },
    hasActiveTurn: (sessionId) =>
      [...activeTurns.values()].some((turn) => turn.sessionId === sessionId),
    hasStorageFault: (sessionId) => storageFaults.has(sessionId),
    storageFaultForSession: (sessionId) => storageFaults.get(sessionId),
    waitForIdle: async () => {
      shuttingDown = true;
      for (const active of activeTurns.values()) active.controller.abort();
      await Promise.allSettled([...inFlight]);
    },
  };
};
