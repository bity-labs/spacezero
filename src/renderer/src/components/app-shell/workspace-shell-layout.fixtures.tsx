import { BookOpenText, Browser, ChatCircleDots, SidebarSimple } from '@phosphor-icons/react'

import type { Project } from '../../../../features/projects/shared'
import { ProjectSidebarList } from '../../../../features/projects/renderer'
import { Button } from '@renderer/components/ui/button'
import { WorkspaceSidebar, type WorkspaceSidebarView } from './workspace-sidebar'
import type { WorkspaceShellLayoutProps } from './workspace-shell-layout'

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

function accountMenuFixture(): React.JSX.Element {
  return (
    <section className="flex items-center gap-2 rounded-lg px-1 py-1" aria-label="Account menu">
      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
        TB
      </div>
      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">@builder</p>
      <Button variant="ghost" size="icon-sm" aria-label="Settings">
        <span aria-hidden="true">⚙</span>
      </Button>
    </section>
  )
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
      accountMenu={accountMenuFixture()}
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

function collapsedSidePaneHeader(): React.JSX.Element {
  return (
    <div className="flex w-full justify-center">
      <Button variant="ghost" size="icon-sm" aria-label="Open side pane">
        <SidebarSimple className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}

function emptyWorkspaceContent(): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="rounded-lg border border-dashed bg-card px-12 py-10 text-center">
        <h2 className="text-sm font-medium">Choose a project to start building</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Add a project to keep code, sessions, and tools together.
        </p>
      </div>
    </div>
  )
}

function projectContent(): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Project Home
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Space Zero</h1>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium">Start a Project Session</h2>
          <p className="mt-2 text-xs text-muted-foreground">Continue issue #448 in its worktree.</p>
        </section>
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium">Repository</h2>
          <p className="mt-2 text-xs text-muted-foreground">bity-labs/spacezero</p>
        </section>
      </div>
    </div>
  )
}

function globalChatContent(): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
      <ChatCircleDots className="size-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-semibold">What do you want to build?</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Ask the workspace agent about Space Zero, your projects, or the next task.
      </p>
    </div>
  )
}

function knowledgeBaseContent(): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <div className="flex items-center gap-3">
        <BookOpenText className="size-7 text-muted-foreground" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-semibold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">Notes and durable project context.</p>
        </div>
      </div>
      <div className="mt-6 flex-1 rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
        Select a note from Files to start reading.
      </div>
    </div>
  )
}

function sidePaneOpenContent(): React.JSX.Element {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px]">
      {projectContent()}
      <aside className="flex min-h-0 flex-col border-l bg-card" aria-label="Side pane">
        <div className="flex h-10 items-center gap-2 border-b px-3 text-xs font-medium">
          <Browser className="size-4" aria-hidden="true" />
          Browser
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          localhost:5173
        </div>
      </aside>
    </div>
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
    sidePaneHeaderWidth: sidePaneOpen ? 420 : 48,
    leftSidebar: sidebarFixture({ activeView, projects, activeProject }),
    titlebarCenter: <span className="text-xs font-medium">{title}</span>,
    sidePaneHeader: sidePaneOpen ? (
      <div className="flex w-full items-center border-l px-3 text-xs text-muted-foreground">
        Browser
      </div>
    ) : (
      collapsedSidePaneHeader()
    ),
    mainContent,
    labels,
    onToggleLeftSidebar: noOp,
    onOpenCommandPalette: noOp
  }
}

export const emptyProjectsFixture = fixture({
  activeView: 'workspace',
  projects: [],
  mainContent: emptyWorkspaceContent(),
  title: 'Workspace'
})

export const projectSelectedFixture = fixture({
  activeView: 'workspace',
  activeProject: workspaceProjects[0],
  mainContent: projectContent(),
  title: 'Space Zero'
})

export const globalChatSelectedFixture = fixture({
  activeView: 'global-chat',
  mainContent: globalChatContent(),
  title: 'Chat'
})

export const knowledgeBaseSelectedFixture = fixture({
  activeView: 'knowledge-base',
  mainContent: knowledgeBaseContent(),
  title: 'Knowledge Base'
})

export const sidePaneOpenFixture = fixture({
  activeView: 'workspace',
  activeProject: workspaceProjects[0],
  sidePaneOpen: true,
  mainContent: sidePaneOpenContent(),
  title: 'Space Zero'
})

export const narrowLeftSidebarFixture = fixture({
  activeView: 'workspace',
  activeProject: workspaceProjects[0],
  leftSidebarWidth: 280,
  mainContent: projectContent(),
  title: 'Space Zero'
})

export const wideLeftSidebarFixture = fixture({
  activeView: 'workspace',
  activeProject: workspaceProjects[0],
  leftSidebarWidth: 520,
  mainContent: projectContent(),
  title: 'Space Zero'
})
