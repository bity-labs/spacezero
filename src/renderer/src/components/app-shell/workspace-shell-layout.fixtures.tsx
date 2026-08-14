import { SidebarSimple } from '@phosphor-icons/react'

import { KnowledgeBaseConfiguredScreen } from '../../../../features/knowledge-base/renderer'
import { configuredKnowledgeBaseFixture } from '../../../../features/knowledge-base/renderer/knowledge-base-configured-screen.fixtures'
import { ProjectHomeScreen, ProjectSidebarList } from '../../../../features/projects/renderer'
import { repositoryConnectedProjectHomeFixture } from '../../../../features/projects/renderer/components/project-home-screen.fixtures'
import type { Project } from '../../../../features/projects/shared'
import { globalChatReadyFixture } from '../../../../features/sessions/renderer/components/session-host-screen.fixtures'
import { SidePaneShellView, SidePaneTabStripView } from '../../../../features/side-pane/renderer'
import { manyTabsFixture } from '../../../../features/side-pane/renderer/side-pane-shell-view.fixtures'
import { AgentChatView } from '../agent-chat-view'
import { Button } from '@renderer/components/ui/button'
import { AccountMenuView } from './account-menu-view'
import { connectedAccountMenuFixture } from './account-menu-view.fixtures'
import { WorkspaceEmptyStateView, type WorkspaceShellLayoutProps } from './workspace-shell-layout'
import { WorkspaceSidebar, type WorkspaceSidebarView } from './workspace-sidebar'

const noOp = (): void => undefined
const fixtureTimestamp = '2026-08-13T18:46:28.000Z'

export const workspaceProjects: Project[] = [
  {
    id: 'space-zero',
    name: 'Space Zero',
    path: '~/SpaceZero/projects/spacezero',
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp
  },
  {
    id: 'launchpad',
    name: 'Launchpad',
    path: '~/SpaceZero/projects/launchpad',
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp
  }
]

const labels: WorkspaceShellLayoutProps['labels'] = {
  hideLeftSidebar: 'Hide left sidebar',
  showLeftSidebar: 'Show left sidebar',
  openCommandPalette: 'Open command palette',
  mainContent: 'Workspace content',
  resizeLeftSidebar: 'Resize left sidebar'
}

function projectListFixture(projects: Project[], activeProject: Project | null): React.JSX.Element {
  return (
    <ProjectSidebarList
      projects={projects}
      activeProject={activeProject}
      status="ready"
      error={null}
      onAddProject={noOp}
      onSelectProject={noOp}
      onEditProject={noOp}
    />
  )
}

function sidebarFixture({
  activeView,
  projects,
  activeProject = null
}: {
  activeView: WorkspaceSidebarView
  projects: Project[]
  activeProject?: Project | null
}): React.JSX.Element {
  return (
    <WorkspaceSidebar
      open
      activeView={activeView}
      projectsExpanded
      projectsContent={projectListFixture(projects, activeProject)}
      accountMenu={<AccountMenuView {...connectedAccountMenuFixture} />}
      labels={{
        sidebar: 'Workspace sidebar',
        navigation: 'Workspace navigation',
        knowledgeBase: 'Knowledge Base',
        globalChat: 'Chat',
        projects: 'Projects',
        filterProjects: 'Filter projects',
        addProject: 'Add project'
      }}
      onOpenChange={noOp}
      onSelectKnowledgeBase={noOp}
      onSelectGlobalChat={noOp}
      onToggleProjects={noOp}
      onFilterProjects={noOp}
      onAddProject={noOp}
    />
  )
}

/**
 * Minimal titlebar-alignment stub for the collapsed Side Pane control. The application control is
 * store-connected and would recursively create the same workspace controller in this pure layout
 * fixture; open-pane fixtures use the real SidePaneTabStripView and SidePaneShellView below.
 */
