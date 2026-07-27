import type { SessionsService } from '../../sessions/main/sessions.service'
import type { DeleteProjectResult } from '../shared'
import type { ProjectsService } from './projects.service'
import {
  withProjectLifecycleLock as runWithProjectLifecycleLock,
  type ProjectLifecycleLock
} from './project-lifecycle-lock'

type ArchiveProjectLifecycleDependencies = {
  sessionsService: Pick<SessionsService, 'archiveProjectSessions'>
  projectsService: Pick<ProjectsService, 'archiveProject'>
  deleteUtilitySession: (request: { sessionId: string }) => Promise<void>
  closeBrowsersForSession?: (session: { id: string }) => void
  withProjectLifecycleLock?: ProjectLifecycleLock
}

type DeleteProjectLifecycleDependencies = {
  sessionCleanupService: { deleteProjectSessions: (projectId: string) => Promise<string[]> }
  projectsService: Pick<ProjectsService, 'deleteProject'>
  withProjectLifecycleLock?: ProjectLifecycleLock
}

export async function archiveProjectLifecycle(
  projectId: string,
  {
    sessionsService,
    projectsService,
    deleteUtilitySession,
    closeBrowsersForSession = () => undefined,
    withProjectLifecycleLock = runWithProjectLifecycleLock
  }: ArchiveProjectLifecycleDependencies
): Promise<void> {
  const normalizedProjectId = projectId.trim()
  await withProjectLifecycleLock(normalizedProjectId, async () => {
    const sessions = await sessionsService.archiveProjectSessions(normalizedProjectId)
    await projectsService.archiveProject(normalizedProjectId)
    for (const session of sessions) closeBrowsersForSession(session)
    await Promise.all(
      sessions.map((session) =>
        deleteUtilitySession({ sessionId: session.id }).catch(() => undefined)
      )
    )
  })
}

export async function deleteProjectLifecycle(
  projectId: string,
  {
    sessionCleanupService,
    projectsService,
    withProjectLifecycleLock = runWithProjectLifecycleLock
  }: DeleteProjectLifecycleDependencies
): Promise<DeleteProjectResult> {
  const normalizedProjectId = projectId.trim()
  return withProjectLifecycleLock(normalizedProjectId, async () => {
    const deletedSessionIds = await sessionCleanupService.deleteProjectSessions(normalizedProjectId)
    await projectsService.deleteProject(normalizedProjectId)
    return { deletedSessionIds }
  })
}
