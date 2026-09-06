import { Archive, ArrowCounterClockwise } from "@phosphor-icons/react";
import {
  createGlobalChatSessionClient,
  createGlobalChatSessionSavedConversationStore,
  type SavedConversationProjection,
} from "@spacezero/client-runtime";
import { useMemo, useSyncExternalStore, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { refreshChatLists } from "./chat-list-refresh.js";
import { SavedConversationThread } from "./saved-conversation-thread.js";

/**
 * Active Global Chat Session surface: session header with archive/unarchive
 * controls, read-only archived state with an "Unarchive to continue" action,
 * and the shared saved conversation thread. Archiving keeps the chat open;
 * the Host-owned archive state blocks new prompts and follow-ups.
 */
export function GlobalChatSessionSurface({
  sessionId,
}: {
  readonly sessionId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { client, store } = useMemo(() => {
    const surfaceClient = createGlobalChatSessionClient({
      getConnectionDescriptor: window.spacezero.getLocalHostConnection,
    });
    return {
      client: surfaceClient,
      store: createGlobalChatSessionSavedConversationStore({
        client: surfaceClient,
        sessionId,
      }),
    };
  }, [sessionId]);
  const projection = useSyncExternalStore<SavedConversationProjection>(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const archived = projection.archived === true;
  const applying = projection.status === "loading";

  const applyArchivedCommand = (action: "archive" | "unarchive") => {
    const command =
      action === "archive"
        ? client.archiveSession(sessionId)
        : client.unarchiveSession(sessionId);
    void command
      .then(() => refreshChatLists())
      .catch(() => undefined)
      .finally(() => {
        void store.load().catch(() => undefined);
      });
  };

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background"
      aria-label={t("conversations.globalChatSessionSurface")}
    >
      <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("conversations.globalChatSession")}
          </p>
          <h1 className="mt-1 truncate text-lg font-semibold tracking-tight">
            {sessionId}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {archived ? (
            <span
              className="rounded border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
              data-testid="global-chat-session-archived-badge"
            >
              {t("conversations.archivedTab")}
            </span>
          ) : null}
          {archived ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              aria-label={t("workspace.unarchive")}
              disabled={applying}
              onClick={() => applyArchivedCommand("unarchive")}
            >
              <ArrowCounterClockwise className="size-4" aria-hidden="true" />
              {t("workspace.unarchive")}
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              aria-label={t("workspace.archive")}
              disabled={applying}
              onClick={() => applyArchivedCommand("archive")}
            >
              <Archive className="size-4" aria-hidden="true" />
              {t("workspace.archive")}
            </button>
          )}
        </div>
      </header>
      {archived ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3 text-sm"
          data-testid="global-chat-session-archived-banner"
        >
          <span className="text-muted-foreground">
            {t("conversations.archivedReadOnly")}
          </span>
          <button
            type="button"
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            disabled={applying}
            onClick={() => applyArchivedCommand("unarchive")}
          >
            {t("conversations.unarchiveToContinue")}
          </button>
        </div>
      ) : null}
      <SavedConversationThread store={store} />
    </section>
  );
}
