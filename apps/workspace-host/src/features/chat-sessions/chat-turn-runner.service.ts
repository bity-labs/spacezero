import {
  AgentTurnError,
  type AgentRuntimeEvent,
  type AgentToolConfiguration,
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
  readonly waitForIdle: () => Promise<void>;
}

const failureReason = (error: unknown): ChatTurnFailureReason =>
  error instanceof AgentTurnError && error.code !== "agent_turn_interrupted"
    ? error.code
    : "agent_turn_failed";

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
    const turn = input.admission.result.turn;

    const currentParts = (): readonly AgentTurnContentPart[] =>
      [...draftParts.values()].sort((left, right) => left.order - right.order);

    const checkpointDraft = async (): Promise<void> => {
      const parts = currentParts();
      const capturedLength = parts.reduce(
        (total, part) => total + part.text.length,
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
          await input.repository.checkpointTurnDraft({
            sessionId: input.sessionId,
            turnId: input.admission.turnId,
            text,
            parts,
          });
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
        void checkpointDraft().catch(() => undefined);
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
                const nextPart = {
                  ...event.part,
                  text: `${existing?.text ?? ""}${event.part.text}`,
                };
                draftParts.set(event.part.order, nextPart);
                if (event.part.type === "text") draftText += event.part.text;
                if (
                  currentParts().reduce(
                    (total, part) => total + part.text.length,
                    0,
                  ) - checkpointedContentLength >=
                  2_048
                )
                  await checkpointDraft();
                else scheduleCheckpoint();
                stream.publishLive(
                  input.sessionId,
                  event.part.type === "reasoning"
                    ? input.makeAssistantReasoningDelta({
                        sessionId: input.sessionId,
                        turnId: input.admission.turnId,
                        messageId: turn.assistantMessageId,
                        order: event.part.order,
                        text: event.part.text,
                        timestamp,
                      })
                    : input.makeAssistantTextDelta({
                        sessionId: input.sessionId,
                        turnId: input.admission.turnId,
                        messageId: turn.assistantMessageId,
                        text: event.part.text,
                        order: event.part.order,
                        timestamp,
                      }),
                );
                return;
              }
              if (event.type === "tool_started") {
                await checkpointDraft();
                const tool = input.toolPolicy
                  .listTurnTools()
                  .find((candidate) => candidate.name === event.toolName);
                const approval = input.toolPolicy.approvalForTool(
                  event.toolName,
                );
                await input.repository.recordToolStarted({
                  sessionId: input.sessionId,
                  turnId: input.admission.turnId,
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  ...(tool?.safety === undefined
                    ? {}
                    : { safety: tool.safety }),
                  ...(approval.status === undefined
                    ? {}
                    : { approvalStatus: approval.status }),
                  ...(approval.reason === undefined
                    ? {}
                    : { approvalReason: approval.reason }),
                });
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
                    timestamp,
                  }),
                );
                return;
              }
              await checkpointDraft();
              const tool = input.toolPolicy
                .listTurnTools()
                .find((candidate) => candidate.name === event.toolName);
              const approval = input.toolPolicy.approvalForTool(event.toolName);
              await input.repository.recordToolCompleted({
                sessionId: input.sessionId,
                turnId: input.admission.turnId,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                isError: event.isError,
                ...(tool?.safety === undefined ? {} : { safety: tool.safety }),
                ...(approval.status === undefined
                  ? {}
                  : { approvalStatus: approval.status }),
                ...(approval.reason === undefined
                  ? {}
                  : { approvalReason: approval.reason }),
              });
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
        await input.repository.completeTurn({
          commandId: input.commandId,
          sessionId: input.sessionId,
          turnId: input.admission.turnId,
          text: completed.text,
          ...(completed.parts === undefined ? {} : { parts: completed.parts }),
        });
        stream.wakeEvents(input.sessionId);
        input.onTurnSettled?.(input.sessionId);
      } catch (error) {
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
          input.onTurnSettled?.(input.sessionId);
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
        input.onTurnSettled?.(input.sessionId);
      } finally {
        if (checkpointTimer) clearTimeout(checkpointTimer);
        await checkpointChain.catch(() => undefined);
        activeTurns.delete(input.admission.turnId);
        input.onTurnSettled?.(input.sessionId);
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
    waitForIdle: async () => {
      shuttingDown = true;
      for (const active of activeTurns.values()) active.controller.abort();
      await Promise.allSettled([...inFlight]);
    },
  };
};
