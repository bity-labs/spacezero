import { ProjectSidebarList } from '../../../../features/projects/renderer'
import type { Project } from '../../../../features/projects/shared'
import { AccountMenuView } from './account-menu-view'
import {
  connectedAccountMenuFixture,
  disconnectedAccountMenuFixture,
  updateReadyAccountMenuFixture
} from './account-menu-view.fixtures'
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
  accountMenu: <AccountMenuView {...connectedAccountMenuFixture} />,
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
  accountMenu: <AccountMenuView {...disconnectedAccountMenuFixture} />
}

export const updateReadyAccountFixture: WorkspaceSidebarProps = {
  ...activeProjectFixture,
  accountMenu: <AccountMenuView {...updateReadyAccountMenuFixture} />
}
