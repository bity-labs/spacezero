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
  return (
    <AppSidebarView
      open={open}
      onOpenChange={onOpenChange}
      aria-label="Workspace sidebar"
      className="pt-4"
      contentClassName="overflow-hidden px-0"
      header={
        <SidebarMenu
          className="px-0"
          aria-label="Workspace navigation"
          role="menu"
        >
          <SidebarNavItem
            icon={BookOpenText}
            label="Knowledge Base"
            active={activeView === "knowledge-base"}
            onClick={onSelectKnowledgeBase}
          />
          <SidebarNavItem
            icon={PaperPlaneTilt}
            label="Chat"
            active={activeView === "global-chat"}
            onClick={onSelectGlobalChat}
          />
          <SidebarNavItem
            icon={Plugs}
            label="Agent Capabilities"
            active={activeView === "agent-capabilities"}
            onClick={onSelectAgentCapabilities}
          />
        </SidebarMenu>
      }
      footer={<AccountMenu onOpenSettings={onOpenSettings} />}
    >
      <SidebarGroup
        className="mt-8 min-h-0 flex-1 overflow-hidden"
        aria-label="Projects"
      >
        <SidebarSectionHeader
          label="Projects"
          expandable
          expanded={projectsExpanded}
          onToggle={onToggleProjects}
          actions={[
            {
              label: "Filter projects",
              icon: FunnelSimple,
              onClick: onFilterProjects,
            },
            { label: "Add project", icon: FolderPlus, onClick: onAddProject },
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
  return (
    <section
      className="flex items-center gap-2 rounded-lg px-1 py-1"
      aria-label="Account menu"
    >
      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <User className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm leading-5 text-muted-foreground">
          Not connected
        </span>
      </div>
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Open app settings"
        onClick={onOpenSettings}
      >
        <GearSix className="size-5" aria-hidden="true" />
      </button>
    </section>
  );
}
