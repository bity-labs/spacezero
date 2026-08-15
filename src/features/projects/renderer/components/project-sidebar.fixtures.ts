import type { Project } from '../../shared'
import type { ProjectSession } from '../../../sessions/shared'

export const projectSidebarTimestamp = '2026-08-13T18:46:28.000Z'

export const projectSidebarProjects: Project[] = [
  createProject('project-1', 'Space Zero'),
  createProject('project-2', 'Launchpad'),
  createProject('project-3', 'Knowledge Garden')
]

export const projectSidebarSessions: ProjectSession[] = [
  createProjectSession(
    'session-1',
    'Issue #108 agent spawns policy',
    'running',
    projectSidebarProjects[0].id
  ),
  createProjectSession('session-2', 'Refine project sidebar', 'idle', projectSidebarProjects[0].id),
  createProjectSession(
    'session-3',
    'Review Git diff panel',
    'completed',
    projectSidebarProjects[0].id
  ),
  createProjectSession(
    'session-4',
    'Fix broken preview tab',
    'failed',
    projectSidebarProjects[0].id
  )
]

export const projectSidebarSessionsByProjectId = new Map([
  [projectSidebarProjects[0].id, projectSidebarSessions]
])

export const projectSidebarCallbacks = {
  onAddProject: () => undefined,
  onSelectProject: () => undefined,
  onEditProject: () => undefined,
  onToggleProject: () => undefined,
  onNewSession: () => undefined,
  onSelectSession: () => undefined,
  onRenameSession: async () => undefined,
  onArchiveSession: () => undefined,
  onDeleteSession: () => undefined
}

function createProject(id: string, name: string): Project {
  return {
    id,
    name,
    path: `~/SpaceZero/projects/${id}`,
    createdAt: projectSidebarTimestamp,
    updatedAt: projectSidebarTimestamp
  }
}

function createProjectSession(
  id: string,
  title: string,
  status: ProjectSession['status'],
  projectId: string
): ProjectSession {
  return {
    id,
    kind: 'project',
    projectId,
    title,
    status,
    createdAt: projectSidebarTimestamp,
    updatedAt: projectSidebarTimestamp
  }
}
