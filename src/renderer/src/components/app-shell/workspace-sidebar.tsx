import { BookOpenText, FolderPlus, FunnelSimple, PaperPlaneTilt } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import { AppSidebarView } from '@renderer/components/sidebar/app-sidebar'
import { SidebarNavItem } from '@renderer/components/sidebar/sidebar-nav-item'
import { SidebarSectionHeader } from '@renderer/components/sidebar/sidebar-section-header'
import { SidebarGroup, SidebarMenu } from '@renderer/components/ui/sidebar'

export type WorkspaceSidebarView = 'workspace' | 'global-chat' | 'knowledge-base'

export type WorkspaceSidebarLabels = {
  sidebar: string
  navigation: string
  knowledgeBase: string
  globalChat: string
  projects: string
  filterProjects: string
  addProject: string
}

export type WorkspaceSidebarProps = {
  open: boolean
  activeView: WorkspaceSidebarView
  projectsExpanded: boolean
  projectsContent: ReactNode
  accountMenu: ReactNode
  labels: WorkspaceSidebarLabels
  onOpenChange: (open: boolean) => void
  onSelectKnowledgeBase: () => void
  onSelectGlobalChat: () => void
  onToggleProjects: () => void
  onFilterProjects: () => void
  onAddProject: () => void
  overlays?: ReactNode
}

export function WorkspaceSidebar({
  open,
  activeView,
  projectsExpanded,
  projectsContent,
  accountMenu,
  labels,
  onOpenChange,
  onSelectKnowledgeBase,
  onSelectGlobalChat,
  onToggleProjects,
  onFilterProjects,
  onAddProject,
  overlays
}: WorkspaceSidebarProps): React.JSX.Element {
  return (
    <AppSidebarView
      open={open}
      onOpenChange={onOpenChange}
      aria-label={labels.sidebar}
      className="pt-4"
      contentClassName="overflow-hidden px-0"
      header={
        <SidebarMenu className="px-0" aria-label={labels.navigation} role="menu">
          <SidebarNavItem
            icon={BookOpenText}
            label={labels.knowledgeBase}
            active={activeView === 'knowledge-base'}
            onClick={onSelectKnowledgeBase}
          />
          <SidebarNavItem
            icon={PaperPlaneTilt}
            label={labels.globalChat}
            active={activeView === 'global-chat'}
            onClick={onSelectGlobalChat}
          />
        </SidebarMenu>
      }
      footer={accountMenu}
    >
      <SidebarGroup className="mt-8 min-h-0 flex-1 overflow-hidden" aria-label={labels.projects}>
        <SidebarSectionHeader
          label={labels.projects}
          expandable
          expanded={projectsExpanded}
          onToggle={onToggleProjects}
          actions={[
            { label: labels.filterProjects, icon: FunnelSimple, onClick: onFilterProjects },
            { label: labels.addProject, icon: FolderPlus, onClick: onAddProject }
          ]}
        />
        {projectsExpanded ? (
          <div className="min-h-0 flex-1 overflow-auto">{projectsContent}</div>
        ) : null}
      </SidebarGroup>
      {overlays}
    </AppSidebarView>
  )
}
