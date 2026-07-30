import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const timestamp = new Date('2026-07-30T12:00:00.000Z')
  const initialSession = {
    id: 'global-chat-agent-session-initial',
    projectId: null,
    managedContext: 'global-chat' as const,
    title: 'Chat',
    status: 'idle' as const,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const selectedSession = {
    ...initialSession,
    id: 'global-chat-agent-session-selected'
  }
  const freshSession = {
    ...initialSession,
    id: 'global-chat-agent-session-superseded'
  }
  const initialContext = {
    id: 'global-chat-context-initial',
    workspaceContextKey: 'global-chat',
    agentSessionId: initialSession.id,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const selectedContext = {
    ...initialContext,
    id: 'global-chat-context-selected',
    agentSessionId: selectedSession.id
  }
  let resolveFreshSession!: (session: typeof freshSession) => void
  const freshSessionCreation = new Promise<typeof freshSession>((resolve) => {
    resolveFreshSession = resolve
  })
  let currentContext = initialContext
  const repository = {
    findSessionById: vi.fn(async (sessionId: string) =>
      [initialSession, selectedSession, freshSession].find((session) => session.id === sessionId)
    ),
    deleteById: vi.fn(async () => undefined)
  }
  const chatRepository = {
    getCurrentChatContext: vi.fn(async () => currentContext),
    listChatContexts: vi.fn(async () => [initialContext, selectedContext]),
    findChatContextById: vi.fn(async (chatContextId: string) =>
      chatContextId === selectedContext.id ? selectedContext : undefined
    ),
    createCurrentChatContext: vi.fn(),
    setCurrentChatContext: vi.fn(async () => {
      currentContext = selectedContext
      return selectedContext
    }),
    clearCurrentChatContext: vi.fn()
  }
  const cleanupFailure = new Error('utility cleanup failed')
  const utilityHost = {
    deleteSession: vi.fn(async () => {
      throw cleanupFailure
    })
  }

  return {
    selectedContext,
    freshSession,
    freshSessionCreation,
    resolveFreshSession,
    repository,
    chatRepository,
    cleanupFailure,
    utilityHost
  }
})

vi.mock('../../agent-workspace/main/agent-session-handler', () => ({
  createManagedChatAgentSession: vi.fn(() => mocks.freshSessionCreation),
  restoreAgentSessionState: vi.fn()
}))
vi.mock('../../agent-workspace/main/agent-skill-settings.service', () => ({
  getDisabledGlobalSkillPaths: vi.fn(async () => [])
}))
vi.mock('../../agent-workspace/main/agent-skill-paths', () => ({
  resolveAgentSkillPaths: vi.fn(async () => [])
}))
vi.mock('../../agent-workspace/main/agent-utility-process', () => ({
  getAgentUtilityProcessHost: () => mocks.utilityHost
}))
vi.mock('../../knowledge-base/main', () => ({
  getKnowledgeBaseService: () => ({ getStatus: vi.fn() })
}))
vi.mock('./global-chat.repository', () => ({
  GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY: 'global-chat',
  createGlobalChatRepository: () => mocks.chatRepository
}))
vi.mock('./managed-worktree.runtime', () => ({
  getManagedWorktreeService: vi.fn()
}))
vi.mock('./sessions.repository', () => ({
  createSessionsRepository: () => mocks.repository
}))

import { getGlobalChatService } from './global-chat.runtime'

describe('Global Chat runtime cleanup', () => {
  it('propagates rejected utility cleanup and retains superseded Session metadata', async () => {
    const service = getGlobalChatService()

    const clearing = service.clearChat()
    await service.resumeChatContext(mocks.selectedContext.id)
    mocks.resolveFreshSession(mocks.freshSession)

    await expect(clearing).rejects.toBe(mocks.cleanupFailure)
    expect(mocks.utilityHost.deleteSession).toHaveBeenCalledWith({
      sessionId: mocks.freshSession.id
    })
    expect(mocks.repository.deleteById).not.toHaveBeenCalled()
    await expect(mocks.repository.findSessionById(mocks.freshSession.id)).resolves.toBe(
      mocks.freshSession
    )
  })
})
