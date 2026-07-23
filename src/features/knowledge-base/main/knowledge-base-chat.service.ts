import type { WorkspaceSession } from '../../sessions/shared'
import { toWorkspaceSession, type StoredSession } from '../../sessions/main/sessions.service'
import type { KnowledgeBaseStatus } from '../shared'

export type KnowledgeBaseChatService = {
  getOrCreateCurrentSession: () => Promise<WorkspaceSession>
  startNewChat: () => Promise<WorkspaceSession>
}

export function createKnowledgeBaseChatService({
  getStatus,
  getCurrentSessionId,
  setCurrentSessionId,
  clearCurrentSessionId,
  findSessionById,
  createSession,
  deleteSession
}: {
  getStatus: () => Promise<KnowledgeBaseStatus>
  getCurrentSessionId: () => Promise<string | undefined>
  setCurrentSessionId: (sessionId: string) => Promise<void>
  clearCurrentSessionId: () => Promise<void>
  findSessionById: (sessionId: string) => Promise<StoredSession | undefined>
  createSession: () => Promise<StoredSession>
  deleteSession: (sessionId: string) => Promise<void>
}): KnowledgeBaseChatService {
  let pending: Promise<WorkspaceSession> | undefined

  async function createAndPersist(): Promise<WorkspaceSession> {
    const created = await createSession()
    try {
      await setCurrentSessionId(created.id)
      return toWorkspaceSession(created)
    } catch (error) {
      await deleteSession(created.id).catch(() => undefined)
      throw error
    }
  }

  async function getOrCreate(): Promise<WorkspaceSession> {
    const status = await getStatus()
    if (status.setupState !== 'configured') throw new Error('Knowledge Base is not available.')

    const currentSessionId = await getCurrentSessionId()
    if (currentSessionId) {
      const stored = await findSessionById(currentSessionId)
      if (
        stored &&
        stored.projectId === null &&
        stored.managedContext === 'knowledge-base' &&
        !stored.archivedAt
      ) {
        return toWorkspaceSession(stored)
      }
      await clearCurrentSessionId()
    }

    return createAndPersist()
  }

  return {
    getOrCreateCurrentSession() {
      pending ??= getOrCreate().finally(() => {
        pending = undefined
      })
      return pending
    },
    async startNewChat() {
      const status = await getStatus()
      if (status.setupState !== 'configured') throw new Error('Knowledge Base is not available.')
      return createAndPersist()
    }
  }
}
