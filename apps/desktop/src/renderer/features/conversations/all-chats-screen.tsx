import { useEffect, useMemo, useState, type ReactElement } from "react";
import type {
  GlobalChatSessionClient,
} from "@spacezero/client-runtime";
import type {
  GlobalChatSessionSummary,
} from "@spacezero/host-contracts";
import {
  ChatListScreen,
  type ChatListRow,
} from "@spacezero/ui/components/assistant-ui/elements/chat-list";
import { useTranslation } from "react-i18next";

import {
  ALL_CHATS_TABS,
  formatChatUpdatedAt,
  loadAllChatPreviews,
  selectArchivedSessions,
  selectUnarchivedSessions,
  type AllChatsTabId,
} from "./all-chats.model.js";

export interface AllChatsScreenProps {
  /** Client Runtime Global Chat Session client; React stays Effect-free. */
  client: Pick<
    GlobalChatSessionClient,
    "listGlobalChatSessions" | "listMessages"
  >;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
}

type LoadState = "loading" | "ready" | "error";

const chatListRows = (
  sessions: readonly GlobalChatSessionSummary[],
  previews: ReadonlyMap<string, string>,
): readonly ChatListRow[] =>
  sessions.map((session) => {
    const preview = previews.get(session.id);
    return {
      id: session.id,
      title: session.title,
      ...(preview === undefined ? {} : { preview }),
      updatedAt: formatChatUpdatedAt(session.updatedAt),
    };
  });

/**
 * All Chats screen: Unarchived and Archived tabs of Global Chat Sessions,
 * with a New Chat action, empty-state CTA, and rows showing title,
 * last-message preview, and last-updated time.
 */
export function AllChatsScreen({
  client,
  onNewChat,
  onSelectSession,
}: AllChatsScreenProps): ReactElement {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [sessions, setSessions] = useState<
    readonly GlobalChatSessionSummary[]
  >([]);
  const [previews, setPreviews] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [activeTabId, setActiveTabId] = useState<AllChatsTabId>("unarchived");

  useEffect(() => {
    let cancelled = false;
    void client
      .listGlobalChatSessions()
      .then(async (loaded) => {
        if (cancelled) return;
        setSessions(loaded);
        setLoadState("ready");
        const loadedPreviews = await loadAllChatPreviews(
          loaded,
          async (sessionId) => {
            const result = await client.listMessages(sessionId, {
              limit: 1,
            });
            return result.messages[0];
          },
        );
        if (!cancelled) setPreviews(loadedPreviews);
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const activeTabSessions = useMemo(
    () =>
      activeTabId === "unarchived"
        ? selectUnarchivedSessions(sessions)
        : selectArchivedSessions(sessions),
    [activeTabId, sessions],
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
        rows={chatListRows(activeTabSessions, previews)}
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
