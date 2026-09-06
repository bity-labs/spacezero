import {
  Archive,
  BookOpenText,
  Folder,
  FolderPlus,
  FunnelSimple,
  GearSix,
  List,
  PaperPlaneTilt,
  Plugs,
  Plus,
  User,
} from "@phosphor-icons/react";
import type { GlobalChatSessionSummary } from "@spacezero/host-contracts";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@spacezero/ui/components/sidebar";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { AppSidebarView } from "./sidebar/app-sidebar";
import { SidebarNavItem } from "./sidebar/sidebar-nav-item";
import { SidebarSectionHeader } from "./sidebar/sidebar-section-header";

export type WorkspaceSidebarView =
  "workspace" | "knowledge-base" | "agent-capabilities";

type WorkspaceSidebarProps = {
  open: boolean;
  activeView: WorkspaceSidebarView;
  activeChatId: string | undefined;
  chats: readonly GlobalChatSessionSummary[];
  chatsExpanded: boolean;
  projectsExpanded: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectKnowledgeBase: () => void;
  onSelectAgentCapabilities: () => void;
  onSelectChat: (sessionId: string) => void;
  onToggleChats: () => void;
  onNewChat: () => void;
  onAllChats: () => void;
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
  activeChatId,
  chats,
  chatsExpanded,
  projectsExpanded,
  onOpenChange,
  onSelectKnowledgeBase,
  onSelectAgentCapabilities,
  onSelectChat,
  onToggleChats,
  onNewChat,
  onAllChats,
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
            icon={Plugs}
            label={t("workspace.agentCapabilities")}
            active={activeView === "agent-capabilities"}
            onClick={onSelectAgentCapabilities}
          />
        </SidebarMenu>
      }
      footer={<AccountMenu onOpenSettings={onOpenSettings} />}
    >
      <SidebarGroup className="mt-8 shrink-0" aria-label={t("workspace.chats")}>
        <SidebarSectionHeader
          label={t("workspace.chats")}
          icon={PaperPlaneTilt}
          expandable
          expanded={chatsExpanded}
          onToggle={onToggleChats}
          actions={[
            { label: t("workspace.newChat"), icon: Plus, onClick: onNewChat },
            { label: t("workspace.allChats"), icon: List, onClick: onAllChats },
          ]}
        />
        {chatsExpanded ? (
          <div className="max-h-64 overflow-auto px-2">
            <SidebarMenu>
              {chats.map((chat) => (
                <SidebarMenuItem key={chat.id}>
                  <SidebarMenuButton
                    isActive={activeChatId === chat.id}
                    onClick={() => {
                      onSelectChat(chat.id);
                    }}
                  >
                    <span className="truncate">{chat.title}</span>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    aria-label={t("workspace.archive")}
                    className="text-muted-foreground"
                    disabled
                  >
                    <Archive aria-hidden="true" />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
        ) : null}
      </SidebarGroup>
      <SidebarGroup
        className="mt-4 min-h-0 flex-1 overflow-hidden"
        aria-label={t("workspace.projects")}
      >
        <SidebarSectionHeader
          label={t("workspace.projects")}
          icon={Folder}
          expandable
          expanded={projectsExpanded}
          onToggle={onToggleProjects}
          actions={[
            {
              label: t("workspace.filterProjects"),
              icon: FunnelSimple,
              onClick: onFilterProjects,
            },
            {
              label: t("workspace.addProject"),
              icon: FolderPlus,
              onClick: onAddProject,
            },
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
