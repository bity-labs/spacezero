import { GearSix, WarningCircle } from '@phosphor-icons/react'

import { ProjectSidebarList } from '../../../../features/projects/renderer'
import type { Project } from '../../../../features/projects/shared'
import { Avatar, AvatarFallback, AvatarImage } from '@renderer/components/ui/avatar'
import { Button } from '@renderer/components/ui/button'
import type { WorkspaceSidebarProps } from './workspace-sidebar'

const noOp = (): void => undefined
const fixtureTimestamp = '2026-08-13T18:46:28.000Z'

const projectNames = [
  'Space Zero',
  'Launchpad',
  'Knowledge Garden',
  'Agent Bench',
  'Design System',
  'Project Atlas',
  'Terminal Lab',
  'Preview Studio',
  'Git Workflows',
  'Session Monitor',
  'Builder Portal',
  'Release Console'
]

export const workspaceSidebarProjects: Project[] = projectNames.map((name, index) => ({
  id: `project-${index + 1}`,
  name,
  path: `~/SpaceZero/projects/project-${index + 1}`,
  createdAt: fixtureTimestamp,
  updatedAt: fixtureTimestamp
}))

const labels: WorkspaceSidebarProps['labels'] = {
  sidebar: 'Workspace sidebar',
  navigation: 'Workspace navigation',
  knowledgeBase: 'Knowledge Base',
  globalChat: 'Chat',
  projects: 'Projects',
  filterProjects: 'Filter projects',
  addProject: 'Add project'
}

const builderAvatar =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Crect width="64" height="64" rx="32" fill="%232563eb"/%3E%3Ccircle cx="32" cy="24" r="11" fill="%23dbeafe"/%3E%3Cpath d="M13 55c2-12 10-18 19-18s17 6 19 18" fill="%23dbeafe"/%3E%3C/svg%3E'

function accountMenu({
  connected,
  updateReady = false
}: {
  connected: boolean
  updateReady?: boolean
}): React.JSX.Element {
  const username = connected ? '@builder' : 'Connect GitHub'

  return (
    <section className="flex items-center gap-2 rounded-lg px-1 py-1" aria-label="Account menu">
      <Avatar className="size-8 bg-muted">
        {connected ? <AvatarImage src={builderAvatar} alt={username} /> : null}
        <AvatarFallback className="text-sm font-medium">{connected ? 'TB' : 'GH'}</AvatarFallback>
      </Avatar>
      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{username}</p>
      {updateReady ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="border border-amber-300 bg-amber-100 text-amber-950 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
          aria-label="Restart to update Space Zero"
        >
          <WarningCircle className="size-4" aria-hidden="true" />
          Update ready
        </Button>
      ) : null}
      <Button variant="ghost" size="icon-sm" aria-label="Settings">
        <GearSix className="size-5" aria-hidden="true" />
      </Button>
    </section>
  )
}

function projectList({
  projects = [],
  activeProject = null,
  status = 'ready',
  error = null
}: {
  projects?: Project[]
  activeProject?: Project | null
  status?: 'loading' | 'ready' | 'error'
  error?: string | null
} = {}): React.JSX.Element {
  return (
    <ProjectSidebarList
      projects={projects}
      activeProject={activeProject}
      status={status}
      error={error}
      onAddProject={noOp}
      onSelectProject={noOp}
      onEditProject={noOp}
    />
  )
}

const baseFixture: WorkspaceSidebarProps = {
  open: true,
  activeView: 'workspace',
  projectsExpanded: true,
  projectsContent: projectList(),
  accountMenu: accountMenu({ connected: true }),
  labels,
  onOpenChange: noOp,
  onSelectKnowledgeBase: noOp,
  onSelectGlobalChat: noOp,
  onToggleProjects: noOp,
  onFilterProjects: noOp,
  onAddProject: noOp
}

export const noProjectsFixture: WorkspaceSidebarProps = baseFixture

export const loadingProjectsFixture: WorkspaceSidebarProps = {
  ...baseFixture,
  projectsContent: projectList({ status: 'loading' })
}

export const projectErrorFixture: WorkspaceSidebarProps = {
  ...baseFixture,
  projectsContent: projectList({
    status: 'error',
    error: 'Could not reach the local project store.'
  })
}

export const manyProjectsFixture: WorkspaceSidebarProps = {
  ...baseFixture,
  projectsContent: projectList({ projects: workspaceSidebarProjects })
}

export const activeProjectFixture: WorkspaceSidebarProps = {
  ...baseFixture,
  projectsContent: projectList({
    projects: workspaceSidebarProjects.slice(0, 4),
    activeProject: workspaceSidebarProjects[0]
  })
}

export const globalChatSelectedFixture: WorkspaceSidebarProps = {
  ...activeProjectFixture,
  activeView: 'global-chat'
}

export const knowledgeBaseSelectedFixture: WorkspaceSidebarProps = {
  ...activeProjectFixture,
  activeView: 'knowledge-base'
}

export const connectedAccountFixture: WorkspaceSidebarProps = activeProjectFixture

export const disconnectedAccountFixture: WorkspaceSidebarProps = {
  ...activeProjectFixture,
  accountMenu: accountMenu({ connected: false })
}

export const updateReadyAccountFixture: WorkspaceSidebarProps = {
  ...activeProjectFixture,
  accountMenu: accountMenu({ connected: true, updateReady: true })
}
