import type {
  GlobalChatSessionEventEnvelope,
  GlobalChatSessionFollowUp,
  GlobalChatSessionLiveEventEnvelope,
  GlobalChatSessionMessage,
  GlobalChatSessionSummary,
  GlobalChatSessionTurn,
  ProjectSessionEventEnvelope,
  ProjectSessionFollowUp,
  ProjectSessionLiveEventEnvelope,
  ProjectSessionSummary,
  ProjectSessionTurn,
  SessionMessage,
} from "@spacezero/host-contracts";
import type { GlobalChatSessionClient } from "../global-chat-sessions/global-chat-session-client.js";
import type { ProjectSessionClient } from "../project-sessions/project-session-client.js";

export type SavedConversationKind = "project" | "global";
export type SavedConversationStatus =
  "idle" | "loading" | "ready" | "empty" | "unavailable" | "error";
export type SavedConversationConnectionStatus =
  "idle" | "connecting" | "connected" | "disconnected";
export type SavedConversationRuntimeStatus =
  | "idle"
  | "running"
  | "completed"
  | "interrupted"
  | "failed"
  | "recovery_required";
export type SavedConversationSendState =
  "available" | "submitting" | "unresolved" | "unavailable";
export type SavedConversationMessageStatus = "pending" | "failed";
export type SavedConversationFollowUpState =
  "queued" | "dispatched" | "consumed" | "cancelled" | "recovery_required";
export type SavedConversationFollowUpStatus = "pending" | "failed";

export interface SavedConversationTextPart {
  readonly id: string;
  readonly type: "text";
  readonly order: number;
  readonly text: string;
  readonly turnId?: string;
}

export interface SavedConversationReasoningPart {
  readonly id: string;
  readonly type: "reasoning";
  readonly order: number;
  readonly text: string;
  readonly turnId?: string;
}

export type SavedConversationToolCallStatus =
  "running" | "succeeded" | "failed";
export type SavedConversationToolJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly SavedConversationToolJsonValue[]
  | { readonly [key: string]: SavedConversationToolJsonValue };
export interface SavedConversationToolJsonObject {
  readonly [key: string]: SavedConversationToolJsonValue;
}
export type SavedConversationToolImageMimeType =
  "image/png" | "image/jpeg" | "image/webp" | "image/gif";
export type SavedConversationToolDisplayContent =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "image";
      readonly data: string;
      readonly mimeType: SavedConversationToolImageMimeType;
    }
  | {
      readonly type: "unsupported";
      readonly label: string;
    };
export interface SavedConversationToolDisplayResult {
  readonly content: readonly SavedConversationToolDisplayContent[];
  readonly truncated?: boolean;
}

export interface SavedConversationToolCallPart {
  readonly id: string;
  readonly type: "tool-call";
  readonly order: number;
  readonly turnId?: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: SavedConversationToolCallStatus;
  readonly arguments?: SavedConversationToolJsonObject;
  readonly progress?: string;
  readonly result?: SavedConversationToolDisplayResult;
  readonly safety?: "read" | "write" | "dangerous";
  readonly approvalStatus?: "approved" | "requires_approval";
  readonly approvalReason?: string;
}

export type SavedConversationMessagePart =
  | SavedConversationTextPart
  | SavedConversationReasoningPart
  | SavedConversationToolCallPart;

export interface SavedConversationMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly sequence: number;
  readonly createdAt: string;
  readonly commandId?: string;
  readonly turnId?: string;
  readonly status?: SavedConversationMessageStatus;
  readonly errorMessage?: string;
  readonly parts: readonly SavedConversationMessagePart[];
}

export interface SavedConversationFollowUp {
  readonly id: string;
  readonly commandId: string;
  readonly prompt: string;
  readonly state: SavedConversationFollowUpState;
  readonly position: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly dispatchedTurnId?: string;
  readonly status?: SavedConversationFollowUpStatus;
  readonly errorMessage?: string;
}

export interface SavedConversationProjection {
  readonly session: {
    readonly kind: SavedConversationKind;
    readonly id: string;
  };
  readonly status: SavedConversationStatus;
  readonly title?: string;
  readonly messages: readonly SavedConversationMessage[];
  readonly history: {
    readonly hasMoreOlder: boolean;
    readonly loadingOlder: boolean;
  };
  readonly queue: {
    readonly followUps: readonly SavedConversationFollowUp[];
  };
  readonly lastSequence: number;
  readonly runtime: {
    readonly status: SavedConversationRuntimeStatus;
    readonly activeTurnId?: string;
    readonly latestTurnId?: string;
  };
  readonly connection: {
    readonly status: SavedConversationConnectionStatus;
    readonly message?: string;
  };
  readonly actions: {
    readonly send: SavedConversationSendState;
    readonly stop: "available" | "unavailable";
    readonly edit: "unavailable";
    readonly regenerate: "unavailable";
    readonly executeTool: "unavailable";
    readonly approveTool: "unavailable";
  };
  readonly error?: {
    readonly message: string;
  };
}

export interface SavedConversationStopTarget {
  readonly sessionId: string;
  readonly turnId: string;
}

export interface SavedConversationStore {
  readonly getSnapshot: () => SavedConversationProjection;
  readonly subscribe: (listener: () => void) => () => void;
  readonly load: () => Promise<SavedConversationProjection>;
  readonly loadOlder: () => Promise<SavedConversationProjection>;
  readonly send: (prompt: string) => Promise<void>;
  readonly cancelFollowUp: (followUpId: string) => Promise<void>;
  readonly stop: (target: SavedConversationStopTarget) => Promise<void>;
  readonly dispose: () => void;
}

interface SavedConversationConnectorResult {
  readonly title?: string;
  readonly lastSequence: number;
  readonly messages: readonly (SessionMessage | GlobalChatSessionMessage)[];
  readonly hasMoreOlder?: boolean;
  readonly followUps?: readonly (
    ProjectSessionFollowUp | GlobalChatSessionFollowUp
  )[];
  readonly activeTurn?: ProjectSessionTurn | GlobalChatSessionTurn;
  readonly latestTurn?: ProjectSessionTurn | GlobalChatSessionTurn;
}

interface SavedConversationSubmitResult {
  readonly session: ProjectSessionSummary | GlobalChatSessionSummary;
  readonly turn: ProjectSessionTurn | GlobalChatSessionTurn;
  readonly userMessage: SessionMessage | GlobalChatSessionMessage;
}

interface SavedConversationEventSubscription {
  readonly cancel: () => void;
  readonly closed: Promise<void>;
}

