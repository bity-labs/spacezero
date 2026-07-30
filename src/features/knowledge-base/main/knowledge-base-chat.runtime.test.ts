import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const timestamp = new Date('2026-07-30T12:00:00.000Z')
  const initialSession = {
    id: 'knowledge-base-agent-session-initial',
    projectId: null,
    managedContext: 'knowledge-base' as const,
    title: 'Knowledge Base Chat',
    status: 'idle' as const,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const selectedSession = {
    ...initialSession,
    id: 'knowledge-base-agent-session-selected'
  }
  const freshSession = {
    ...initialSession,
    id: 'knowledge-base-agent-session-superseded'
  }
  const initialContext = {
    id: 'knowledge-base-context-initial',
    workspaceContextKey: 'knowledge-base',
    agentSessionId: initialSession.id,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const selectedContext = {
    ...initialContext,
    id: 'knowledge-base-context-selected',
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
    listRecoverableAgentSessions: vi.fn(async () => []),
    listAgentSessionsPendingCleanup: vi.fn(async () => []),
    markAgentSessionPendingCleanup: vi.fn(async () => undefined),
    createCurrentChatContext: vi.fn(),
    publishPreparedCurrentChatContext: vi.fn(),
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
  prepareManagedChatAgentSession: vi.fn(async () => ({
    session: mocks.freshSession,
    activate: () => mocks.freshSessionCreation
  })),
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
vi.mock('../../sessions/main/managed-worktree.runtime', () => ({
  getManagedWorktreeService: vi.fn()
}))
vi.mock('../../sessions/main/sessions.repository', () => ({
  createSessionsRepository: () => mocks.repository
}))
vi.mock('./knowledge-base-chat.repository', () => ({
  KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY: 'knowledge-base',
  createKnowledgeBaseChatRepository: () => mocks.chatRepository
}))
vi.mock('./index', () => ({
  getKnowledgeBaseService: () => ({
    getStatus: vi.fn(async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    }))
  })
}))

import {
  getKnowledgeBaseChatService,
  recoverPreparedKnowledgeBaseSessions
} from './knowledge-base-chat.runtime'

describe('prepared Knowledge Base Chat recovery', () => {
  it('removes crash-left preparation metadata only after utility cleanup succeeds', async () => {
    const sessions = new Set(['prepared-before-context', 'prepared-with-transient-current'])
    const chatContexts = new Set(['prepared-with-transient-current'])
    let currentSessionId: string | undefined = 'prepared-with-transient-current'
    const deleteUtilitySession = vi.fn(async () => undefined)

    await recoverPreparedKnowledgeBaseSessions({
      listPreparingSessions: async () => [...sessions].map((id) => ({ id })),
      deleteUtilitySession,
      deleteSessionMetadata: async (sessionId) => {
        sessions.delete(sessionId)
        chatContexts.delete(sessionId)
        if (currentSessionId === sessionId) currentSessionId = undefined
      }
    })

    expect(deleteUtilitySession.mock.calls).toEqual([
      ['prepared-before-context'],
      ['prepared-with-transient-current']
    ])
    expect([...sessions]).toEqual([])
    expect([...chatContexts]).toEqual([])
    expect(currentSessionId).toBeUndefined()
  })

  it('retains crash-left ownership metadata when utility cleanup fails', async () => {
    const preparedSession = { id: 'possibly-live-prepared-session' }
    const cleanupFailure = new Error('utility cleanup failed')
    const deleteSessionMetadata = vi.fn(async () => undefined)

    await expect(
      recoverPreparedKnowledgeBaseSessions({
        listPreparingSessions: async () => [preparedSession],
        deleteUtilitySession: async () => {
          throw cleanupFailure
        },
        deleteSessionMetadata
      })
    ).rejects.toBe(cleanupFailure)
    expect(deleteSessionMetadata).not.toHaveBeenCalled()
  })
})

describe('Knowledge Base Chat runtime cleanup', () => {
  it('propagates rejected utility cleanup and retains superseded Session metadata', async () => {
    const service = getKnowledgeBaseChatService()

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
