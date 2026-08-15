import { useState } from 'react'

import type { Project } from '../../shared'
import type { ProjectSession } from '../../../sessions/shared'

import { ProjectList } from './project-list'

export type ProjectDropdownProps = {
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

export function ProjectDropdown({
  projects,
  activeProject,
  status,
  error,
  onAddProject,
  sessionsByProjectId,
  activeSessionId,
  sessionsStatus,
  sessionsError,
  onSelectProject,
  onEditProject,
  onArchiveProject,
  onNewSession,
  onSelectSession,
  onRenameSession,
  onArchiveSession,
  onDeleteSession
}: ProjectDropdownProps): React.JSX.Element {
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set())

  function toggleProject(project: Project): void {
    setExpandedProjectIds((current) => {
      const next = new Set(current)
      if (next.has(project.id)) next.delete(project.id)
      else next.add(project.id)
      return next
    })
  }

  function selectProject(project: Project): void {
    onSelectProject(project)
    setExpandedProjectIds((current) => new Set([...current, project.id]))
  }

  return (
    <ProjectList
      projects={projects}
      activeProject={activeProject}
      status={status}
      error={error}
      expandedProjectIds={expandedProjectIds}
      sessionsByProjectId={sessionsByProjectId}
      activeSessionId={activeSessionId}
      sessionsStatus={sessionsStatus}
      sessionsError={sessionsError}
      onAddProject={onAddProject}
      onToggleProject={toggleProject}
      onSelectProject={selectProject}
      onEditProject={onEditProject}
      onArchiveProject={onArchiveProject}
      onNewSession={onNewSession}
      onSelectSession={onSelectSession}
      onRenameSession={onRenameSession}
      onArchiveSession={onArchiveSession}
      onDeleteSession={onDeleteSession}
    />
  )
}
