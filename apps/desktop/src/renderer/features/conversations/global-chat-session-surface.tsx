import { Archive, ArrowCounterClockwise } from "@phosphor-icons/react";
import {
  createAgentRuntimeClient,
  createGlobalChatSessionClient,
  createGlobalChatSessionSavedConversationStore,
  type SavedConversationProjection,
} from "@spacezero/client-runtime";
import { globalChatSessionTitleProblem, type GlobalChatSessionTitleProblem } from "@spacezero/host-contracts";
import { ChatBreadcrumb } from "@spacezero/ui/components/assistant-ui/elements/chat-breadcrumb";
import { useState, useMemo, useSyncExternalStore, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { refreshChatLists } from "./chat-list-refresh.js";
import { GlobalChatSessionRuntimeSelector } from "./global-chat-session-runtime-selector.js";
import { SavedConversationThread } from "./saved-conversation-thread.js";

const renameTitleProblemMessage: Record<
  GlobalChatSessionTitleProblem,
  string
> = {
  blank: "conversations.renameTitleBlank",
  multi_line: "conversations.renameTitleSingleLine",
  too_long: "conversations.renameTitleMaxLength",
};

/**
 * Active Global Chat Session surface: session header with an inline rename
 * control and archive/unarchive controls, read-only archived state with an
 * "Unarchive to continue" action, and the shared saved conversation thread.
 * Renaming is metadata management and stays available while archived;
 * the Host-owned archive state blocks new prompts and follow-ups.
 */
export function GlobalChatSessionSurface({
  sessionId,
}: {
  readonly sessionId: string;
}): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { client, agentRuntime, store } = useMemo(() => {
    const surfaceClient = createGlobalChatSessionClient({
      getConnectionDescriptor: window.spacezero.getLocalHostConnection,
    });
    return {
      client: surfaceClient,
      agentRuntime: createAgentRuntimeClient({
        getConnectionDescriptor: window.spacezero.getLocalHostConnection,
      }),
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
  const [renameError, setRenameError] = useState<string | undefined>(
    undefined,
  );
  const archived = projection.archived === true;
  const applying = projection.status === "loading";
  const title = projection.title ?? sessionId;

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

  const applyRename = (nextTitle: string) => {
    setRenameError(undefined);
    const problem = globalChatSessionTitleProblem(nextTitle);
    if (problem !== undefined) {
      setRenameError(t(renameTitleProblemMessage[problem.problem]));
      return;
    }
    void client
      .renameSession(sessionId, nextTitle)
      .then(() => refreshChatLists())
      .catch((error: unknown) =>
        setRenameError(
          error instanceof Error
            ? error.message
            : typeof error === "object" &&
                error !== null &&
                "message" in error &&
                typeof (error as { message: unknown }).message === "string"
              ? (error as { message: string }).message
              : t("conversations.allChatsLoadError"),
        ),
      )
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
          <div className="mt-1">
            <h1 className="sr-only">{title}</h1>
            <ChatBreadcrumb
              sectionLabel={t("workspace.chats")}
              onSectionClick={() => {
                void navigate({ to: "/global-chat-sessions" });
              }}
              chatTitle={title}
              renameLabel={t("conversations.renameChat")}
              onRename={applyRename}
            />
            {renameError ? (
              <p
                role="alert"
                className="mt-1 text-sm text-destructive"
                data-testid="global-chat-session-rename-error"
              >
                {renameError}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!archived ? (
            <GlobalChatSessionRuntimeSelector
              sessionId={sessionId}
              clients={{ chat: client, agentRuntime }}
            />
          ) : null}
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
