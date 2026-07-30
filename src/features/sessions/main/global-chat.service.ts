import type { AgentSessionState } from '../../../shared/agent-protocol'
import type {
  AgentUserContent,
  AgentUserMessage
} from '../../../shared/agent-session-projection.model'
import type { GlobalChatContext, GlobalChatHistoryItem, WorkspaceSession } from '../shared'
import { toWorkspaceSession, type StoredSession } from './sessions.service'
import {
  GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY,
  type StoredGlobalChatContext
} from './global-chat.repository'

export type GlobalChatService = {
  getOrCreateCurrentChatContext: () => Promise<GlobalChatContext>
  listChatHistory: () => Promise<GlobalChatHistoryItem[]>
  resumeChatContext: (chatContextId: string) => Promise<GlobalChatContext>
  clearChat: () => Promise<GlobalChatContext>
}

export function createGlobalChatService({
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
  getCurrentChatContext: () => Promise<StoredGlobalChatContext | undefined>
  listChatContexts: () => Promise<StoredGlobalChatContext[]>
  findChatContextById: (chatContextId: string) => Promise<StoredGlobalChatContext | undefined>
  createCurrentChatContext: (agentSessionId: string) => Promise<StoredGlobalChatContext>
  setCurrentChatContext: (chatContextId: string) => Promise<StoredGlobalChatContext>
  clearCurrentChatContext: () => Promise<void>
  findSessionById: (sessionId: string) => Promise<StoredSession | undefined>
  getSessionState: (request: { sessionId: string }) => Promise<AgentSessionState>
  createSession: () => Promise<StoredSession>
  deleteSession: (sessionId: string) => Promise<void>
}): GlobalChatService {
  let pending: Promise<GlobalChatContext> | undefined

  async function createAndPersist(): Promise<GlobalChatContext> {
    const createdSession = await createSession()
    try {
      const createdContext = await createCurrentChatContext(createdSession.id)
      return toGlobalChatContext(createdContext, toWorkspaceSession(createdSession))
    } catch (error) {
      await deleteSession(createdSession.id).catch(() => undefined)
      throw error
    }
  }

  async function getOrCreate(): Promise<GlobalChatContext> {
    const currentContext = await getCurrentChatContext()
    if (currentContext) {
      const storedSession = await findSessionById(currentContext.agentSessionId)
      if (
        currentContext.workspaceContextKey === GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY &&
        isGlobalChatSession(storedSession)
      ) {
        return toGlobalChatContext(currentContext, toWorkspaceSession(storedSession))
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
      const currentChatContext = await getCurrentChatContext()
      const chatContexts = await listChatContexts()
      const history = await Promise.all(
        chatContexts
          .filter(
            (chatContext) =>
              chatContext.workspaceContextKey === GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY &&
              chatContext.id !== currentChatContext?.id
          )
          .map(async (chatContext): Promise<GlobalChatHistoryItem | undefined> => {
            const storedSession = await findSessionById(chatContext.agentSessionId)
            if (!isGlobalChatSession(storedSession)) return undefined

            const initialPrompt = getInitialPrompt(
              await getSessionState({ sessionId: storedSession.id })
            )
            if (!initialPrompt) return undefined

            return {
              id: chatContext.id,
              initialPrompt,
              createdAt: chatContext.createdAt.toISOString()
            }
          })
      )
      return history.filter((item): item is GlobalChatHistoryItem => Boolean(item))
    },
    async resumeChatContext(chatContextId) {
      const chatContext = await findChatContextById(chatContextId.trim())
      if (!chatContext || chatContext.workspaceContextKey !== GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY) {
        throw new Error('Global Chat Context was not found.')
      }
      const storedSession = await findSessionById(chatContext.agentSessionId)
      if (!isGlobalChatSession(storedSession)) {
        throw new Error('Global Chat Context is unavailable.')
      }

      const selectedContext = await setCurrentChatContext(chatContext.id)
      return toGlobalChatContext(selectedContext, toWorkspaceSession(storedSession))
    },
    clearChat: createAndPersist
  }
}

function isGlobalChatSession(session: StoredSession | undefined): session is StoredSession {
  return Boolean(
    session &&
    session.projectId === null &&
    session.managedContext === 'global-chat' &&
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

function toGlobalChatContext(
  chatContext: StoredGlobalChatContext,
  agentSession: WorkspaceSession
): GlobalChatContext {
  return {
    id: chatContext.id,
    workspaceContext: { kind: 'global-chat', key: 'global-chat' },
    agentSession,
    createdAt: chatContext.createdAt.toISOString(),
    updatedAt: chatContext.updatedAt.toISOString()
  }
}
