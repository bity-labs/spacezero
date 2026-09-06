import { useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import {
  createGlobalChatDraftConversationStore,
  createGlobalChatSessionClient,
  globalChatDraftSessionId,
  type SavedConversationProjection,
  type SavedConversationStore,
} from "@spacezero/client-runtime";

import { SavedConversationThread } from "./saved-conversation-thread.js";

const useSavedConversationSnapshot = (
  store: SavedConversationStore,
): SavedConversationProjection =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

const GlobalChatDraftErrorBanner = ({
  projection,
}: {
  readonly projection: SavedConversationProjection;
}): ReactElement | null => {
  const failedSend = projection.messages.find(
    (message) => message.role === "user" && message.status === "failed",
  );
  if (!failedSend && projection.actions.send !== "unresolved") return null;
  const message =
    projection.error?.message ??
    failedSend?.errorMessage ??
    "Sending the first prompt failed.";
  return (
    <div
      role="alert"
      className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {message}
    </div>
  );
};

export function GlobalChatDraftSurface({
  store,
  onSessionCreated,
}: {
  readonly store: SavedConversationStore;
  readonly onSessionCreated: (sessionId: string) => void;
}): ReactElement {
  const projection = useSavedConversationSnapshot(store);

  useEffect(() => {
    let lastSessionId = store.getSnapshot().session.id;
    return store.subscribe(() => {
      const sessionId = store.getSnapshot().session.id;
      if (sessionId === lastSessionId) return;
      lastSessionId = sessionId;
      if (sessionId !== globalChatDraftSessionId) onSessionCreated(sessionId);
    });
  }, [store, onSessionCreated]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GlobalChatDraftErrorBanner projection={projection} />
      <SavedConversationThread store={store} />
    </div>
  );
}

export function GlobalChatSessionDraftThread(): ReactElement {
  const navigate = useNavigate();
  const store = useMemo(() => {
    const client = createGlobalChatSessionClient({
      getConnectionDescriptor: window.spacezero.getLocalHostConnection,
    });
    return createGlobalChatDraftConversationStore({ client });
  }, []);

  return (
    <GlobalChatDraftSurface
      store={store}
      onSessionCreated={(sessionId) => {
        void navigate({
          to: "/global-chat-sessions/$sessionId",
          params: { sessionId },
          replace: true,
        });
      }}
    />
  );
}
