import { describe, expect, it, vi } from 'vitest'

import type { AgentSessionState } from '../../../shared/agent-protocol'
import type { StoredGlobalChatContext } from './global-chat.repository'
import { createGlobalChatService as createService } from './global-chat.service'
import type { StoredSession } from './sessions.service'

const now = new Date('2026-07-31T12:00:00.000Z')

type ServiceDependencies = Parameters<typeof createService>[0]
type HistoryDependencies = Pick<
  ServiceDependencies,
  'listChatContexts' | 'findChatContextById' | 'setCurrentChatContext' | 'getSessionState'
>

function createGlobalChatService(
  dependencies: Omit<ServiceDependencies, keyof HistoryDependencies> & Partial<HistoryDependencies>
) {
  return createService({
    listChatContexts: async () => [],
    findChatContextById: async () => undefined,
    setCurrentChatContext: async () => {
      throw new Error('Global Chat Context was not found.')
    },
    getSessionState: async () => {
      throw new Error('Global Chat Session state is unavailable.')
    },
    ...dependencies
  })
}

function storedSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: 'global-chat-agent-session-1',
    projectId: null,
    managedContext: 'global-chat',
    title: 'Chat',
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

function storedChatContext(
  overrides: Partial<StoredGlobalChatContext> = {}
): StoredGlobalChatContext {
  return {
    id: 'global-chat-context-1',
    workspaceContextKey: 'global-chat',
    agentSessionId: 'global-chat-agent-session-1',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

describe('Global Chat Context', () => {
  it('restores the persisted current Chat Context without creating another', async () => {
    const session = storedSession()
    const context = storedChatContext()
    const createSession = vi.fn()
    const service = createGlobalChatService({
      getCurrentChatContext: async () => context,
      createCurrentChatContext: vi.fn(),
      clearCurrentChatContext: vi.fn(),
      findSessionById: async () => session,
      createSession,
      deleteSession: vi.fn()
    })

    await expect(service.getOrCreateCurrentChatContext()).resolves.toEqual({
      id: context.id,
      workspaceContext: { kind: 'global-chat', key: 'global-chat' },
      agentSession: {
        id: session.id,
        kind: 'workspace',
        title: 'Chat',
        status: 'idle',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('replaces an invalid current pointer with a system-managed Global Chat Session', async () => {
    const replacementSession = storedSession({ id: 'global-chat-agent-session-2' })
    const replacementContext = storedChatContext({
      id: 'global-chat-context-2',
      agentSessionId: replacementSession.id
    })
    const clearCurrentChatContext = vi.fn(async () => undefined)
    const service = createGlobalChatService({
      getCurrentChatContext: async () => storedChatContext(),
      createCurrentChatContext: async () => replacementContext,
      clearCurrentChatContext,
      findSessionById: async () => undefined,
      createSession: async () => replacementSession,
      deleteSession: vi.fn()
    })

    await expect(service.getOrCreateCurrentChatContext()).resolves.toMatchObject({
      id: replacementContext.id,
      agentSession: { id: replacementSession.id }
    })
    expect(clearCurrentChatContext).toHaveBeenCalledOnce()
  })

  it('rolls back a newly created agent Session when current-context persistence fails', async () => {
    const session = storedSession()
    const deleteSession = vi.fn(async () => undefined)
    const service = createGlobalChatService({
      getCurrentChatContext: async () => undefined,
      createCurrentChatContext: async () => {
        throw new Error('Unable to persist Global Chat Context')
      },
      clearCurrentChatContext: vi.fn(),
      findSessionById: vi.fn(),
      createSession: async () => session,
      deleteSession
    })

    await expect(service.getOrCreateCurrentChatContext()).rejects.toThrow(
      'Unable to persist Global Chat Context'
    )
    expect(deleteSession).toHaveBeenCalledWith(session.id)
  })

  it('coalesces concurrent opens into one current Chat Context creation', async () => {
    const session = storedSession()
    const context = storedChatContext()
    const createSession = vi.fn(async () => session)
    const service = createGlobalChatService({
      getCurrentChatContext: async () => undefined,
      createCurrentChatContext: async () => context,
      clearCurrentChatContext: vi.fn(),
      findSessionById: vi.fn(),
      createSession,
      deleteSession: vi.fn()
    })

    await expect(
      Promise.all([
        service.getOrCreateCurrentChatContext(),
        service.getOrCreateCurrentChatContext()
      ])
    ).resolves.toHaveLength(2)
    expect(createSession).toHaveBeenCalledOnce()
  })

  it('lists only retained Global Chat Contexts with initial-prompt metadata', async () => {
    const currentContext = storedChatContext()
    const retainedContext = storedChatContext({
      id: 'global-chat-context-retained',
      agentSessionId: 'global-chat-agent-session-retained',
      createdAt: new Date('2026-07-30T10:15:00.000Z')
    })
    const knowledgeBaseContext = storedChatContext({
      id: 'knowledge-base-context',
      workspaceContextKey: 'knowledge-base',
      agentSessionId: 'knowledge-base-session'
    })
    const service = createGlobalChatService({
      getCurrentChatContext: async () => currentContext,
      listChatContexts: async () => [currentContext, retainedContext, knowledgeBaseContext],
      findChatContextById: vi.fn(),
      createCurrentChatContext: vi.fn(),
      setCurrentChatContext: vi.fn(),
      clearCurrentChatContext: vi.fn(),
      findSessionById: async (sessionId) =>
        sessionId === retainedContext.agentSessionId
          ? storedSession({ id: retainedContext.agentSessionId })
          : storedSession({ id: sessionId, managedContext: 'knowledge-base' }),
      getSessionState: async ({ sessionId }): Promise<AgentSessionState> => ({
        sessionId,
        kind: 'workspace',
        projectId: null,
        cwd: '/tmp',
        status: 'idle',
        live: true,
        transcriptPath: `/tmp/${sessionId}.jsonl`,
        modelProvider: undefined,
        modelId: undefined,
        transcriptSnapshot: [
          { role: 'user', timestamp: 1, content: '  Explain   the global workspace\nstate  ' }
        ]
      }),
      createSession: vi.fn(),
      deleteSession: vi.fn()
    })

    await expect(service.listChatHistory()).resolves.toEqual([
      {
        id: retainedContext.id,
        initialPrompt: 'Explain the global workspace state',
        createdAt: retainedContext.createdAt.toISOString()
      }
    ])
  })

  it('resumes only a persisted Global Chat Context and makes it current', async () => {
    const selectedContext = storedChatContext({
      id: 'global-chat-context-selected',
      agentSessionId: 'global-chat-agent-session-selected'
    })
    const selectedSession = storedSession({ id: selectedContext.agentSessionId })
    const setCurrentChatContext = vi.fn(async () => selectedContext)
    const service = createGlobalChatService({
      getCurrentChatContext: vi.fn(),
      findChatContextById: async (chatContextId) =>
        chatContextId === selectedContext.id ? selectedContext : undefined,
      setCurrentChatContext,
      createCurrentChatContext: vi.fn(),
      clearCurrentChatContext: vi.fn(),
      findSessionById: async () => selectedSession,
      createSession: vi.fn(),
      deleteSession: vi.fn()
    })

    await expect(service.resumeChatContext(` ${selectedContext.id} `)).resolves.toMatchObject({
      id: selectedContext.id,
      agentSession: { id: selectedSession.id }
    })
    expect(setCurrentChatContext).toHaveBeenCalledWith(selectedContext.id)
  })

  it('rejects a Chat Context from another workspace without changing the current Global Chat', async () => {
    const setCurrentChatContext = vi.fn()
    const service = createGlobalChatService({
      getCurrentChatContext: vi.fn(),
      findChatContextById: async () => storedChatContext({ workspaceContextKey: 'knowledge-base' }),
      setCurrentChatContext,
      createCurrentChatContext: vi.fn(),
      clearCurrentChatContext: vi.fn(),
      findSessionById: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn()
    })

    await expect(service.resumeChatContext('knowledge-base-context')).rejects.toThrow(
      'Global Chat Context was not found'
    )
    expect(setCurrentChatContext).not.toHaveBeenCalled()
  })

  it('clears into a fresh current Global Chat Context while retaining the previous context', async () => {
    const previousContext = storedChatContext()
    const freshSession = storedSession({ id: 'global-chat-agent-session-2' })
    const freshContext = storedChatContext({
      id: 'global-chat-context-2',
      agentSessionId: freshSession.id
    })
    const retainedContexts = [previousContext]
    const createCurrentChatContext = vi.fn(async () => {
      retainedContexts.unshift(freshContext)
      return freshContext
    })
    const service = createGlobalChatService({
      getCurrentChatContext: async () => previousContext,
      createCurrentChatContext,
      clearCurrentChatContext: vi.fn(),
      findSessionById: async () => freshSession,
      createSession: async () => freshSession,
      deleteSession: vi.fn()
    })

    await expect(service.clearChat()).resolves.toMatchObject({
      id: freshContext.id,
      agentSession: { id: freshSession.id }
    })
    expect(createCurrentChatContext).toHaveBeenCalledWith(freshSession.id)
    expect(retainedContexts).toContain(previousContext)
  })
})