interface CreateSavedConversationStoreInput {
  readonly kind: SavedConversationKind;
  readonly sessionId: string;
  readonly load: (options?: {
    readonly beforeSequence?: number;
    readonly limit?: number;
  }) => Promise<SavedConversationConnectorResult>;
  readonly submitPrompt?: (input: {
    readonly sessionId: string;
    readonly prompt: string;
    readonly commandId: string;
  }) => Promise<SavedConversationSubmitResult>;
  readonly enqueueFollowUp?: (input: {
    readonly sessionId: string;
    readonly prompt: string;
    readonly commandId: string;
  }) => Promise<{
    readonly followUp: ProjectSessionFollowUp | GlobalChatSessionFollowUp;
  }>;
  readonly cancelFollowUp?: (input: {
    readonly sessionId: string;
    readonly followUpId: string;
  }) => Promise<{
    readonly followUp: ProjectSessionFollowUp | GlobalChatSessionFollowUp;
  }>;
  readonly createWithFirstPrompt?: (input: {
    readonly prompt: string;
    readonly commandId: string;
  }) => Promise<SavedConversationSubmitResult>;
  readonly subscribeEvents?: (input: {
    readonly sessionId: string;
    readonly after: number;
    readonly onEvent: (
      event: ProjectSessionEventEnvelope | GlobalChatSessionEventEnvelope,
    ) => void;
    readonly onLiveEvent?: (
      event:
        ProjectSessionLiveEventEnvelope | GlobalChatSessionLiveEventEnvelope,
    ) => void;
    readonly onError?: (error: Error) => void;
    readonly onOpen?: () => void;
  }) => SavedConversationEventSubscription;
  readonly interruptTurn?: (input: {
    readonly sessionId: string;
    readonly turnId: string;
  }) => Promise<unknown>;
  readonly createCommandId?: () => string;
  readonly createPendingMessageId?: (commandId: string) => string;
  readonly now?: () => string;
}

const defaultHistoryPageSize = 50;

const unavailableActions: SavedConversationProjection["actions"] = {
  send: "unavailable",
  stop: "unavailable",
  edit: "unavailable",
  regenerate: "unavailable",
  executeTool: "unavailable",
  approveTool: "unavailable",
};

const textPart = (input: {
  readonly messageId: string;
  readonly text: string;
  readonly turnId?: string;
}): SavedConversationTextPart => ({
  id: `${input.messageId}:text:1`,
  type: "text",
  order: 1,
  text: input.text,
  ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
});

const messageWithParts = (
  message: Omit<SavedConversationMessage, "parts"> & {
    readonly parts?: readonly SavedConversationMessagePart[];
  },
): SavedConversationMessage => ({
  ...message,
  parts: message.parts ?? [
    textPart({
      messageId: message.id,
      text: message.text,
      ...(message.turnId === undefined ? {} : { turnId: message.turnId }),
    }),
  ],
});

const actions = (input: {
  readonly canSend: boolean;
  readonly send: SavedConversationSendState;
  readonly canStop: boolean;
}): SavedConversationProjection["actions"] => ({
  ...unavailableActions,
  send: input.canSend ? input.send : "unavailable",
  stop: input.canStop ? "available" : "unavailable",
});

const initialSnapshot = (
  kind: SavedConversationKind,
  sessionId: string,
  canSend: boolean,
): SavedConversationProjection => ({
  session: { kind, id: sessionId },
  status: "idle",
  messages: [],
  history: { hasMoreOlder: false, loadingOlder: false },
  queue: { followUps: [] },
  lastSequence: 0,
  runtime: { status: "idle" },
  connection: { status: "idle" },
  actions: actions({ canSend, send: "available", canStop: false }),
});

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "conversation unavailable";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const submitErrorStatus = (error: unknown): number | undefined => {
  if (!isRecord(error)) return undefined;
  const response = error.response;
  if (isRecord(response) && typeof response.status === "number")
    return response.status;
  const reason = error.reason;
  if (!isRecord(reason)) return undefined;
  const reasonResponse = reason.response;
  if (isRecord(reasonResponse) && typeof reasonResponse.status === "number")
    return reasonResponse.status;
  return undefined;
};

const isDefinitiveSubmitError = (error: unknown): boolean => {
  const status = submitErrorStatus(error);
  return status !== undefined && status >= 400 && status < 500;
};

const sortMessages = (
  messages: readonly (SessionMessage | GlobalChatSessionMessage)[],
): readonly SavedConversationMessage[] =>
  [...messages]
    .sort((left, right) => left.sequence - right.sequence)
    .map((message) =>
      messageWithParts({
        id: message.id,
        role: message.role,
        text: message.text,
        sequence: message.sequence,
        createdAt: message.createdAt,
        ...("commandId" in message && typeof message.commandId === "string"
          ? { commandId: message.commandId }
          : {}),
        ...("turnId" in message && typeof message.turnId === "string"
          ? { turnId: message.turnId }
          : {}),
        ...("parts" in message && Array.isArray(message.parts)
          ? { parts: message.parts as readonly SavedConversationMessagePart[] }
          : {}),
      }),
    );

const isRecoveryFailureReason = (reason: string | undefined): boolean =>
  reason === "session_recovery_required" ||
  reason === "global_chat_session_recovery_required" ||
  reason === "conversation_persistence_failed";

const runtimeStatus = (
  activeTurn: ProjectSessionTurn | GlobalChatSessionTurn | undefined,
  latestTurn: ProjectSessionTurn | GlobalChatSessionTurn | undefined,
): SavedConversationProjection["runtime"] => {
  if (activeTurn)
    return {
      status:
        activeTurn.state === "recovery_required"
          ? "recovery_required"
          : "running",
      activeTurnId: activeTurn.id,
      latestTurnId: latestTurn?.id ?? activeTurn.id,
    };
  if (!latestTurn) return { status: "idle" };
  switch (latestTurn.state) {
    case "running":
    case "queued":
      return { status: "running", latestTurnId: latestTurn.id };
    case "completed":
      return { status: "completed", latestTurnId: latestTurn.id };
    case "interrupted":
      return { status: "interrupted", latestTurnId: latestTurn.id };
    case "failed":
      return { status: "failed", latestTurnId: latestTurn.id };
    case "recovery_required":
      return { status: "recovery_required", latestTurnId: latestTurn.id };
  }
  return { status: "idle" };
};

const appendActiveDraft = (
  messages: readonly SavedConversationMessage[],
  activeTurn: ProjectSessionTurn | GlobalChatSessionTurn | undefined,
): readonly SavedConversationMessage[] => {
  if (!activeTurn || activeTurn.draftText.length === 0) return messages;
  if (messages.some((message) => message.id === activeTurn.assistantMessageId))
    return messages;
  return [
    ...messages,
    messageWithParts({
      id: activeTurn.assistantMessageId,
      role: "assistant",
      text: activeTurn.draftText,
      sequence: Math.max(...messages.map((message) => message.sequence), 0) + 1,
      createdAt: activeTurn.updatedAt,
      turnId: activeTurn.id,
      ...("draftParts" in activeTurn && Array.isArray(activeTurn.draftParts)
        ? {
            parts:
              activeTurn.draftParts as readonly SavedConversationMessagePart[],
          }
        : {}),
    }),
  ];
};

