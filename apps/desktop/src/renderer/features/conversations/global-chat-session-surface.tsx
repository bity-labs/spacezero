import {
  createAgentRuntimeClient,
  createGlobalChatSessionClient,
  createGlobalChatSessionSavedConversationStore,
  type SavedConversationProjection,
} from "@spacezero/client-runtime";
import {
  globalChatSessionTitleProblem,
  type GlobalChatSessionSummary,
  type GlobalChatSessionTitleProblem,
} from "@spacezero/host-contracts";
import { ChatBreadcrumb } from "@spacezero/ui/components/assistant-ui/elements/chat-breadcrumb";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { useWorkspaceTitlebarCenter } from "../../components/workspace-titlebar-context.js";
import {
  refreshChatLists,
  subscribeChatListRefresh,
} from "./chat-list-refresh.js";
import { GlobalChatSessionRuntimeSelector } from "./global-chat-session-runtime-selector.js";
import {
  RECENT_CHATS_LIMIT,
  selectRecentUnarchivedChats,
} from "./recent-chats.model.js";
import { SavedConversationThread } from "./saved-conversation-thread.js";

const renameTitleProblemMessage: Record<GlobalChatSessionTitleProblem, string> =
  {
    blank: "conversations.renameTitleBlank",
    multi_line: "conversations.renameTitleSingleLine",
    too_long: "conversations.renameTitleMaxLength",
  };

const chatBreadcrumbEntries = (
  title: string,
  sessionId: string,
  chats: readonly GlobalChatSessionSummary[],
): readonly { id: string; title: string }[] => {
  const entries = chats.map((chat) => ({ id: chat.id, title: chat.title }));
  return entries.some((chat) => chat.id === sessionId)
    ? entries
    : [{ id: sessionId, title }, ...entries];
};

/**
 * Active Global Chat Session surface. The app titlebar owns the breadcrumb,
 * quick chat switcher, and rename affordance; the conversation body stays
 * focused on status, history, and the shared saved conversation thread.
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
  const [renameError, setRenameError] = useState<string | undefined>(undefined);
  const [chats, setChats] = useState<readonly GlobalChatSessionSummary[]>([]);
  const [chatsRefreshToken, setChatsRefreshToken] = useState(0);
  const archived = projection.archived === true;
  const applying = projection.status === "loading";
  const title = projection.title ?? sessionId;

  useEffect(
    () =>
      subscribeChatListRefresh(() => {
        setChatsRefreshToken((token) => token + 1);
        void store.load().catch(() => undefined);
      }),
    [store],
  );

  useEffect(() => {
    let cancelled = false;
    void client
      .listGlobalChatSessionsPage({
        archived: false,
        limit: RECENT_CHATS_LIMIT,
      })
      .then((page) => {
        if (!cancelled) setChats(selectRecentUnarchivedChats(page.sessions));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, chatsRefreshToken]);

  const applyArchivedCommand = useCallback(
    (action: "archive" | "unarchive") => {
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
    },
    [client, sessionId, store],
  );

  const applyRename = useCallback(
    (nextTitle: string) => {
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
    },
    [client, sessionId, store, t],
  );

  const titlebarContent = useMemo(
    () => (
      <ChatBreadcrumb
        sectionLabel={t("workspace.chats")}
        onSectionClick={() => {
          void navigate({ to: "/global-chat-sessions" });
        }}
        chatTitle={title}
        chats={chatBreadcrumbEntries(title, sessionId, chats)}
        activeChatId={sessionId}
        onSelectChat={(id) => {
          void navigate({
            to: "/global-chat-sessions/$sessionId",
            params: { sessionId: id },
          });
        }}
        renameLabel={t("conversations.renameChat")}
        onRename={applyRename}
      />
    ),
    [applyRename, chats, navigate, sessionId, t, title],
  );
  useWorkspaceTitlebarCenter(titlebarContent);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background"
      aria-label={t("conversations.globalChatSessionSurface")}
    >
      <h1 className="sr-only">{title}</h1>
      {renameError ? (
        <p
          role="alert"
          className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-testid="global-chat-session-rename-error"
        >
          {renameError}
        </p>
      ) : null}
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
      <SavedConversationThread
        store={store}
        composerStartContent={
          !archived ? (
            <GlobalChatSessionRuntimeSelector
              sessionId={sessionId}
              clients={{ chat: client, agentRuntime }}
              placement="composer"
            />
          ) : null
        }
      />
    </section>
  );
}
