import {
  createRootRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import { createGlobalChatSessionClient } from "@spacezero/client-runtime";
import type { GlobalChatSessionSummary } from "@spacezero/host-contracts";

import { SIDEBAR_DEFAULT_WIDTH } from "../components/sidebar/sidebar-layout";
import { WorkspaceShellLayout } from "../components/workspace-shell-layout";
import { WorkspaceTitlebarProvider } from "../components/workspace-titlebar-context";
import {
  WorkspaceSidebar,
  type WorkspaceSidebarView,
} from "../components/workspace-sidebar";
import { useSidebarResize } from "../hooks/use-sidebar-resize";
import {
  RECENT_CHATS_LIMIT,
  selectRecentUnarchivedChats,
} from "../features/conversations/recent-chats.model.js";
import {
  refreshChatLists,
  subscribeChatListRefresh,
} from "../features/conversations/chat-list-refresh.js";
import { useGlobalChatRouteRestoration } from "../features/conversations/use-global-chat-route-restoration.js";

export const Route = createRootRoute({
  component: RootRoute,
});

function RootRoute(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useGlobalChatRouteRestoration();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [isLeftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(
    SIDEBAR_DEFAULT_WIDTH,
  );
  const [activeView, setActiveView] =
    useState<WorkspaceSidebarView>("workspace");
  const [titlebarCenterContent, setTitlebarCenterContent] =
    useState<ReactNode | null>(null);
  const [chats, setChats] = useState<readonly GlobalChatSessionSummary[]>([]);
  const [chatsRefreshToken, setChatsRefreshToken] = useState(0);
  const [chatsExpanded, setChatsExpanded] = useState(true);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const leftSidebarResize = useSidebarResize({
    side: "left",
    width: leftSidebarWidth,
    setWidth: setLeftSidebarWidth,
  });

  const isAgentCapabilitiesRoute = pathname === "/agent-capabilities";
  const isProjectSessionRoute = pathname.startsWith("/project-sessions/");
  const isGlobalChatDraftRoute = pathname === "/global-chat-sessions/new";
  const isGlobalChatsIndexRoute =
    pathname === "/global-chat-sessions" ||
    pathname === "/global-chat-sessions/";
  const isGlobalChatSessionRoute =
    pathname.startsWith("/global-chat-sessions/") &&
    !isGlobalChatDraftRoute &&
    !isGlobalChatsIndexRoute;
  const activeChatId = isGlobalChatSessionRoute
    ? decodeURIComponent(pathname.split("/")[2] ?? "")
    : undefined;
  const sidebarActiveView: WorkspaceSidebarView = isAgentCapabilitiesRoute
    ? "agent-capabilities"
    : isProjectSessionRoute
      ? "workspace"
      : activeView;
  const titlebarLabel = isAgentCapabilitiesRoute
    ? t("workspace.agentCapabilities")
    : isGlobalChatDraftRoute
      ? t("workspace.newChat")
      : isGlobalChatsIndexRoute
        ? t("workspace.allChats")
        : isGlobalChatSessionRoute
          ? t("conversations.globalChatSession")
          : isProjectSessionRoute
            ? t("conversations.projectSession")
            : t("workspace.title");
  const titlebarContextValue = useMemo(
    () => ({ setCenterContent: setTitlebarCenterContent }),
    [],
  );
  const globalChatClient = useMemo(
    () =>
      createGlobalChatSessionClient({
        getConnectionDescriptor: window.spacezero.getLocalHostConnection,
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    // One batched paged request covers the recent list (10 unarchived, with
    // Host-computed previews available) without per-session follow-ups.
    void globalChatClient
      .listGlobalChatSessionsPage({
        archived: false,
        limit: RECENT_CHATS_LIMIT,
      })
      .then((page) => {
        if (cancelled) return;
        setChats(selectRecentUnarchivedChats(page.sessions));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    globalChatClient,
    isGlobalChatSessionRoute,
    activeChatId,
    chatsRefreshToken,
  ]);

  useEffect(
    () =>
      subscribeChatListRefresh(() => {
        setChatsRefreshToken((token) => token + 1);
      }),
    [],
  );

  const archiveSidebarChat = (sessionId: string) => {
    void globalChatClient
      .archiveSession(sessionId)
      .then(() => refreshChatLists())
      .catch(() => undefined)
      .finally(() => setChatsRefreshToken((token) => token + 1));
  };

  if (pathname === "/settings") {
    return <Outlet />;
  }

  return (
    <WorkspaceShellLayout
      isLeftSidebarOpen={isLeftSidebarOpen}
      leftSidebarWidth={leftSidebarWidth}
      sidePaneHeaderWidth="0px"
      labels={{
        hideLeftSidebar: t("workspace.hideLeftSidebar"),
        showLeftSidebar: t("workspace.showLeftSidebar"),
        openCommandPalette: t("workspace.openCommandPalette"),
        mainContent: t("workspace.mainContent"),
        resizeLeftSidebar: t("workspace.resizeLeftSidebar"),
      }}
      onToggleLeftSidebar={() => setLeftSidebarOpen((open) => !open)}
      onOpenCommandPalette={() => undefined}
      onResizeLeftSidebarPointerDown={leftSidebarResize.startResize}
      onResizeLeftSidebarKeyDown={leftSidebarResize.resizeWithKeyboard}
      titlebarCenter={
        titlebarCenterContent ?? (
          <span className="text-xs text-muted-foreground">{titlebarLabel}</span>
        )
      }
      sidePaneHeader={null}
      leftSidebar={
        <WorkspaceSidebar
          open={isLeftSidebarOpen}
          activeView={sidebarActiveView}
          projectsExpanded={projectsExpanded}
          onOpenChange={setLeftSidebarOpen}
          onSelectKnowledgeBase={() => {
            setActiveView("knowledge-base");
            void navigate({ to: "/" });
          }}
          onSelectAgentCapabilities={() => {
            setActiveView("agent-capabilities");
            void navigate({ to: "/agent-capabilities" });
          }}
          activeChatId={activeChatId}
          chats={chats}
          chatsExpanded={chatsExpanded}
          onSelectChat={(sessionId) => {
            void navigate({
              to: "/global-chat-sessions/$sessionId",
              params: { sessionId },
            });
          }}
          onArchiveChat={archiveSidebarChat}
          onToggleChats={() => setChatsExpanded((expanded) => !expanded)}
          onNewChat={() => {
            setActiveView("workspace");
            void navigate({ to: "/global-chat-sessions/new" });
          }}
          onAllChats={() => {
            setActiveView("workspace");
            void navigate({ to: "/global-chat-sessions" });
          }}
          onToggleProjects={() => setProjectsExpanded((expanded) => !expanded)}
          onFilterProjects={() => undefined}
          onAddProject={() => undefined}
          onOpenSettings={() => void navigate({ to: "/settings" })}
        />
      }
      mainContent={
        <WorkspaceTitlebarProvider value={titlebarContextValue}>
          <Outlet />
        </WorkspaceTitlebarProvider>
      }
    />
  );
}
