import {
  createRootRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { SIDEBAR_DEFAULT_WIDTH } from "../components/sidebar/sidebar-layout";
import { WorkspaceShellLayout } from "../components/workspace-shell-layout";
import {
  WorkspaceSidebar,
  type WorkspaceSidebarView,
} from "../components/workspace-sidebar";
import { useSidebarResize } from "../hooks/use-sidebar-resize";

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
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const leftSidebarResize = useSidebarResize({
    side: "left",
    width: leftSidebarWidth,
    setWidth: setLeftSidebarWidth,
  });

  const isAgentCapabilitiesRoute = pathname === "/agent-capabilities";
  const isProjectSessionRoute = pathname.startsWith("/project-sessions/");
  const isGlobalChatSessionRoute = pathname.startsWith(
    "/global-chat-sessions/",
  );
  const sidebarActiveView: WorkspaceSidebarView = isAgentCapabilitiesRoute
    ? "agent-capabilities"
    : isGlobalChatSessionRoute
      ? "global-chat"
      : isProjectSessionRoute
        ? "workspace"
        : activeView;
  const titlebarLabel = isAgentCapabilitiesRoute
    ? t("workspace.agentCapabilities")
    : isGlobalChatSessionRoute
      ? t("conversations.globalChatSession")
      : isProjectSessionRoute
        ? t("conversations.projectSession")
        : t("workspace.title");

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
          onSelectGlobalChat={() => {
            setActiveView("global-chat");
            void navigate({ to: "/" });
          }}
          onSelectAgentCapabilities={() => {
            setActiveView("agent-capabilities");
            void navigate({ to: "/agent-capabilities" });
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
