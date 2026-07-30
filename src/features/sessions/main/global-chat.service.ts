import type { GlobalChatContext, WorkspaceSession } from '../shared'
import { toWorkspaceSession, type StoredSession } from './sessions.service'
import {
  GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY,
  type StoredGlobalChatContext
} from './global-chat.repository'

export type GlobalChatService = {
  getOrCreateCurrentChatContext: () => Promise<GlobalChatContext>
}

export function createGlobalChatService({
  getCurrentChatContext,
  createCurrentChatContext,
  clearCurrentChatContext,
  findSessionById,
  createSession,
  deleteSession
}: {
  getCurrentChatContext: () => Promise<StoredGlobalChatContext | undefined>
  createCurrentChatContext: (agentSessionId: string) => Promise<StoredGlobalChatContext>
  clearCurrentChatContext: () => Promise<void>
  findSessionById: (sessionId: string) => Promise<StoredSession | undefined>
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
