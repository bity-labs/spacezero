import {
  createRootRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import type { GlobalChatSessionSummary } from "@spacezero/host-contracts";
import { createGlobalChatSessionClient } from "@spacezero/client-runtime";

import { SIDEBAR_DEFAULT_WIDTH } from "../components/sidebar/sidebar-layout";
import { WorkspaceShellLayout } from "../components/workspace-shell-layout";
import {
  WorkspaceSidebar,
  type WorkspaceSidebarView,
} from "../components/workspace-sidebar";
import { useSidebarResize } from "../hooks/use-sidebar-resize";
import { selectRecentUnarchivedChats } from "../features/conversations/recent-chats.model.js";

export const Route = createRootRoute({
  component: RootRoute,
});

function RootRoute(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [isLeftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(
    SIDEBAR_DEFAULT_WIDTH,
  );
  const [activeView, setActiveView] =
    useState<WorkspaceSidebarView>("workspace");
  const [chats, setChats] = useState<readonly GlobalChatSessionSummary[]>([]);
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

  useEffect(() => {
    const client = createGlobalChatSessionClient({
      getConnectionDescriptor: window.spacezero.getLocalHostConnection,
    });
    let cancelled = false;
    void client
      .listGlobalChatSessions()
      .then((sessions) => {
        if (cancelled) return;
        setChats(selectRecentUnarchivedChats(sessions));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isGlobalChatSessionRoute, activeChatId]);

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
        <span className="text-xs text-muted-foreground">{titlebarLabel}</span>
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
      mainContent={<Outlet />}
    />
  );
}
