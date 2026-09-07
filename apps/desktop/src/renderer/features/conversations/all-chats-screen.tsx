import type { GlobalChatSessionClient } from "@spacezero/client-runtime";
import type { GlobalChatSessionSummary } from "@spacezero/host-contracts";
import {
  ChatListScreen,
  type ChatListRow,
} from "@spacezero/ui/components/assistant-ui/elements/chat-list";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";

import {
  ALL_CHATS_PAGE_SIZE,
  ALL_CHATS_TABS,
  appendChatSessionPage,
  emptyAllChatsTabPage,
  formatChatUpdatedAt,
  selectArchivedSessions,
  selectUnarchivedSessions,
  type AllChatsTabId,
  type AllChatsTabPage,
} from "./all-chats.model.js";
import { refreshChatLists } from "./chat-list-refresh.js";

export interface AllChatsScreenProps {
  /** Client Runtime Global Chat Session client; React stays Effect-free. */
  client: Pick<
    GlobalChatSessionClient,
    "listGlobalChatSessionsPage" | "archiveSession" | "unarchiveSession"
  >;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
}

type LoadState = "loading" | "ready" | "error";

type TabStates = Record<AllChatsTabId, AllChatsTabPage>;

const initialTabStates = (): TabStates => ({
  unarchived: emptyAllChatsTabPage,
  archived: emptyAllChatsTabPage,
});

const chatListRows = (
  sessions: readonly GlobalChatSessionSummary[],
): readonly ChatListRow[] =>
  sessions.map((session) => ({
    id: session.id,
    title: session.title,
    archived: session.archived,
    ...(session.lastMessagePreview === undefined
      ? {}
      : { preview: session.lastMessagePreview }),
    updatedAt: formatChatUpdatedAt(session.updatedAt),
  }));

/**
 * All Chats screen: Unarchived and Archived tabs of Global Chat Sessions,
 * loaded from the batched paged Host list (20 sessions per page, with a Load
 * more affordance) and rows showing title, batched last-message preview, and
 * last-updated time. The tabs paginate independently.
 */
export function AllChatsScreen({
  client,
  onNewChat,
  onSelectSession,
}: AllChatsScreenProps): ReactElement {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [tabs, setTabs] = useState<TabStates>(initialTabStates);
  const [loadingMoreTabId, setLoadingMoreTabId] = useState<
    AllChatsTabId | undefined
  >(undefined);
  const [activeTabId, setActiveTabId] = useState<AllChatsTabId>("unarchived");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // One batched paged request per tab; per-session preview fetches are
    // gone since the Host computes each summary's lastMessagePreview.
    void Promise.all([
      client.listGlobalChatSessionsPage({
        archived: false,
        limit: ALL_CHATS_PAGE_SIZE,
        offset: 0,
      }),
      client.listGlobalChatSessionsPage({
        archived: true,
        limit: ALL_CHATS_PAGE_SIZE,
        offset: 0,
      }),
    ])
      .then(([unarchivedPage, archivedPage]) => {
        if (cancelled) return;
        setTabs({
          unarchived: appendChatSessionPage(
            emptyAllChatsTabPage,
            unarchivedPage,
          ),
          archived: appendChatSessionPage(emptyAllChatsTabPage, archivedPage),
        });
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [client, refreshToken]);

  const loadMore = useCallback(
    (tabId: AllChatsTabId): void => {
      if (loadingMoreTabId !== undefined) return;
      const nextOffset = tabs[tabId].nextOffset;
      if (nextOffset === undefined) return;
      setLoadingMoreTabId(tabId);
      void client
        .listGlobalChatSessionsPage({
          archived: tabId === "archived",
          limit: ALL_CHATS_PAGE_SIZE,
          offset: nextOffset,
        })
        .then((page) => {
          setTabs((current) => ({
            ...current,
            [tabId]: appendChatSessionPage(current[tabId], page),
          }));
        })
        .catch(() => undefined)
        .finally(() => {
          setLoadingMoreTabId(undefined);
        });
    },
    [client, loadingMoreTabId, tabs],
  );

  const applySessionCommand = useCallback(
    (
      command: (
        sessionId: string,
      ) => Promise<{ readonly session: { readonly id: string } }>,
      sessionId: string,
    ) =>
      void command
        .call(client, sessionId)
        .then(() => {
          // Archived state moved; refresh this screen and the sidebar lists.
          refreshChatLists();
          setRefreshToken((token) => token + 1);
        })
        .catch(() => undefined),
    [client],
  );

  const activeTabSessions = useMemo(
    () =>
      activeTabId === "unarchived"
        ? selectUnarchivedSessions(tabs.unarchived.sessions)
        : selectArchivedSessions(tabs.archived.sessions),
    [activeTabId, tabs],
  );

  if (loadState === "loading") {
    return (
      <section
        className="flex min-h-0 flex-1 items-center justify-center p-8"
        aria-label={t("workspace.allChats")}
      >
        <p role="status" className="text-muted-foreground text-sm">
          {t("conversations.loadingChats")}
        </p>
      </section>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {loadState === "error" ? (
        <div
          role="alert"
          className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {t("conversations.allChatsLoadError")}
        </div>
      ) : null}
      <ChatListScreen
        title={t("workspace.allChats")}
        description={t("conversations.allChatsDescription")}
        newChatLabel={t("workspace.newChat")}
        onNewChat={onNewChat}
        tabs={ALL_CHATS_TABS.map((tab) => ({
          id: tab.id,
          label: t(
            tab.id === "unarchived"
              ? "conversations.unarchivedTab"
              : "conversations.archivedTab",
          ),
        }))}
        activeTabId={activeTabId}
        onTabChange={(tabId) => {
          if (tabId === "unarchived" || tabId === "archived")
            setActiveTabId(tabId);
        }}
        rows={chatListRows(activeTabSessions)}
        archiveRowLabel={t("workspace.archive")}
        unarchiveRowLabel={t("workspace.unarchive")}
        onArchiveRow={(sessionId) =>
          applySessionCommand(client.archiveSession, sessionId)
        }
        onUnarchiveRow={(sessionId) =>
          applySessionCommand(client.unarchiveSession, sessionId)
        }
        hasMoreRows={tabs[activeTabId].nextOffset !== undefined}
        loadingMoreRows={loadingMoreTabId === activeTabId}
        loadMoreRowsLabel={t("conversations.loadMoreChats")}
        onLoadMoreRows={() => loadMore(activeTabId)}
        emptyTitle={
          activeTabId === "unarchived"
            ? t("conversations.noChatsTitle")
            : t("conversations.noArchivedChatsTitle")
        }
        emptyDescription={
          activeTabId === "unarchived"
            ? t("conversations.noChatsDescription")
            : t("conversations.noArchivedChatsDescription")
        }
        emptyActionLabel={t("workspace.newChat")}
        onSelectRow={onSelectSession}
      />
    </div>
  );
}
