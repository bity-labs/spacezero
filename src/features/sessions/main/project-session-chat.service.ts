import type { AgentSessionState } from '../../../shared/agent-protocol'
import type {
  AgentUserContent,
  AgentUserMessage
} from '../../../shared/agent-session-projection.model'
import type { ProjectSessionChatContext, ProjectSessionChatHistoryItem } from '../shared'
import type { StoredProjectSessionChatContext } from './project-session-chat.repository'
import type { StoredSession } from './sessions.service'

export type ProjectSessionChatService = {
  getOrCreateCurrentChatContext: (projectSessionId: string) => Promise<ProjectSessionChatContext>
  listChatHistory: (projectSessionId: string) => Promise<ProjectSessionChatHistoryItem[]>
  resumeChatContext: (
    projectSessionId: string,
    chatContextId: string
  ) => Promise<ProjectSessionChatContext>
  clearChat: (projectSessionId: string) => Promise<ProjectSessionChatContext>
}

export function createProjectSessionChatService({
  findSessionById,
  getCurrentChatContext,
  listChatContexts,
  findChatContextById,
  createCurrentChatContext,
  setCurrentChatContext,
  createFreshAgentSession,
  deleteAgentSession,
  getSessionState
}: {
  findSessionById: (sessionId: string) => Promise<StoredSession | undefined>
  getCurrentChatContext: (
    projectSessionId: string
  ) => Promise<StoredProjectSessionChatContext | undefined>
  listChatContexts: (projectSessionId: string) => Promise<StoredProjectSessionChatContext[]>
  findChatContextById: (
    projectSessionId: string,
    chatContextId: string
  ) => Promise<StoredProjectSessionChatContext | undefined>
  createCurrentChatContext: (
    projectSessionId: string,
    agentSessionId: string
  ) => Promise<StoredProjectSessionChatContext>
  setCurrentChatContext: (
    projectSessionId: string,
    chatContextId: string
  ) => Promise<StoredProjectSessionChatContext>
  createFreshAgentSession: (projectSessionId: string) => Promise<StoredSession>
  deleteAgentSession: (agentSessionId: string) => Promise<void>
  getSessionState: (request: { sessionId: string }) => Promise<AgentSessionState>
}): ProjectSessionChatService {
  let nextMutationGeneration = 0
  const latestMutationGeneration = new Map<string, number>()
  const mutationQueues = new Map<string, Promise<void>>()

  async function getProjectSession(projectSessionId: string): Promise<StoredSession> {
    const session = await findSessionById(projectSessionId.trim())
    if (!session?.projectId || session.archivedAt || session.workspaceContextSessionId) {
      throw new Error('Project Session not found')
    }
    return session
  }

  function beginCurrentContextMutation(projectSessionId: string): number {
    const generation = ++nextMutationGeneration
    latestMutationGeneration.set(projectSessionId, generation)
    return generation
  }

  function isLatestCurrentContextMutation(projectSessionId: string, generation: number): boolean {
    return latestMutationGeneration.get(projectSessionId) === generation
  }

  async function runCurrentContextMutation<T>(
    projectSessionId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = mutationQueues.get(projectSessionId) ?? Promise.resolve()
    const result = previous.then(operation, operation)
    const queued = result.then(
      () => undefined,
      () => undefined
    )
    mutationQueues.set(projectSessionId, queued)
    try {
      return await result
    } finally {
      if (mutationQueues.get(projectSessionId) === queued) mutationQueues.delete(projectSessionId)
    }
  }

  async function getPersistedCurrentChatContext(
    projectSessionId: string
  ): Promise<ProjectSessionChatContext> {
    const current = await getCurrentChatContext(projectSessionId)
    if (!current) throw new Error('Project Session Chat Context is unavailable')
    return toProjectSessionChatContext(current, projectSessionId)
  }

  return {
    async getOrCreateCurrentChatContext(projectSessionId) {
      const projectSession = await getProjectSession(projectSessionId)
      const current = await getCurrentChatContext(projectSession.id)
      if (current) {
        const agentSession = await findSessionById(current.agentSessionId)
        const belongsToProjectSession =
          agentSession?.id === projectSession.id ||
          agentSession?.workspaceContextSessionId === projectSession.id
        if (
          !agentSession ||
          agentSession.archivedAt ||
          agentSession.projectId !== projectSession.projectId ||
          !belongsToProjectSession
        ) {
          throw new Error('Project Session Chat Context is unavailable')
        }
        return toProjectSessionChatContext(current, projectSession.id)
      }

      return toProjectSessionChatContext(
        await createCurrentChatContext(projectSession.id, projectSession.id),
        projectSession.id
      )
    },

    async listChatHistory(projectSessionId) {
      const projectSession = await getProjectSession(projectSessionId)
      const currentChatContext = await getCurrentChatContext(projectSession.id)
      const chatContexts = await listChatContexts(projectSession.id)
      const history = await Promise.all(
        chatContexts
          .filter(
            (chatContext) =>
              chatContext.workspaceContextKey === projectSession.id &&
              chatContext.id !== currentChatContext?.id
          )
          .map(async (chatContext): Promise<ProjectSessionChatHistoryItem | undefined> => {
            const agentSession = await findSessionById(chatContext.agentSessionId)
            if (!isProjectChatAgentSession(agentSession, projectSession)) return undefined

            const initialPrompt = getInitialPrompt(
              await getSessionState({ sessionId: agentSession.id })
            )
            if (!initialPrompt) return undefined

            return {
              id: chatContext.id,
              initialPrompt,
              createdAt: chatContext.createdAt.toISOString()
            }
          })
      )
      return history.filter((item): item is ProjectSessionChatHistoryItem => Boolean(item))
    },

    async resumeChatContext(projectSessionId, chatContextId) {
      const projectSession = await getProjectSession(projectSessionId)
      const chatContext = await findChatContextById(projectSession.id, chatContextId.trim())
      if (!chatContext || chatContext.workspaceContextKey !== projectSession.id) {
        throw new Error('Project Session Chat Context was not found')
      }

      const agentSession = await findSessionById(chatContext.agentSessionId)
      if (!isProjectChatAgentSession(agentSession, projectSession)) {
        throw new Error('Project Session Chat Context is unavailable')
      }

      const generation = beginCurrentContextMutation(projectSession.id)
      const resumed = await runCurrentContextMutation(projectSession.id, async () => {
        if (!isLatestCurrentContextMutation(projectSession.id, generation)) return undefined
        return setCurrentChatContext(projectSession.id, chatContext.id)
      })
      return resumed
        ? toProjectSessionChatContext(resumed, projectSession.id)
        : getPersistedCurrentChatContext(projectSession.id)
    },

    async clearChat(projectSessionId) {
      const projectSession = await getProjectSession(projectSessionId)
      const generation = beginCurrentContextMutation(projectSession.id)
      const freshAgentSession = await createFreshAgentSession(projectSession.id)
      const chatContext = await runCurrentContextMutation(projectSession.id, async () => {
        if (!isLatestCurrentContextMutation(projectSession.id, generation)) return undefined
        try {
          return await createCurrentChatContext(projectSession.id, freshAgentSession.id)
        } catch (error) {
          try {
            await deleteAgentSession(freshAgentSession.id)
          } catch (rollbackFailure) {
            const rollbackError = new Error('projectSessionChat.creationRollbackFailed', {
              cause: error
            })
            Object.defineProperty(rollbackError, 'rollbackFailures', {
              value: [rollbackFailure],
              enumerable: false
            })
            throw rollbackError
          }
          throw error
        }
      })

      if (chatContext) return toProjectSessionChatContext(chatContext, projectSession.id)

      await deleteAgentSession(freshAgentSession.id)
      return getPersistedCurrentChatContext(projectSession.id)
    }
  }
}

function isProjectChatAgentSession(
  agentSession: StoredSession | undefined,
  projectSession: StoredSession
): agentSession is StoredSession {
  return Boolean(
    agentSession &&
    !agentSession.archivedAt &&
    agentSession.projectId === projectSession.projectId &&
    (agentSession.id === projectSession.id ||
      agentSession.workspaceContextSessionId === projectSession.id)
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

function toProjectSessionChatContext(
  context: StoredProjectSessionChatContext,
  projectSessionId: string
): ProjectSessionChatContext {
  return {
    id: context.id,
    workspaceContext: { kind: 'project-session', projectSessionId },
    agentSessionId: context.agentSessionId,
    createdAt: context.createdAt.toISOString(),
    updatedAt: context.updatedAt.toISOString()
  }
}
