import type { AgentSessionState } from '../../../shared/agent-protocol'
import type {
  AgentUserContent,
  AgentUserMessage
} from '../../../shared/agent-session-projection.model'
import type { WorkspaceSession } from '../../sessions/shared'
import { toWorkspaceSession, type StoredSession } from '../../sessions/main/sessions.service'
import type {
  KnowledgeBaseChatContext,
  KnowledgeBaseChatHistoryItem,
  KnowledgeBaseStatus
} from '../shared'
import {
  KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY,
  type StoredChatContext
} from './knowledge-base-chat.repository'

export type KnowledgeBaseChatService = {
  getOrCreateCurrentChatContext: () => Promise<KnowledgeBaseChatContext>
  listChatHistory: () => Promise<KnowledgeBaseChatHistoryItem[]>
  resumeChatContext: (chatContextId: string) => Promise<KnowledgeBaseChatContext>
  clearChat: () => Promise<KnowledgeBaseChatContext>
}

export function createKnowledgeBaseChatService({
  getStatus,
  getCurrentChatContext,
  listChatContexts,
  findChatContextById,
  createCurrentChatContext,
  setCurrentChatContext,
  clearCurrentChatContext,
  findSessionById,
  getSessionState,
  createSession,
  deleteSession
}: {
  getStatus: () => Promise<KnowledgeBaseStatus>
  getCurrentChatContext: () => Promise<StoredChatContext | undefined>
  listChatContexts: () => Promise<StoredChatContext[]>
  findChatContextById: (chatContextId: string) => Promise<StoredChatContext | undefined>
  createCurrentChatContext: (agentSessionId: string) => Promise<StoredChatContext>
  setCurrentChatContext: (chatContextId: string) => Promise<StoredChatContext>
  clearCurrentChatContext: () => Promise<void>
  findSessionById: (sessionId: string) => Promise<StoredSession | undefined>
  getSessionState: (request: { sessionId: string }) => Promise<AgentSessionState>
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
    async listChatHistory() {
      const status = await getStatus()
      if (status.setupState !== 'configured') throw new Error('Knowledge Base is not available.')

      const currentChatContext = await getCurrentChatContext()
      const chatContexts = await listChatContexts()
      const history = await Promise.all(
        chatContexts
          .filter(
            (chatContext) =>
              chatContext.workspaceContextKey === KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY &&
              chatContext.id !== currentChatContext?.id
          )
          .map(async (chatContext): Promise<KnowledgeBaseChatHistoryItem | undefined> => {
            const storedSession = await findSessionById(chatContext.agentSessionId)
            if (!isKnowledgeBaseSession(storedSession)) return undefined

            const state = await getSessionState({ sessionId: storedSession.id })
            const initialPrompt = getInitialPrompt(state)
            if (!initialPrompt) return undefined

            return {
              id: chatContext.id,
              initialPrompt,
              createdAt: chatContext.createdAt.toISOString()
            }
          })
      )
      return history.filter((item): item is KnowledgeBaseChatHistoryItem => Boolean(item))
    },
    async resumeChatContext(chatContextId) {
      const status = await getStatus()
      if (status.setupState !== 'configured') throw new Error('Knowledge Base is not available.')

      const chatContext = await findChatContextById(chatContextId)
      if (
        !chatContext ||
        chatContext.workspaceContextKey !== KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY
      ) {
        throw new Error('Knowledge Base Chat Context was not found.')
      }
      const storedSession = await findSessionById(chatContext.agentSessionId)
      if (!isKnowledgeBaseSession(storedSession)) {
        throw new Error('Knowledge Base Chat Context is not available.')
      }

      const selectedContext = await setCurrentChatContext(chatContext.id)
      return toKnowledgeBaseChatContext(selectedContext, toWorkspaceSession(storedSession))
    },
    async clearChat() {
      const status = await getStatus()
      if (status.setupState !== 'configured') throw new Error('Knowledge Base is not available.')
      return createAndPersist()
    }
  }
}

function isKnowledgeBaseSession(session: StoredSession | undefined): session is StoredSession {
  return Boolean(
    session &&
    session.projectId === null &&
    session.managedContext === 'knowledge-base' &&
    !session.archivedAt
  )
}

function getInitialPrompt(state: AgentSessionState): string | undefined {
  const firstUserMessage = state.transcriptSnapshot?.find(
    (message): message is AgentUserMessage => message.role === 'user'
  )
  if (!firstUserMessage) return undefined

  const text =
    typeof firstUserMessage.content === 'string'
      ? firstUserMessage.content
      : firstUserMessage.content.map(getUserContentText).join(' ')
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized || undefined
}

function getUserContentText(content: AgentUserContent): string {
  return content.type === 'text' ? content.text : ''
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