const unresolvedPendingMessages = (
  current: SavedConversationProjection,
  loadedMessages: readonly SavedConversationMessage[],
): readonly SavedConversationMessage[] => {
  if (current.actions.send !== "unresolved") return [];
  return current.messages.filter(
    (message) =>
      message.role === "user" &&
      message.status === "pending" &&
      message.commandId !== undefined &&
      !loadedMessages.some(
        (loadedMessage) => loadedMessage.commandId === message.commandId,
      ),
  );
};

const unresolvedPendingFollowUps = (
  current: SavedConversationProjection,
  loadedFollowUps: readonly SavedConversationFollowUp[],
): readonly SavedConversationFollowUp[] => {
  if (current.actions.send !== "unresolved") return [];
  return current.queue.followUps.filter(
    (followUp) =>
      followUp.status === "pending" &&
      !loadedFollowUps.some(
        (loadedFollowUp) => loadedFollowUp.commandId === followUp.commandId,
      ),
  );
};

const mergeFollowUps = (
  followUps: readonly SavedConversationFollowUp[],
  pendingFollowUps: readonly SavedConversationFollowUp[],
): readonly SavedConversationFollowUp[] =>
  [...followUps, ...pendingFollowUps].sort((left, right) =>
    left.position === right.position
      ? left.createdAt.localeCompare(right.createdAt)
      : left.position - right.position,
  );

const mergeMessages = (
  messages: readonly SavedConversationMessage[],
  pendingMessages: readonly SavedConversationMessage[],
): readonly SavedConversationMessage[] =>
  uniqueMessages([...messages, ...pendingMessages]);

