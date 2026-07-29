import type { ProjectSessionChatContext } from '../shared'
import type { StoredProjectSessionChatContext } from './project-session-chat.repository'
import type { StoredSession } from './sessions.service'

export type ProjectSessionChatService = {
  getOrCreateCurrentChatContext: (projectSessionId: string) => Promise<ProjectSessionChatContext>
  clearChat: (projectSessionId: string) => Promise<ProjectSessionChatContext>
}

export function createProjectSessionChatService({
  findSessionById,
  getCurrentChatContext,
  createCurrentChatContext,
  createFreshAgentSession,
  deleteAgentSession
}: {
  findSessionById: (sessionId: string) => Promise<StoredSession | undefined>
  getCurrentChatContext: (
    projectSessionId: string
  ) => Promise<StoredProjectSessionChatContext | undefined>
  createCurrentChatContext: (
    projectSessionId: string,
    agentSessionId: string
  ) => Promise<StoredProjectSessionChatContext>
  createFreshAgentSession: (projectSessionId: string) => Promise<StoredSession>
  deleteAgentSession: (agentSessionId: string) => Promise<void>
}): ProjectSessionChatService {
  async function getProjectSession(projectSessionId: string): Promise<StoredSession> {
    const session = await findSessionById(projectSessionId.trim())
    if (!session?.projectId || session.archivedAt || session.workspaceContextSessionId) {
      throw new Error('Project Session not found')
    }
    return session
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

    async clearChat(projectSessionId) {
      const projectSession = await getProjectSession(projectSessionId)
      const freshAgentSession = await createFreshAgentSession(projectSession.id)
      try {
        const chatContext = await createCurrentChatContext(projectSession.id, freshAgentSession.id)
        return toProjectSessionChatContext(chatContext, projectSession.id)
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
    }
  }
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
