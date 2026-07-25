import type { ManagedWorktreeService } from './managed-worktree.service'
import type { SessionsRepository, StoredSession } from './sessions.service'
import type { SessionWorktree } from '../shared'

type SessionCleanupRepository = Pick<
  SessionsRepository,
  'findSessionById' | 'findProjectById' | 'listByProjectIdIncludingArchived' | 'deleteById'
>

type StoredProject = Awaited<ReturnType<SessionCleanupRepository['findProjectById']>>

export function createSessionCleanupService({
  repository,
  worktrees,
  deleteUtilitySession,
  removeTranscript,
  closeTerminalsForSession = async () => undefined,
  closeBrowsersForSession = () => undefined
}: {
  repository: SessionCleanupRepository
  worktrees: Pick<ManagedWorktreeService, 'remove'>
  deleteUtilitySession: (request: { sessionId: string }) => Promise<void>
  removeTranscript: (path: string) => Promise<void>
  closeTerminalsForSession?: (session: StoredSession) => Promise<void>
  closeBrowsersForSession?: (session: StoredSession) => void
}) {
  const deleteOperationsBySession = new Map<string, Promise<void>>()

  async function deleteSession(sessionId: string): Promise<void> {
    const normalizedSessionId = sessionId.trim()
    const pending = deleteOperationsBySession.get(normalizedSessionId)
    if (pending) return pending

    const operation = (async () => {
      const session = await repository.findSessionById(normalizedSessionId)
      if (!session) throw new Error('Session not found')
      const project = session.projectId
        ? await repository.findProjectById(session.projectId)
        : undefined
      await deleteStoredSession(session, project)
    })()
    deleteOperationsBySession.set(normalizedSessionId, operation)
    try {
      await operation
    } finally {
      if (deleteOperationsBySession.get(normalizedSessionId) === operation) {
        deleteOperationsBySession.delete(normalizedSessionId)
      }
    }
  }

  async function deleteProjectSessions(projectId: string): Promise<void> {
    const normalizedProjectId = projectId.trim()
    const sessions = await repository.listByProjectIdIncludingArchived(normalizedProjectId)
    for (const session of sessions) await deleteSession(session.id)
  }

  async function deleteStoredSession(
    session: StoredSession,
    project: StoredProject
  ): Promise<void> {
    await closeTerminalsForSession(session)
    closeBrowsersForSession(session)
    await deleteUtilitySession({ sessionId: session.id })

    const worktree = readStoredWorktree(session)
    if (worktree) {
      if (!session.projectId || !project) throw new Error('session.worktreeProjectMissing')
      await worktrees.remove({
        projectPath: project.path,
        projectId: session.projectId,
        sessionId: session.id,
        worktree
      })
    }

    await repository.deleteById(session.id)
    if (session.transcriptPath) {
      await removeTranscript(session.transcriptPath).catch(() => undefined)
    }
  }

  return { deleteSession, deleteProjectSessions }
}

function readStoredWorktree(session: StoredSession): SessionWorktree | undefined {
  const values = [session.worktreePath, session.worktreeBranch, session.worktreeBaseRevision]
  if (values.every((value) => !value)) return undefined
  if (!session.worktreePath || !session.worktreeBranch || !session.worktreeBaseRevision) {
    throw new Error('session.worktreeMetadataIncomplete')
  }
  return {
    path: session.worktreePath,
    branch: session.worktreeBranch,
    baseRevision: session.worktreeBaseRevision
  }
}
