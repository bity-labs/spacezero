import type { AgentSessionState } from '../../../shared/agent-protocol'
import type {
  AgentUserContent,
  AgentUserMessage
} from '../../../shared/agent-session-projection.model'
import type { GlobalChatContext, GlobalChatHistoryItem, ManagedChatAgentSession } from '../shared'
import { toManagedChatAgentSession, type StoredSession } from './sessions.service'
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
  let latestMutationGeneration = 0
  let mutationQueue = Promise.resolve()

  function beginCurrentContextMutation(): number {
    latestMutationGeneration += 1
    return latestMutationGeneration
  }

  function isLatestCurrentContextMutation(generation: number): boolean {
    return latestMutationGeneration === generation
  }

  async function runCurrentContextMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = mutationQueue.then(operation, operation)
    mutationQueue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  async function rollbackCreatedSession(sessionId: string, creationFailure: unknown): Promise<never> {
    try {
      await deleteSession(sessionId)
    } catch (rollbackFailure) {
      const rollbackError = new Error('globalChat.creationRollbackFailed', {
        cause: creationFailure
      })
      Object.defineProperty(rollbackError, 'rollbackFailures', {
        value: [rollbackFailure],
        enumerable: false
      })
      throw rollbackError
    }
    throw creationFailure
  }

  async function createAndPersist(): Promise<GlobalChatContext> {
    const createdSession = await createSession()
    try {
      const createdContext = await createCurrentChatContext(createdSession.id)
      return toGlobalChatContext(createdContext, toManagedChatAgentSession(createdSession))
    } catch (error) {
      return rollbackCreatedSession(createdSession.id, error)
    }
  }

  async function getPersistedCurrentChatContext(): Promise<GlobalChatContext> {
    const currentContext = await getCurrentChatContext()
    if (
      !currentContext ||
      currentContext.workspaceContextKey !== GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY
    ) {
      throw new Error('Global Chat Context is unavailable.')
    }
    const storedSession = await findSessionById(currentContext.agentSessionId)
    if (!isGlobalChatSession(storedSession)) {
      throw new Error('Global Chat Context is unavailable.')
    }
    return toGlobalChatContext(currentContext, toManagedChatAgentSession(storedSession))
  }

  async function getOrCreate(): Promise<GlobalChatContext> {
    const currentContext = await getCurrentChatContext()
    if (currentContext) {
      const storedSession = await findSessionById(currentContext.agentSessionId)
      if (
        currentContext.workspaceContextKey === GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY &&
        isGlobalChatSession(storedSession)
      ) {
        return toGlobalChatContext(currentContext, toManagedChatAgentSession(storedSession))
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
      const generation = beginCurrentContextMutation()
      const chatContext = await findChatContextById(chatContextId.trim())
      if (!chatContext || chatContext.workspaceContextKey !== GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY) {
        throw new Error('Global Chat Context was not found.')
      }
      const storedSession = await findSessionById(chatContext.agentSessionId)
      if (!isGlobalChatSession(storedSession)) {
        throw new Error('Global Chat Context is unavailable.')
      }

      const selectedContext = await runCurrentContextMutation(async () => {
        if (!isLatestCurrentContextMutation(generation)) return undefined
        return setCurrentChatContext(chatContext.id)
      })
      return selectedContext
        ? toGlobalChatContext(selectedContext, toManagedChatAgentSession(storedSession))
        : getPersistedCurrentChatContext()
    },
    async clearChat() {
      const generation = beginCurrentContextMutation()
      const createdSession = await createSession()
      const mutationResult = await runCurrentContextMutation(async () => {
        if (!isLatestCurrentContextMutation(generation)) {
          return { createdContext: undefined, needsCleanup: true }
        }
        let createdContext: StoredGlobalChatContext
        try {
          createdContext = await createCurrentChatContext(createdSession.id)
        } catch (error) {
          return rollbackCreatedSession(createdSession.id, error)
        }
        if (!isLatestCurrentContextMutation(generation)) {
          await deleteSession(createdSession.id)
          return { createdContext: undefined, needsCleanup: false }
        }
        return { createdContext, needsCleanup: false }
      })

      if (mutationResult.createdContext) {
        return toGlobalChatContext(
          mutationResult.createdContext,
          toManagedChatAgentSession(createdSession)
        )
      }

      if (mutationResult.needsCleanup) await deleteSession(createdSession.id)
      return getPersistedCurrentChatContext()
    }
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
  agentSession: ManagedChatAgentSession
): GlobalChatContext {
  return {
    id: chatContext.id,
    workspaceContext: { kind: 'global-chat', key: 'global-chat' },
    agentSession,
    createdAt: chatContext.createdAt.toISOString(),
    updatedAt: chatContext.updatedAt.toISOString()
  }
}
