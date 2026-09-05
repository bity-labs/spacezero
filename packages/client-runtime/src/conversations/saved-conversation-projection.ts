import type {
  GlobalChatSessionEventEnvelope,
  GlobalChatSessionLiveEventEnvelope,
  GlobalChatSessionMessage,
  GlobalChatSessionSummary,
  GlobalChatSessionTurn,
  ProjectSessionEventEnvelope,
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
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected";
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

export interface SavedConversationTextPart {
  readonly id: string;
  readonly type: "text";
  readonly order: number;
  readonly text: string;
  readonly turnId?: string;
}

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
  readonly parts: readonly SavedConversationTextPart[];
}

export interface SavedConversationProjection {
  readonly session: {
    readonly kind: SavedConversationKind;
    readonly id: string;
  };
  readonly status: SavedConversationStatus;
  readonly title?: string;
  readonly messages: readonly SavedConversationMessage[];
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

export interface SavedConversationStore {
  readonly getSnapshot: () => SavedConversationProjection;
  readonly subscribe: (listener: () => void) => () => void;
  readonly load: () => Promise<SavedConversationProjection>;
  readonly send: (prompt: string) => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly dispose: () => void;
}

interface SavedConversationConnectorResult {
  readonly title?: string;
  readonly lastSequence: number;
  readonly messages: readonly (SessionMessage | GlobalChatSessionMessage)[];
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
  readonly load: () => Promise<SavedConversationConnectorResult>;
  readonly submitPrompt?: (input: {
    readonly sessionId: string;
    readonly prompt: string;
    readonly commandId: string;
  }) => Promise<SavedConversationSubmitResult>;
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
    readonly parts?: readonly SavedConversationTextPart[];
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
          ? { parts: message.parts as readonly SavedConversationTextPart[] }
          : {}),
      }),
    );

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

const mergeMessages = (
  messages: readonly SavedConversationMessage[],
  pendingMessages: readonly SavedConversationMessage[],
): readonly SavedConversationMessage[] =>
  [...messages, ...pendingMessages].sort(
    (left, right) => left.sequence - right.sequence,
  );

const hasPendingCommand = (
  projection: SavedConversationProjection,
): boolean =>
  projection.messages.some(
    (message) => message.role === "user" && message.status === "pending",
  );

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
    }),
  );

const applyDurableEvent = (
  projection: SavedConversationProjection,
  envelope: ProjectSessionEventEnvelope | GlobalChatSessionEventEnvelope,
  canSend: boolean,
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
          }),
        ),
        actions: actions({ canSend, send: "available", canStop: true }),
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
    case "GlobalChatAgentTurnFailedV1":
      return {
        ...base,
        runtime: { status: "failed", latestTurnId: event.turnId },
        actions: actions({ canSend, send: "available", canStop: false }),
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

const applyLiveEvent = (
  projection: SavedConversationProjection,
  envelope:
    ProjectSessionLiveEventEnvelope | GlobalChatSessionLiveEventEnvelope,
): SavedConversationProjection => {
  const event = envelope.event;
  if (
    event.type !== "AssistantTextDeltaV1" &&
    event.type !== "GlobalChatAssistantTextDeltaV1"
  )
    return projection;
  const isActiveTurn =
    projection.runtime.status === "running" &&
    (projection.runtime.activeTurnId === event.turnId ||
      projection.runtime.latestTurnId === event.turnId);
  if (!isActiveTurn) return projection;
  return {
    ...projection,
    status: "ready",
    messages: upsertMessage(
      projection.messages,
      messageWithParts({
        id: event.messageId,
        role: "assistant",
        text:
          (projection.messages.find((message) => message.id === event.messageId)
            ?.text ?? "") + event.text,
        sequence:
          projection.messages.find((message) => message.id === event.messageId)
            ?.sequence ?? projection.lastSequence + 1,
        createdAt: event.timestamp,
        turnId: event.turnId,
      }),
    ),
  };
};

export const createSavedConversationStore = ({
  kind,
  sessionId,
  load,
  submitPrompt,
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
  const canSend = () =>
    submitPrompt !== undefined ||
    (createWithFirstPrompt !== undefined && currentSessionId === sessionId);
  let snapshot = initialSnapshot(kind, sessionId, canSend());
  let subscription: SavedConversationEventSubscription | undefined;

  const publish = (next: SavedConversationProjection): void => {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const reconnectFromAuthoritativeSnapshot = (
    subscriptionSessionId: string,
  ): void => {
    void loadProjection()
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
        const next = applyDurableEvent(snapshot, event, canSend());
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

  const loadProjection = async (): Promise<SavedConversationProjection> => {
    const loaded = await load();
    const loadedMessages = appendActiveDraft(
      sortMessages(loaded.messages),
      loaded.activeTurn,
    );
    const pendingMessages = unresolvedPendingMessages(snapshot, loadedMessages);
    const messages = mergeMessages(loadedMessages, pendingMessages);
    const runtime = runtimeStatus(loaded.activeTurn, loaded.latestTurn);
    return {
      session: { kind, id: currentSessionId },
      status: messages.length === 0 ? "empty" : "ready",
      ...(loaded.title === undefined ? {} : { title: loaded.title }),
      messages,
      lastSequence: loaded.lastSequence,
      runtime,
      connection: { status: "connected" },
      actions: actions({
        canSend: canSend(),
        send: pendingMessages.length > 0 ? "unresolved" : "available",
        canStop: runtime.status === "running" && interruptTurn !== undefined,
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
        const next = await loadProjection();
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
    send: async (prompt) => {
      if (!canSend() || snapshot.actions.send !== "available")
        throw new Error("send unavailable");
      const trimmed = prompt.trim();
      if (trimmed.length === 0) throw new Error("prompt must not be blank");
      const commandId = createCommandId();
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
        );
        publish({
          ...reconciled,
          runtime: runtimeStatus(result.turn, result.turn),
          actions: actions({
            canSend: canSend(),
            send: "available",
            canStop: interruptTurn !== undefined,
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
    stop: async () => {
      const turnId = snapshot.runtime.activeTurnId;
      if (!turnId || !interruptTurn) throw new Error("stop unavailable");
      await interruptTurn({ sessionId: currentSessionId, turnId });
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
    load: async () => {
      const result = await client.listSessionMessages(sessionId);
      return {
        title: result.session.name,
        lastSequence: result.session.lastSequence,
        messages: result.messages,
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
              ...(input.onOpen === undefined
                ? {}
                : { onOpen: input.onOpen }),
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
    load: async () => {
      const result = await client.listMessages(sessionId);
      return {
        title: result.session.title,
        lastSequence: result.session.lastSequence,
        messages: result.messages,
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
              ...(input.onOpen === undefined
                ? {}
                : { onOpen: input.onOpen }),
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
              ...(input.onOpen === undefined
                ? {}
                : { onOpen: input.onOpen }),
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