function CollapsedSidePaneHeaderLayoutStub(): React.JSX.Element {
  return (
    <div className="flex w-full justify-center">
      <Button variant="ghost" size="icon-sm" aria-label="Open side pane">
        <SidebarSimple className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}

const projectHomeContent = <ProjectHomeScreen {...repositoryConnectedProjectHomeFixture} />
const globalChatContent = <AgentChatView {...globalChatReadyFixture} />
const knowledgeBaseContent = <KnowledgeBaseConfiguredScreen {...configuredKnowledgeBaseFixture} />

function openSidePaneContent(): React.JSX.Element {
  return (
    <SidePaneShellView
      {...manyTabsFixture}
      showInlineHeaderTabs={false}
      children={projectHomeContent}
    />
  )
}

function openSidePaneHeader(): React.JSX.Element {
  return (
    <SidePaneTabStripView
      activeTabId={manyTabsFixture.activeTabId}
      categories={manyTabsFixture.categories}
      categoryMru={manyTabsFixture.categoryMru}
      contextKey={manyTabsFixture.contextKey}
      tabs={manyTabsFixture.tabs}
      onActivate={manyTabsFixture.onActivateTab}
      onClose={manyTabsFixture.onCloseTab}
      onCreateCategory={manyTabsFixture.onCreateCategory}
      onReorder={manyTabsFixture.onReorderTab}
    />
  )
}

function fixture({
  activeView,
  projects = workspaceProjects,
  activeProject = null,
  leftSidebarWidth = 280,
  sidePaneOpen = false,
  mainContent,
  title
}: {
  activeView: WorkspaceSidebarView
  projects?: Project[]
  activeProject?: Project | null
  leftSidebarWidth?: number
  sidePaneOpen?: boolean
  mainContent: React.JSX.Element
  title: string
}): WorkspaceShellLayoutProps {
  return {
    isLeftSidebarOpen: true,
    leftSidebarWidth,
    sidePaneHeaderWidth: sidePaneOpen ? 560 : 48,
    leftSidebar: sidebarFixture({ activeView, projects, activeProject }),
    titlebarCenter: <span className="text-xs font-medium">{title}</span>,
    sidePaneHeader: sidePaneOpen ? openSidePaneHeader() : <CollapsedSidePaneHeaderLayoutStub />,
    mainContent,
    labels,
    onToggleLeftSidebar: noOp,
    onOpenCommandPalette: noOp
  }
}

export const emptyProjectsFixture = fixture({
  activeView: 'workspace',
  projects: [],
  mainContent: (
    <WorkspaceEmptyStateView
      title="Choose a project to start building"
      description="Add a project to keep code, sessions, and tools together."
    />
  ),
  title: 'Workspace'
})

export const projectSelectedFixture = fixture({
  activeView: 'workspace',
  activeProject: workspaceProjects[0],
  mainContent: projectHomeContent,
  title: 'Space Zero'
})

export const globalChatSelectedFixture = fixture({
  activeView: 'global-chat',
  mainContent: globalChatContent,
  title: 'Chat'
})

export const knowledgeBaseSelectedFixture = fixture({
  activeView: 'knowledge-base',
  mainContent: knowledgeBaseContent,
  title: 'Knowledge Base'
})

export const sidePaneOpenFixture = fixture({
  activeView: 'workspace',
  activeProject: workspaceProjects[0],
  sidePaneOpen: true,
  mainContent: openSidePaneContent(),
  title: 'Space Zero'
})

export const narrowLeftSidebarFixture = fixture({
  activeView: 'workspace',
  activeProject: workspaceProjects[0],
  leftSidebarWidth: 280,
  mainContent: projectHomeContent,
  title: 'Space Zero'
})

export const wideLeftSidebarFixture = fixture({
  activeView: 'workspace',
  activeProject: workspaceProjects[0],
  leftSidebarWidth: 520,
  mainContent: projectHomeContent,
  title: 'Space Zero'
})
