import type { Project } from '../../shared'
import type { ProjectSession } from '../../../sessions/shared'

import { ProjectDropdown } from './project-dropdown'

export type ProjectSidebarListProps = {
  projects: Project[]
  activeProject: Project | null
  status: 'loading' | 'ready' | 'error'
  error: string | null
  onAddProject: () => void
  sessionsByProjectId?: Map<string, ProjectSession[]>
  activeSessionId?: string | null
  sessionsStatus?: 'loading' | 'ready' | 'error'
  sessionsError?: string | null
  onSelectProject: (project: Project) => void
  onEditProject: (project: Project) => void
  onArchiveProject?: (project: Project) => void
  onDeleteProject?: (project: Project) => void
  onNewSession?: (project: Project) => void
  onSelectSession?: (session: ProjectSession) => void
  onRenameSession?: (session: ProjectSession, title: string) => Promise<void>
  onArchiveSession?: (session: ProjectSession) => void
  onDeleteSession?: (session: ProjectSession) => void
}

export function ProjectSidebarList(props: ProjectSidebarListProps): React.JSX.Element {
  return <ProjectDropdown {...props} />
}
