import {
  BookOpenText,
  FolderPlus,
  FunnelSimple,
  GearSix,
  PaperPlaneTilt,
  Plugs,
  User,
} from "@phosphor-icons/react";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@spacezero/ui/components/sidebar";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { AppSidebarView } from "./sidebar/app-sidebar";
import { SidebarNavItem } from "./sidebar/sidebar-nav-item";
import { SidebarSectionHeader } from "./sidebar/sidebar-section-header";

export type WorkspaceSidebarView =
  "workspace" | "global-chat" | "knowledge-base" | "agent-capabilities";

type WorkspaceSidebarProps = {
  open: boolean;
  activeView: WorkspaceSidebarView;
  projectsExpanded: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectKnowledgeBase: () => void;
  onSelectGlobalChat: () => void;
  onSelectAgentCapabilities: () => void;
  onToggleProjects: () => void;
  onFilterProjects: () => void;
  onAddProject: () => void;
  onOpenSettings: () => void;
};

const projectNames = [
  "Space Zero",
  "Launchpad",
  "Knowledge Garden",
  "Agent Bench",
];

export function WorkspaceSidebar({
  open,
  activeView,
  projectsExpanded,
  onOpenChange,
  onSelectKnowledgeBase,
  onSelectGlobalChat,
  onSelectAgentCapabilities,
  onToggleProjects,
  onFilterProjects,
  onAddProject,
  onOpenSettings,
}: WorkspaceSidebarProps): ReactElement {
  const { t } = useTranslation();

  return (
    <AppSidebarView
      open={open}
      onOpenChange={onOpenChange}
      aria-label={t("workspace.sidebar")}
      className="pt-4"
      contentClassName="overflow-hidden px-0"
      header={
        <SidebarMenu
          className="px-0"
          aria-label={t("workspace.navigation")}
          role="menu"
        >
          <SidebarNavItem
            icon={BookOpenText}
            label={t("workspace.knowledgeBase")}
            active={activeView === "knowledge-base"}
            onClick={onSelectKnowledgeBase}
          />
          <SidebarNavItem
            icon={PaperPlaneTilt}
            label={t("workspace.chat")}
            active={activeView === "global-chat"}
            onClick={onSelectGlobalChat}
          />
          <SidebarNavItem
            icon={Plugs}
            label={t("workspace.agentCapabilities")}
            active={activeView === "agent-capabilities"}
            onClick={onSelectAgentCapabilities}
          />
        </SidebarMenu>
      }
      footer={<AccountMenu onOpenSettings={onOpenSettings} />}
    >
      <SidebarGroup
        className="mt-8 min-h-0 flex-1 overflow-hidden"
        aria-label={t("workspace.projects")}
      >
        <SidebarSectionHeader
          label={t("workspace.projects")}
          expandable
          expanded={projectsExpanded}
          onToggle={onToggleProjects}
          actions={[
            {
              label: t("workspace.filterProjects"),
              icon: FunnelSimple,
              onClick: onFilterProjects,
            },
            { label: t("workspace.addProject"), icon: FolderPlus, onClick: onAddProject },
          ]}
        />
        {projectsExpanded ? (
          <div className="min-h-0 flex-1 overflow-auto px-2">
            <SidebarMenu>
              {projectNames.map((projectName, index) => (
                <SidebarMenuItem key={projectName}>
                  <SidebarMenuButton
                    isActive={activeView === "workspace" && index === 0}
                  >
                    <span>{projectName}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
        ) : null}
      </SidebarGroup>
    </AppSidebarView>
  );
}

function AccountMenu({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}): ReactElement {
  const { t } = useTranslation();

  return (
    <section
      className="flex items-center gap-2 rounded-lg px-1 py-1"
      aria-label={t("workspace.accountMenu")}
    >
      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <User className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm leading-5 text-muted-foreground">
          {t("workspace.notConnected")}
        </span>
      </div>
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={t("workspace.openAppSettings")}
        onClick={onOpenSettings}
      >
        <GearSix className="size-5" aria-hidden="true" />
      </button>
    </section>
  );
}
