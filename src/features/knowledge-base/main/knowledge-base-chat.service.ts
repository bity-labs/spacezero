import type { WorkspaceSession } from '../../sessions/shared'
import { toWorkspaceSession, type StoredSession } from '../../sessions/main/sessions.service'
import type { KnowledgeBaseChatContext, KnowledgeBaseStatus } from '../shared'
import {
  KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY,
  type StoredChatContext
} from './knowledge-base-chat.repository'

export type KnowledgeBaseChatService = {
  getOrCreateCurrentChatContext: () => Promise<KnowledgeBaseChatContext>
  clearChat: () => Promise<KnowledgeBaseChatContext>
}

export function createKnowledgeBaseChatService({
  getStatus,
  getCurrentChatContext,
  createCurrentChatContext,
  clearCurrentChatContext,
  findSessionById,
  createSession,
  deleteSession
}: {
  getStatus: () => Promise<KnowledgeBaseStatus>
  getCurrentChatContext: () => Promise<StoredChatContext | undefined>
  createCurrentChatContext: (agentSessionId: string) => Promise<StoredChatContext>
  clearCurrentChatContext: () => Promise<void>
  findSessionById: (sessionId: string) => Promise<StoredSession | undefined>
  createSession: () => Promise<StoredSession>
  deleteSession: (sessionId: string) => Promise<void>
}): KnowledgeBaseChatService {
  let pending: Promise<KnowledgeBaseChatContext> | undefined

  async function createAndPersist(): Promise<KnowledgeBaseChatContext> {
    const createdSession = await createSession()
    try {
      const createdChatContext = await createCurrentChatContext(createdSession.id)
      return toKnowledgeBaseChatContext(createdChatContext, toWorkspaceSession(createdSession))
    } catch (error) {
      await deleteSession(createdSession.id).catch(() => undefined)
      throw error
    }
  }

  async function getOrCreate(): Promise<KnowledgeBaseChatContext> {
    const status = await getStatus()
    if (status.setupState !== 'configured') throw new Error('Knowledge Base is not available.')

    const currentChatContext = await getCurrentChatContext()
    if (currentChatContext) {
      const storedSession = await findSessionById(currentChatContext.agentSessionId)
      if (
        currentChatContext.workspaceContextKey === KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY &&
        storedSession &&
        storedSession.projectId === null &&
        storedSession.managedContext === 'knowledge-base' &&
        !storedSession.archivedAt
      ) {
        return toKnowledgeBaseChatContext(currentChatContext, toWorkspaceSession(storedSession))
      }
      await clearCurrentChatContext()
    }

    return createAndPersist()
  }

  return {
    getOrCreateCurrentChatContext() {
      pending ??= getOrCreate().finally(() => {
        pending = undefined
      })
      return pending
    },
    async clearChat() {
      const status = await getStatus()
      if (status.setupState !== 'configured') throw new Error('Knowledge Base is not available.')
      return createAndPersist()
    }
  }
}

function toKnowledgeBaseChatContext(
  chatContext: StoredChatContext,
  agentSession: WorkspaceSession
): KnowledgeBaseChatContext {
  return {
    id: chatContext.id,
    workspaceContext: { kind: 'knowledge-base', key: 'knowledge-base' },
    agentSession,
    createdAt: chatContext.createdAt.toISOString(),
    updatedAt: chatContext.updatedAt.toISOString()
  }
}
