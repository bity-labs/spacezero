import type {
  GlobalChatSessionMessage,
  GlobalChatSessionTurn,
  ProjectSessionTurn,
  SessionMessage,
} from "@spacezero/host-contracts";
import type { GlobalChatSessionClient } from "../global-chat-sessions/global-chat-session-client.js";
import type { ProjectSessionClient } from "../project-sessions/project-session-client.js";

export type SavedConversationKind = "project" | "global";
export type SavedConversationStatus =
  "idle" | "loading" | "ready" | "empty" | "unavailable" | "error";
export type SavedConversationRuntimeStatus =
  | "idle"
  | "running"
  | "completed"
  | "interrupted"
  | "failed"
  | "recovery_required";

export interface SavedConversationMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly sequence: number;
  readonly createdAt: string;
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
  readonly actions: {
    readonly send: "unavailable";
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
  readonly dispose: () => void;
}

interface SavedConversationConnectorResult {
  readonly title?: string;
  readonly lastSequence: number;
  readonly messages: readonly (SessionMessage | GlobalChatSessionMessage)[];
  readonly activeTurn?: ProjectSessionTurn | GlobalChatSessionTurn;
  readonly latestTurn?: ProjectSessionTurn | GlobalChatSessionTurn;
}

interface CreateSavedConversationStoreInput {
  readonly kind: SavedConversationKind;
  readonly sessionId: string;
  readonly load: () => Promise<SavedConversationConnectorResult>;
}

const unavailableActions: SavedConversationProjection["actions"] = {
  send: "unavailable",
  edit: "unavailable",
  regenerate: "unavailable",
  executeTool: "unavailable",
  approveTool: "unavailable",
};

const initialSnapshot = (
  kind: SavedConversationKind,
  sessionId: string,
): SavedConversationProjection => ({
  session: { kind, id: sessionId },
  status: "idle",
  messages: [],
  lastSequence: 0,
  runtime: { status: "idle" },
  actions: unavailableActions,
});

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "conversation unavailable";

const sortMessages = (
  messages: readonly (SessionMessage | GlobalChatSessionMessage)[],
): readonly SavedConversationMessage[] =>
  [...messages]
    .sort((left, right) => left.sequence - right.sequence)
    .map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      sequence: message.sequence,
      createdAt: message.createdAt,
    }));

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
};

export const createSavedConversationStore = ({
  kind,
  sessionId,
  load,
}: CreateSavedConversationStoreInput): SavedConversationStore => {
  const listeners = new Set<() => void>();
  let disposed = false;
  let snapshot = initialSnapshot(kind, sessionId);

  const publish = (next: SavedConversationProjection): void => {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener();
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
      publish({ ...current, status: "loading" });
      try {
        const loaded = await load();
        const messages = sortMessages(loaded.messages);
        const next: SavedConversationProjection = {
          session: { kind, id: sessionId },
          status: messages.length === 0 ? "empty" : "ready",
          ...(loaded.title === undefined ? {} : { title: loaded.title }),
          messages,
          lastSequence: loaded.lastSequence,
          runtime: runtimeStatus(loaded.activeTurn, loaded.latestTurn),
          actions: unavailableActions,
        };
        publish(next);
        return next;
      } catch (error) {
        const next: SavedConversationProjection = {
          ...snapshot,
          status: "error",
          error: { message: toErrorMessage(error) },
        };
        publish(next);
        throw error;
      }
    },
    dispose: () => {
      disposed = true;
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
}): SavedConversationStore =>
  createSavedConversationStore({
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
  });

export const createGlobalChatSessionSavedConversationStore = ({
  client,
  sessionId,
}: {
  readonly client: GlobalChatSessionClient;
  readonly sessionId: string;
}): SavedConversationStore =>
  createSavedConversationStore({
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
  });
