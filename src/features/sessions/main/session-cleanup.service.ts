import type { ManagedWorktreeService } from './managed-worktree.service'
import type { SessionsRepository, StoredSession } from './sessions.service'
import type { SessionWorktree } from '../shared'

type SessionCleanupRepository = Pick<
  SessionsRepository,
  'findSessionById' | 'findProjectById' | 'listByProjectIdIncludingArchived' | 'deleteById'
>

type StoredProject = Awaited<ReturnType<SessionCleanupRepository['findProjectById']>>
type ProjectLifecycleLock = <T>(projectId: string, operation: () => Promise<T>) => Promise<T>
type TerminalDeletionRequest = {
  operationKey: string
  sessions: readonly StoredSession[]
}

export function createSessionCleanupService({
  repository,
  worktrees,
  deleteUtilitySession,
  removeTranscript,
  closeTerminalsForSession = async () => undefined,
  closeTerminalsForDeletion = async ({ sessions }) => {
    for (const session of sessions) await closeTerminalsForSession(session)
  },
  closeBrowsersForSession = () => undefined,
  withProjectLifecycleLock = async (_projectId, operation) => operation()
}: {
  repository: SessionCleanupRepository
  worktrees: Pick<ManagedWorktreeService, 'remove'>
  deleteUtilitySession: (request: { sessionId: string }) => Promise<void>
  removeTranscript: (path: string) => Promise<void>
  closeTerminalsForSession?: (session: StoredSession) => Promise<void>
  closeTerminalsForDeletion?: (request: TerminalDeletionRequest) => Promise<void>
  closeBrowsersForSession?: (session: StoredSession) => void
  withProjectLifecycleLock?: ProjectLifecycleLock
}) {
  const deleteOperationsBySession = new Map<string, Promise<void>>()

  async function deleteSession(sessionId: string): Promise<void> {
    const normalizedSessionId = sessionId.trim()
    const pending = deleteOperationsBySession.get(normalizedSessionId)
    if (pending) return pending

    const operation = (async () => {
      const session = await repository.findSessionById(normalizedSessionId)
      if (!session) throw new Error('Session not found')

      const deleteCurrentSession = async (): Promise<void> => {
        const currentSession = await repository.findSessionById(normalizedSessionId)
        if (!currentSession) return
        const project = currentSession.projectId
          ? await repository.findProjectById(currentSession.projectId)
          : undefined
        await closeTerminalsForDeletion({
          operationKey: `delete-session:${currentSession.id}`,
          sessions: [currentSession]
        })
        await deleteStoredSession(currentSession, project)
      }

      if (session.projectId) {
        await withProjectLifecycleLock(session.projectId, deleteCurrentSession)
        return
      }
      await deleteCurrentSession()
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
    await closeTerminalsForDeletion({
      operationKey: `delete-project:${normalizedProjectId}`,
      sessions
    })
    for (const session of sessions) {
      const project = session.projectId
        ? await repository.findProjectById(session.projectId)
        : undefined
      await deleteStoredSession(session, project)
    }
  }

  async function deleteStoredSession(
    session: StoredSession,
    project: StoredProject
  ): Promise<void> {
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