const uniqueMessages = (
  messages: readonly SavedConversationMessage[],
): readonly SavedConversationMessage[] => {
  const byId = new Map<string, SavedConversationMessage>();
  for (const message of messages) byId.set(message.id, message);
  return [...byId.values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
};

const sortFollowUps = (
  followUps: readonly (ProjectSessionFollowUp | GlobalChatSessionFollowUp)[],
): readonly SavedConversationFollowUp[] =>
  [...followUps]
    .sort((left, right) =>
      left.position === right.position
        ? left.createdAt.localeCompare(right.createdAt)
        : left.position - right.position,
    )
    .map((followUp) => ({
      id: followUp.id,
      commandId: followUp.commandId,
      prompt: followUp.prompt,
      state: followUp.state,
      position: followUp.position,
      createdAt: followUp.createdAt,
      updatedAt: followUp.updatedAt,
      ...(followUp.dispatchedTurnId === undefined
        ? {}
        : { dispatchedTurnId: followUp.dispatchedTurnId }),
    }));

const upsertFollowUp = (
  followUps: readonly SavedConversationFollowUp[],
  followUp: SavedConversationFollowUp,
): readonly SavedConversationFollowUp[] =>
  [
    ...followUps.filter(
      (candidate) => candidate.commandId !== followUp.commandId,
    ),
    followUp,
  ].sort((left, right) =>
    left.position === right.position
      ? left.createdAt.localeCompare(right.createdAt)
      : left.position - right.position,
  );

const followUpFromEvent = (input: {
  readonly followUpId: string;
  readonly commandId: string;
  readonly prompt: string;
  readonly position: number;
  readonly timestamp: string;
  readonly state?: SavedConversationFollowUpState;
}): SavedConversationFollowUp => ({
  id: input.followUpId,
  commandId: input.commandId,
  prompt: input.prompt,
  state: input.state ?? "queued",
  position: input.position,
  createdAt: input.timestamp,
  updatedAt: input.timestamp,
});

const updateFollowUpState = (
  followUps: readonly SavedConversationFollowUp[],
  input: {
    readonly followUpId: string;
    readonly commandId: string;
    readonly state: SavedConversationFollowUpState;
    readonly timestamp: string;
    readonly dispatchedTurnId?: string;
  },
): readonly SavedConversationFollowUp[] => {
  const existing = followUps.find(
    (candidate) =>
      candidate.id === input.followUpId ||
      candidate.commandId === input.commandId,
  );
  if (!existing) return followUps;
  const { status: _status, errorMessage: _errorMessage, ...settled } = existing;
  void _status;
  void _errorMessage;
  return upsertFollowUp(followUps, {
    ...settled,
    id: input.followUpId,
    commandId: input.commandId,
    state: input.state,
    updatedAt: input.timestamp,
    ...(input.dispatchedTurnId === undefined
      ? {}
      : { dispatchedTurnId: input.dispatchedTurnId }),
  });
};

const hasPendingCommand = (projection: SavedConversationProjection): boolean =>
  projection.messages.some(
    (message) => message.role === "user" && message.status === "pending",
  ) ||
  projection.queue.followUps.some((followUp) => followUp.status === "pending");

const upsertMessage = (
  messages: readonly SavedConversationMessage[],
  message: SavedConversationMessage,
  replace: (candidate: SavedConversationMessage) => boolean = (candidate) =>
    candidate.id === message.id,
): readonly SavedConversationMessage[] => {
  const without = messages.filter((candidate) => !replace(candidate));
  return [...without, message].sort(
    (left, right) => left.sequence - right.sequence,
  );
};

const setAssistantText = (
  messages: readonly SavedConversationMessage[],
  input: {
    readonly id: string;
    readonly text: string;
    readonly sequence: number;
    readonly createdAt: string;
    readonly turnId: string;
    readonly parts?: readonly SavedConversationMessagePart[];
  },
): readonly SavedConversationMessage[] =>
  upsertMessage(
    messages,
    messageWithParts({
      id: input.id,
      role: "assistant",
      text: input.text,
      sequence: input.sequence,
      createdAt: input.createdAt,
      turnId: input.turnId,
      ...(input.parts === undefined ? {} : { parts: input.parts }),
    }),
  );

const findAssistantMessageForTurn = (
  messages: readonly SavedConversationMessage[],
  turnId: string,
): SavedConversationMessage | undefined =>
  [...messages]
    .reverse()
    .find(
      (message) => message.role === "assistant" && message.turnId === turnId,
    );

const upsertToolPart = (
  messages: readonly SavedConversationMessage[],
  input: {
    readonly turnId: string;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly status: SavedConversationToolCallStatus;
    readonly sequence: number;
    readonly timestamp: string;
    readonly arguments?: SavedConversationToolJsonObject;
    readonly progress?: string;
    readonly result?: SavedConversationToolDisplayResult;
    readonly safety?: "read" | "write" | "dangerous";
    readonly approvalStatus?: "approved" | "requires_approval";
    readonly approvalReason?: string;
  },
): readonly SavedConversationMessage[] => {
  const existing = findAssistantMessageForTurn(messages, input.turnId);
  if (!existing) return messages;
  const prior = existing.parts.find(
    (part): part is SavedConversationToolCallPart =>
      part.type === "tool-call" && part.toolCallId === input.toolCallId,
  );
  const order =
    prior?.order ??
    Math.max(0, ...existing.parts.map((part) => part.order)) + 1;
  const part: SavedConversationToolCallPart = {
    ...(prior ?? {
      id: `${existing.id}:tool-call:${input.toolCallId}`,
      type: "tool-call" as const,
      order,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
    }),
    status: input.status,
    ...(input.arguments === undefined ? {} : { arguments: input.arguments }),
    ...(input.progress === undefined ? {} : { progress: input.progress }),
    ...(input.result === undefined ? {} : { result: input.result }),
    ...(input.safety === undefined ? {} : { safety: input.safety }),
    ...(input.approvalStatus === undefined
      ? {}
      : { approvalStatus: input.approvalStatus }),
    ...(input.approvalReason === undefined
      ? {}
      : { approvalReason: input.approvalReason }),
  };
  return upsertMessage(messages, {
    ...existing,
    sequence: Math.max(existing.sequence, input.sequence),
    createdAt: existing.createdAt ?? input.timestamp,
    parts: [
      ...existing.parts.filter((candidate) => candidate.id !== part.id),
      part,
    ].sort((left, right) => left.order - right.order),
  });
};

const applyDurableEvent = (
  projection: SavedConversationProjection,
  envelope: ProjectSessionEventEnvelope | GlobalChatSessionEventEnvelope,
  canSend: boolean,
  canQueueFollowUp = false,
  canStopAvailable = true,
): SavedConversationProjection => {
  if (envelope.sequence <= projection.lastSequence) return projection;
  const event = envelope.event;
  const base = {
    ...projection,
    lastSequence: Math.max(projection.lastSequence, envelope.sequence),
  };
  switch (event.type) {
    case "UserMessageSubmittedV1":
    case "GlobalChatUserMessageSubmittedV1":
      return {
        ...base,
        status: "ready",
        messages: upsertMessage(
          base.messages,
          messageWithParts({
            id: event.messageId,
            role: "user",
            text: event.prompt,
            commandId: event.commandId,
            sequence: envelope.sequence,
            createdAt: event.timestamp,
          }),
          (candidate) =>
            candidate.id === event.messageId ||
            (candidate.status === "pending" &&
              candidate.commandId === event.commandId),
        ),
        actions: actions({
          canSend,
          send: "available",
          canStop: base.actions.stop === "available",
        }),
      };
    case "AgentTurnStartedV1":
    case "GlobalChatAgentTurnStartedV1":
      return {
        ...base,
        status: "ready",
        runtime: {
          status: "running",
          activeTurnId: event.turnId,
          latestTurnId: event.turnId,
        },
        messages: upsertMessage(
          base.messages,
          messageWithParts({
            id: event.messageId,
            role: "assistant",
            text: "",
            sequence: envelope.sequence,
            createdAt: event.timestamp,
            turnId: event.turnId,
            parts: [],
          }),
        ),
        actions: actions({
          canSend,
          send: canQueueFollowUp ? "available" : "unavailable",
          canStop: canStopAvailable,
        }),
      };
    case "AgentMessageCheckpointedV1":
    case "GlobalChatAgentMessageCheckpointedV1":
      return {
        ...base,
        status: "ready",
        messages: setAssistantText(base.messages, {
          id: event.messageId,
          text: event.text,
          sequence: envelope.sequence,
          createdAt: event.timestamp,
          turnId: event.turnId,
          ...("parts" in event && Array.isArray(event.parts)
            ? { parts: event.parts as readonly SavedConversationMessagePart[] }
            : {}),
        }),
      };
    case "AgentMessageCompletedV1":
    case "GlobalChatAgentMessageCompletedV1":
      return {
        ...base,
        status: "ready",
        runtime: { status: "completed", latestTurnId: event.turnId },
        messages: setAssistantText(base.messages, {
          id: event.messageId,
          text: event.text,
          sequence: envelope.sequence,
          createdAt: event.timestamp,
          turnId: event.turnId,
          ...("parts" in event && Array.isArray(event.parts)
            ? { parts: event.parts as readonly SavedConversationMessagePart[] }
            : {}),
        }),
        actions: actions({ canSend, send: "available", canStop: false }),
      };
    case "AgentTurnInterruptedV1":
    case "GlobalChatAgentTurnInterruptedV1":
      return {
        ...base,
        runtime: { status: "interrupted", latestTurnId: event.turnId },
        actions: actions({ canSend, send: "available", canStop: false }),
      };
    case "AgentTurnFailedV1":
    case "GlobalChatAgentTurnFailedV1": {
      const recoveryRequired = isRecoveryFailureReason(event.reason);
      return {
        ...base,
        runtime: {
          status: recoveryRequired ? "recovery_required" : "failed",
          latestTurnId: event.turnId,
        },
        actions: actions({
          canSend,
          send: recoveryRequired ? "unavailable" : "available",
          canStop: false,
        }),
      };
    }
    case "ProjectSessionFollowUpQueuedV1":
    case "GlobalChatSessionFollowUpQueuedV1":
      return {
        ...base,
        queue: {
          followUps: upsertFollowUp(
            base.queue.followUps,
            followUpFromEvent({
              followUpId: event.followUpId,
              commandId: event.commandId,
              prompt: event.prompt,
              position: event.position,
              timestamp: event.timestamp,
            }),
          ),
        },
        actions: actions({
          canSend,
          send: "available",
          canStop: base.actions.stop === "available",
        }),
      };
    case "ProjectSessionFollowUpDispatchedV1":
    case "GlobalChatSessionFollowUpDispatchedV1":
      return {
        ...base,
        queue: {
          followUps: updateFollowUpState(base.queue.followUps, {
            followUpId: event.followUpId,
            commandId: event.commandId,
            state: "dispatched",
            timestamp: event.timestamp,
          }),
        },
      };
    case "ProjectSessionFollowUpConsumedV1":
    case "GlobalChatSessionFollowUpConsumedV1":
      return {
        ...base,
        queue: {
          followUps: updateFollowUpState(base.queue.followUps, {
            followUpId: event.followUpId,
            commandId: event.commandId,
            state: "consumed",
            timestamp: event.timestamp,
            dispatchedTurnId: event.turnId,
          }),
        },
      };
    case "ProjectSessionFollowUpCancelledV1":
    case "GlobalChatSessionFollowUpCancelledV1":
      return {
        ...base,
        queue: {
          followUps: updateFollowUpState(base.queue.followUps, {
            followUpId: event.followUpId,
            commandId: event.commandId,
            state: "cancelled",
            timestamp: event.timestamp,
          }),
        },
      };
    case "ProjectSessionFollowUpRecoveryRequiredV1":
    case "GlobalChatSessionFollowUpRecoveryRequiredV1":
      return {
        ...base,
        queue: {
          followUps: updateFollowUpState(base.queue.followUps, {
            followUpId: event.followUpId,
            commandId: event.commandId,
            state: "recovery_required",
            timestamp: event.timestamp,
          }),
        },
      };
    case "AgentToolCallStartedV1":
    case "GlobalChatAgentToolCallStartedV1":
      return {
        ...base,
        messages: upsertToolPart(base.messages, {
          turnId: event.turnId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: "running",
          sequence: envelope.sequence,
          timestamp: event.timestamp,
          ...("arguments" in event && event.arguments !== undefined
            ? { arguments: event.arguments as SavedConversationToolJsonObject }
            : {}),
          ...(event.safety === undefined ? {} : { safety: event.safety }),
          ...(event.approvalStatus === undefined
            ? {}
            : { approvalStatus: event.approvalStatus }),
          ...(event.approvalReason === undefined
            ? {}
            : { approvalReason: event.approvalReason }),
        }),
      };
    case "AgentToolCallCompletedV1":
    case "GlobalChatAgentToolCallCompletedV1":
      return {
        ...base,
        messages: upsertToolPart(base.messages, {
          turnId: event.turnId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: event.status,
          sequence: envelope.sequence,
          timestamp: event.timestamp,
          ...("result" in event && event.result !== undefined
            ? { result: event.result as SavedConversationToolDisplayResult }
            : {}),
          ...(event.safety === undefined ? {} : { safety: event.safety }),
          ...(event.approvalStatus === undefined
            ? {}
            : { approvalStatus: event.approvalStatus }),
          ...(event.approvalReason === undefined
            ? {}
            : { approvalReason: event.approvalReason }),
        }),
      };
    case "ProjectSessionRecoveryRequiredV1":
      return {
        ...base,
        runtime: { status: "recovery_required" },
        actions: actions({ canSend, send: "unavailable", canStop: false }),
      };
    default:
      return base;
  }
};

const livePartId = (input: {
  readonly messageId: string;
  readonly type: "text" | "reasoning";
  readonly order: number;
}): string => `${input.messageId}:${input.type}:${input.order}`;

const appendPartDelta = (
  parts: readonly SavedConversationMessagePart[],
  input: {
    readonly messageId: string;
    readonly turnId: string;
    readonly type: "text" | "reasoning";
    readonly order: number;
    readonly text: string;
  },
): readonly SavedConversationMessagePart[] => {
  const id = livePartId(input);
  const existing = parts.find((part) => part.id === id);
  const existingText =
    existing?.type === "text" || existing?.type === "reasoning"
      ? existing.text
      : "";
  const next = {
    id,
    type: input.type,
    order: input.order,
    text: `${existingText}${input.text}`,
    turnId: input.turnId,
  } as SavedConversationMessagePart;
  return [...parts.filter((part) => part.id !== id), next].sort(
    (left, right) => left.order - right.order,
  );
};

const applyLiveEvent = (
  projection: SavedConversationProjection,
  envelope:
    ProjectSessionLiveEventEnvelope | GlobalChatSessionLiveEventEnvelope,
): SavedConversationProjection => {
  const event = envelope.event;
  if (
    event.type === "ConversationPersistenceFailedV1" ||
    event.type === "GlobalChatConversationPersistenceFailedV1"
  ) {
    return {
      ...projection,
      runtime: {
        status: "recovery_required",
        activeTurnId: event.turnId,
        latestTurnId: event.turnId,
      },
      actions: actions({ canSend: true, send: "unavailable", canStop: false }),
    };
  }
  if (
    event.type === "AgentToolCallUpdatedV1" ||
    event.type === "GlobalChatAgentToolCallUpdatedV1"
  ) {
    if (projection.runtime.activeTurnId !== event.turnId) return projection;
    return {
      ...projection,
      status: "ready",
      messages: upsertToolPart(projection.messages, {
        turnId: event.turnId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: "running",
        sequence: projection.lastSequence,
        timestamp: event.timestamp,
        progress: event.summary,
        ...("progress" in event && event.progress !== undefined
          ? { result: event.progress as SavedConversationToolDisplayResult }
          : {}),
      }),
    };
  }
  if (
    event.type !== "AssistantTextDeltaV1" &&
    event.type !== "GlobalChatAssistantTextDeltaV1" &&
    event.type !== "AssistantReasoningDeltaV1" &&
    event.type !== "GlobalChatAssistantReasoningDeltaV1"
  )
    return projection;
  const isActiveTurn =
    projection.runtime.status === "running" &&
    (projection.runtime.activeTurnId === event.turnId ||
      projection.runtime.latestTurnId === event.turnId);
  if (!isActiveTurn) return projection;
  const existing = projection.messages.find(
    (message) => message.id === event.messageId,
  );
  const isReasoning =
    event.type === "AssistantReasoningDeltaV1" ||
    event.type === "GlobalChatAssistantReasoningDeltaV1";
  const parts = appendPartDelta(existing?.parts ?? [], {
    messageId: event.messageId,
    turnId: event.turnId,
    type: isReasoning ? "reasoning" : "text",
    order: isReasoning ? event.order : (event.order ?? 1),
    text: event.text,
  });
  return {
    ...projection,
    status: "ready",
    messages: upsertMessage(
      projection.messages,
      messageWithParts({
        id: event.messageId,
        role: "assistant",
        text: isReasoning
          ? (existing?.text ?? "")
          : `${existing?.text ?? ""}${event.text}`,
        sequence: existing?.sequence ?? projection.lastSequence + 1,
        createdAt: existing?.createdAt ?? event.timestamp,
        turnId: event.turnId,
        parts,
      }),
    ),
  };
};

export const createSavedConversationStore = ({
  kind,
  sessionId,
  load,
  submitPrompt,
  enqueueFollowUp,
  cancelFollowUp,
  createWithFirstPrompt,
  subscribeEvents,
  interruptTurn,
  createCommandId = () => globalThis.crypto.randomUUID(),
  createPendingMessageId = (commandId) => `pending:${commandId}`,
  now = () => new Date().toISOString(),
}: CreateSavedConversationStoreInput): SavedConversationStore => {
  const listeners = new Set<() => void>();
  let disposed = false;
  let currentSessionId = sessionId;
  const canSubmitPrompt = () =>
    submitPrompt !== undefined ||
    (createWithFirstPrompt !== undefined && currentSessionId === sessionId);
  const canEnqueueFollowUp = () => enqueueFollowUp !== undefined;
  const canSend = () => canSubmitPrompt() || canEnqueueFollowUp();
  let snapshot = initialSnapshot(kind, sessionId, canSend());
  let subscription: SavedConversationEventSubscription | undefined;
  let interruptingTurnId: string | undefined;

  const canStopActiveTurn = (): boolean =>
    interruptTurn !== undefined && interruptingTurnId === undefined;

  const publish = (next: SavedConversationProjection): void => {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const reconnectFromAuthoritativeSnapshot = (
    subscriptionSessionId: string,
  ): void => {
    void loadProjection({ limit: defaultHistoryPageSize })
      .then((next) => {
        if (disposed || currentSessionId !== subscriptionSessionId) return;
        publish({ ...next, connection: { status: "connected" } });
      })
      .catch((error) => {
        if (disposed || currentSessionId !== subscriptionSessionId) return;
        publish({
          ...snapshot,
          connection: {
            status: "disconnected",
            message: toErrorMessage(error),
          },
          error: { message: toErrorMessage(error) },
        });
      });
  };

  const resubscribe = (after: number): void => {
    subscription?.cancel();
    if (!subscribeEvents || disposed || currentSessionId === "") return;
    const subscriptionSessionId = currentSessionId;
    subscription = subscribeEvents({
      sessionId: subscriptionSessionId,
      after,
      onEvent: (event) => {
        const next = applyDurableEvent(
          snapshot,
          event,
          canSend(),
          canEnqueueFollowUp(),
          canStopActiveTurn(),
        );
        publish({ ...next, connection: { status: "connected" } });
      },
      onLiveEvent: (event) => {
        const next = applyLiveEvent(snapshot, event);
        publish({ ...next, connection: { status: "connected" } });
      },
      onError: (error) => {
        publish({
          ...snapshot,
          connection: { status: "disconnected", message: error.message },
          actions: actions({
            canSend: canSend(),
            send: hasPendingCommand(snapshot) ? "unresolved" : "unavailable",
            canStop: false,
          }),
          error: { message: error.message },
        });
      },
      onOpen: () => {
        if (snapshot.connection.status === "disconnected") {
          reconnectFromAuthoritativeSnapshot(subscriptionSessionId);
          return;
        }
        publish({ ...snapshot, connection: { status: "connected" } });
      },
    });
    void subscription.closed.catch(() => undefined);
  };

  const loadProjection = async (options?: {
    readonly beforeSequence?: number;
    readonly limit?: number;
  }): Promise<SavedConversationProjection> => {
    const isOlderPageLoad = options?.beforeSequence !== undefined;
    const loaded = await load(options);
    const loadedMessages = appendActiveDraft(
      sortMessages(loaded.messages),
      loaded.activeTurn,
    );
    const savedSnapshotMessages = snapshot.messages.filter(
      (message) => message.status === undefined,
    );
    const authoritativeMessages =
      options?.limit === undefined
        ? loadedMessages
        : uniqueMessages([...savedSnapshotMessages, ...loadedMessages]);
    const loadedFollowUps = sortFollowUps(loaded.followUps ?? []);
    const pendingMessages = unresolvedPendingMessages(
      snapshot,
      authoritativeMessages,
    );
    const pendingFollowUps = unresolvedPendingFollowUps(
      snapshot,
      loadedFollowUps,
    );
    const messages = mergeMessages(authoritativeMessages, pendingMessages);
    const followUps = mergeFollowUps(loadedFollowUps, pendingFollowUps);
    const runtime = runtimeStatus(loaded.activeTurn, loaded.latestTurn);
    const hasUnresolved =
      pendingMessages.length > 0 || pendingFollowUps.length > 0;
    return {
      session: { kind, id: currentSessionId },
      status: messages.length === 0 ? "empty" : "ready",
      ...(loaded.title === undefined ? {} : { title: loaded.title }),
      messages,
      history: {
        hasMoreOlder: loaded.hasMoreOlder ?? false,
        loadingOlder: false,
      },
      queue: { followUps },
      lastSequence: isOlderPageLoad
        ? snapshot.lastSequence
        : Math.max(snapshot.lastSequence, loaded.lastSequence),
      runtime,
      connection: { status: "connected" },
      actions: actions({
        canSend: canSend(),
        send: hasUnresolved
          ? "unresolved"
          : runtime.status === "recovery_required"
            ? "unavailable"
            : runtime.status === "running" && enqueueFollowUp === undefined
              ? "unavailable"
              : "available",
        canStop: runtime.status === "running" && canStopActiveTurn(),
      }),
    };
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load: async () => {
      const { error: _error, ...current } = snapshot;
      void _error;
      publish({
        ...current,
        status: "loading",
        connection: { status: "connecting" },
      });
      try {
        const next = await loadProjection({ limit: defaultHistoryPageSize });
        publish(next);
        resubscribe(next.lastSequence);
        return next;
      } catch (error) {
        const next: SavedConversationProjection = {
          ...snapshot,
          status: "error",
          connection: {
            status: "disconnected",
            message: toErrorMessage(error),
          },
          error: { message: toErrorMessage(error) },
        };
        publish(next);
        throw error;
      }
    },
    loadOlder: async () => {
      if (!snapshot.history.hasMoreOlder || snapshot.history.loadingOlder)
        return snapshot;
      const oldestSequence = snapshot.messages.find(
        (message) => message.status === undefined,
      )?.sequence;
      if (oldestSequence === undefined) return snapshot;
      publish({
        ...snapshot,
        history: { ...snapshot.history, loadingOlder: true },
      });
      try {
        const next = await loadProjection({
          beforeSequence: oldestSequence,
          limit: defaultHistoryPageSize,
        });
        publish({
          ...next,
          connection: snapshot.connection,
        });
        return next;
      } catch (error) {
        const next: SavedConversationProjection = {
          ...snapshot,
          history: { ...snapshot.history, loadingOlder: false },
          error: { message: toErrorMessage(error) },
        };
        publish(next);
        throw error;
      }
    },
    send: async (prompt) => {
      if (!canSend() || snapshot.actions.send !== "available")
        throw new Error("send unavailable");
      const trimmed = prompt.trim();
      if (trimmed.length === 0) throw new Error("prompt must not be blank");
      const commandId = createCommandId();
      const shouldEnqueue =
        snapshot.runtime.status === "running" && enqueueFollowUp !== undefined;
      if (shouldEnqueue) {
        const pendingFollowUp: SavedConversationFollowUp = {
          id: createPendingMessageId(commandId),
          commandId,
          prompt: trimmed,
          state: "queued",
          position:
            Math.max(
              0,
              ...snapshot.queue.followUps.map((item) => item.position),
            ) + 1,
          createdAt: now(),
          updatedAt: now(),
          status: "pending",
        };
        publish({
          ...snapshot,
          queue: {
            followUps: upsertFollowUp(
              snapshot.queue.followUps,
              pendingFollowUp,
            ),
          },
          actions: actions({
            canSend: canSend(),
            send: "submitting",
            canStop: snapshot.actions.stop === "available",
          }),
        });
        try {
          const result = await enqueueFollowUp({
            sessionId: currentSessionId,
            prompt: trimmed,
            commandId,
          });
          publish({
            ...snapshot,
            queue: {
              followUps: upsertFollowUp(
                snapshot.queue.followUps,
                sortFollowUps([result.followUp])[0]!,
              ),
            },
            actions: actions({
              canSend: canSend(),
              send: "available",
              canStop: snapshot.actions.stop === "available",
            }),
          });
        } catch (error) {
          if (isDefinitiveSubmitError(error)) {
            publish({
              ...snapshot,
              queue: {
                followUps: snapshot.queue.followUps.map((followUp) =>
                  followUp.id === pendingFollowUp.id
                    ? {
                        ...followUp,
                        status: "failed",
                        errorMessage: toErrorMessage(error),
                      }
                    : followUp,
                ),
              },
              actions: actions({
                canSend: canSend(),
                send: "available",
                canStop: snapshot.actions.stop === "available",
              }),
              error: { message: toErrorMessage(error) },
            });
          } else {
            publish({
              ...snapshot,
              actions: actions({
                canSend: canSend(),
                send: "unresolved",
                canStop: snapshot.actions.stop === "available",
              }),
              error: { message: toErrorMessage(error) },
            });
          }
          throw error;
        }
        return;
      }
      if (snapshot.runtime.status === "running" || !canSubmitPrompt())
        throw new Error("send unavailable");
      const pending = messageWithParts({
        id: createPendingMessageId(commandId),
        role: "user" as const,
        text: trimmed,
        sequence: snapshot.lastSequence + 1,
        createdAt: now(),
        commandId,
        status: "pending" as const,
      });
      publish({
        ...snapshot,
        status: "ready",
        messages: upsertMessage(snapshot.messages, pending),
        actions: actions({
          canSend: canSend(),
          send: "submitting",
          canStop: false,
        }),
      });
      try {
        const result =
          createWithFirstPrompt !== undefined && currentSessionId === sessionId
            ? await createWithFirstPrompt({ prompt: trimmed, commandId })
            : await submitPrompt!({
                sessionId: currentSessionId,
                prompt: trimmed,
                commandId,
              });
        currentSessionId = result.session.id;
        const title =
          "title" in result.session
            ? result.session.title
            : result.session.name;
        const reconciled = applyDurableEvent(
          {
            ...snapshot,
            session: { kind, id: currentSessionId },
            title,
            lastSequence: result.userMessage.sequence - 1,
          },
          {
            sequence: result.userMessage.sequence,
            eventType:
              kind === "global"
                ? "GlobalChatUserMessageSubmittedV1"
                : "UserMessageSubmittedV1",
            event: {
              type:
                kind === "global"
                  ? "GlobalChatUserMessageSubmittedV1"
                  : "UserMessageSubmittedV1",
              version: 1,
              sessionId: currentSessionId,
              messageId: result.userMessage.id,
              commandId,
              prompt: result.userMessage.text,
              timestamp: result.userMessage.createdAt,
            } as never,
          },
          canSend(),
          canEnqueueFollowUp(),
          canStopActiveTurn(),
        );
        publish({
          ...reconciled,
          runtime: runtimeStatus(result.turn, result.turn),
          actions: actions({
            canSend: canSend(),
            send:
              result.turn.state === "running" && enqueueFollowUp === undefined
                ? "unavailable"
                : "available",
            canStop: canStopActiveTurn(),
          }),
        });
        resubscribe(result.userMessage.sequence);
      } catch (error) {
        if (isDefinitiveSubmitError(error)) {
          publish({
            ...snapshot,
            messages: snapshot.messages.map((message) =>
              message.id === pending.id
                ? messageWithParts({
                    ...message,
                    status: "failed",
                    errorMessage: toErrorMessage(error),
                  })
                : message,
            ),
            actions: actions({
              canSend: canSend(),
              send: "available",
              canStop: false,
            }),
            error: { message: toErrorMessage(error) },
          });
        } else {
          publish({
            ...snapshot,
            actions: actions({
              canSend: canSend(),
              send: "unresolved",
              canStop: false,
            }),
            error: { message: toErrorMessage(error) },
          });
        }
        throw error;
      }
    },
    cancelFollowUp: async (followUpId) => {
      if (!cancelFollowUp)
        throw new Error("follow-up cancellation unavailable");
      try {
        const result = await cancelFollowUp({
          sessionId: currentSessionId,
          followUpId,
        });
        publish({
          ...snapshot,
          queue: {
            followUps: upsertFollowUp(
              snapshot.queue.followUps,
              sortFollowUps([result.followUp])[0]!,
            ),
          },
        });
      } catch (error) {
        try {
          const next = await loadProjection({ limit: defaultHistoryPageSize });
          publish({ ...next, error: { message: toErrorMessage(error) } });
        } catch {
          publish({ ...snapshot, error: { message: toErrorMessage(error) } });
        }
        throw error;
      }
    },
    stop: async (target) => {
      if (target.sessionId !== currentSessionId) return;
      const turnId = snapshot.runtime.activeTurnId;
      if (snapshot.runtime.status !== "running" || turnId !== target.turnId)
        return;
      if (!canStopActiveTurn()) throw new Error("stop unavailable");
      const interrupt = interruptTurn;
      if (!interrupt) throw new Error("stop unavailable");
      const interruptedSessionId = target.sessionId;
      interruptingTurnId = target.turnId;
      publish({
        ...snapshot,
        actions: actions({
          canSend: canSend(),
          send: snapshot.actions.send,
          canStop: false,
        }),
      });
      try {
        await interrupt({ sessionId: interruptedSessionId, turnId });
      } finally {
        if (interruptingTurnId === turnId) interruptingTurnId = undefined;
        publish({
          ...snapshot,
          actions: actions({
            canSend: canSend(),
            send: snapshot.actions.send,
            canStop:
              snapshot.runtime.status === "running" && canStopActiveTurn(),
          }),
        });
      }
    },
    dispose: () => {
      disposed = true;
      subscription?.cancel();
      listeners.clear();
    },
  };
};

export const createProjectSessionSavedConversationStore = ({
  client,
  sessionId,
}: {
  readonly client: ProjectSessionClient;
  readonly sessionId: string;
}): SavedConversationStore => {
  const optionalClient = client as Partial<ProjectSessionClient>;
  return createSavedConversationStore({
    kind: "project",
    sessionId,
    load: async (options) => {
      const [result, followUpResult] = await Promise.all([
        client.listSessionMessages(sessionId, options),
        optionalClient.listFollowUps?.(sessionId),
      ]);
      return {
        title: result.session.name,
        lastSequence:
          followUpResult === undefined
            ? result.session.lastSequence
            : Math.min(
                result.session.lastSequence,
                followUpResult.session.lastSequence,
              ),
        messages: result.messages,
        hasMoreOlder: result.pageInfo?.hasMoreOlder ?? false,
        ...(followUpResult === undefined
          ? {}
          : { followUps: followUpResult.followUps }),
        ...(result.activeTurn === undefined
          ? {}
          : { activeTurn: result.activeTurn }),
        ...(result.latestTurn === undefined
          ? {}
          : { latestTurn: result.latestTurn }),
      };
    },
    ...(optionalClient.submitPrompt === undefined
      ? {}
      : {
          submitPrompt: ({ sessionId: id, prompt, commandId }) =>
            optionalClient.submitPrompt!(id, prompt, commandId),
        }),
    ...(optionalClient.enqueueFollowUp === undefined
      ? {}
      : {
          enqueueFollowUp: ({ sessionId: id, prompt, commandId }) =>
            optionalClient.enqueueFollowUp!(id, prompt, commandId),
        }),
    ...(optionalClient.cancelFollowUp === undefined
      ? {}
      : {
          cancelFollowUp: ({ sessionId: id, followUpId }) =>
            optionalClient.cancelFollowUp!(id, followUpId),
        }),
    ...(optionalClient.subscribeProjectSessionEvents === undefined
      ? {}
      : {
          subscribeEvents: (input) =>
            optionalClient.subscribeProjectSessionEvents!({
              sessionId: input.sessionId,
              after: input.after,
              onEvent: input.onEvent,
              ...(input.onLiveEvent === undefined
                ? {}
                : { onLiveEvent: input.onLiveEvent }),
              ...(input.onError === undefined
                ? {}
                : { onError: input.onError }),
              ...(input.onOpen === undefined ? {} : { onOpen: input.onOpen }),
            }),
        }),
    ...(optionalClient.interruptTurn === undefined
      ? {}
      : {
          interruptTurn: ({ sessionId: id, turnId }) =>
            optionalClient.interruptTurn!(id, turnId),
        }),
  });
};

export const createGlobalChatSessionSavedConversationStore = ({
  client,
  sessionId,
}: {
  readonly client: GlobalChatSessionClient;
  readonly sessionId: string;
}): SavedConversationStore => {
  const optionalClient = client as Partial<GlobalChatSessionClient>;
  return createSavedConversationStore({
    kind: "global",
    sessionId,
    load: async (options) => {
      const [result, followUpResult] = await Promise.all([
        client.listMessages(sessionId, options),
        optionalClient.listFollowUps?.(sessionId),
      ]);
      return {
        title: result.session.title,
        lastSequence:
          followUpResult === undefined
            ? result.session.lastSequence
            : Math.min(
                result.session.lastSequence,
                followUpResult.session.lastSequence,
              ),
        messages: result.messages,
        hasMoreOlder: result.pageInfo?.hasMoreOlder ?? false,
        ...(followUpResult === undefined
          ? {}
          : { followUps: followUpResult.followUps }),
        ...(result.activeTurn === undefined
          ? {}
          : { activeTurn: result.activeTurn }),
        ...(result.latestTurn === undefined
          ? {}
          : { latestTurn: result.latestTurn }),
      };
    },
    ...(optionalClient.submitPrompt === undefined
      ? {}
      : {
          submitPrompt: ({ sessionId: id, prompt, commandId }) =>
            optionalClient.submitPrompt!(id, prompt, commandId),
        }),
    ...(optionalClient.enqueueFollowUp === undefined
      ? {}
      : {
          enqueueFollowUp: ({ sessionId: id, prompt, commandId }) =>
            optionalClient.enqueueFollowUp!(id, prompt, commandId),
        }),
    ...(optionalClient.cancelFollowUp === undefined
      ? {}
      : {
          cancelFollowUp: ({ sessionId: id, followUpId }) =>
            optionalClient.cancelFollowUp!(id, followUpId),
        }),
    ...(optionalClient.subscribeEvents === undefined
      ? {}
      : {
          subscribeEvents: (input) =>
            optionalClient.subscribeEvents!({
              sessionId: input.sessionId,
              after: input.after,
              onEvent: input.onEvent,
              ...(input.onLiveEvent === undefined
                ? {}
                : { onLiveEvent: input.onLiveEvent }),
              ...(input.onError === undefined
                ? {}
                : { onError: input.onError }),
              ...(input.onOpen === undefined ? {} : { onOpen: input.onOpen }),
            }),
        }),
    ...(optionalClient.interruptTurn === undefined
      ? {}
      : {
          interruptTurn: ({ sessionId: id, turnId }) =>
            optionalClient.interruptTurn!(id, turnId),
        }),
  });
};

export const createGlobalChatDraftConversationStore = ({
  client,
}: {
  readonly client: GlobalChatSessionClient;
}): SavedConversationStore => {
  const optionalClient = client as Partial<GlobalChatSessionClient>;
  return createSavedConversationStore({
    kind: "global",
    sessionId: "draft",
    load: async () => ({ title: "New chat", lastSequence: 0, messages: [] }),
    createWithFirstPrompt: ({ prompt, commandId }) =>
      client.createWithFirstPrompt(prompt, commandId),
    ...(optionalClient.submitPrompt === undefined
      ? {}
      : {
          submitPrompt: ({ sessionId: id, prompt, commandId }) =>
            optionalClient.submitPrompt!(id, prompt, commandId),
        }),
    ...(optionalClient.enqueueFollowUp === undefined
      ? {}
      : {
          enqueueFollowUp: ({ sessionId: id, prompt, commandId }) =>
            optionalClient.enqueueFollowUp!(id, prompt, commandId),
        }),
    ...(optionalClient.cancelFollowUp === undefined
      ? {}
      : {
          cancelFollowUp: ({ sessionId: id, followUpId }) =>
            optionalClient.cancelFollowUp!(id, followUpId),
        }),
    ...(optionalClient.subscribeEvents === undefined
      ? {}
      : {
          subscribeEvents: (input) =>
            optionalClient.subscribeEvents!({
              sessionId: input.sessionId,
              after: input.after,
              onEvent: input.onEvent,
              ...(input.onLiveEvent === undefined
                ? {}
                : { onLiveEvent: input.onLiveEvent }),
              ...(input.onError === undefined
                ? {}
                : { onError: input.onError }),
              ...(input.onOpen === undefined ? {} : { onOpen: input.onOpen }),
            }),
        }),
    ...(optionalClient.interruptTurn === undefined
      ? {}
      : {
          interruptTurn: ({ sessionId: id, turnId }) =>
            optionalClient.interruptTurn!(id, turnId),
        }),
  });
};
