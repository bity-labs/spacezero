import { describe, expect, it, vi } from 'vitest'

import type { StoredSession } from '../../sessions/main/sessions.service'
import type { StoredChatContext } from './knowledge-base-chat.repository'
import { createKnowledgeBaseChatService as createService } from './knowledge-base-chat.service'

const now = new Date('2026-07-20T12:00:00.000Z')

type ChatServiceDependencies = Parameters<typeof createService>[0]
type LegacyChatServiceDependencies = Pick<
  ChatServiceDependencies,
  | 'getStatus'
  | 'getCurrentChatContext'
  | 'createCurrentChatContext'
  | 'clearCurrentChatContext'
  | 'findSessionById'
  | 'createSession'
  | 'deleteSession'
> &
  Partial<ChatServiceDependencies>

function createKnowledgeBaseChatService(dependencies: LegacyChatServiceDependencies) {
  return createService({
    listChatContexts: async () => [],
    findChatContextById: async () => undefined,
    setCurrentChatContext: async () => {
      throw new Error('Unexpected Chat Context selection')
    },
    getSessionState: async () => {
      throw new Error('Unexpected agent Session state request')
    },
    ...dependencies
  })
}

function storedSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: 'knowledge-base-agent-session-1',
    projectId: null,
    managedContext: 'knowledge-base',
    title: 'Knowledge Base Chat',
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

function storedChatContext(overrides: Partial<StoredChatContext> = {}): StoredChatContext {
  return {
    id: 'knowledge-base-chat-context-1',
    workspaceContextKey: 'knowledge-base',
    agentSessionId: 'knowledge-base-agent-session-1',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

describe('createKnowledgeBaseChatService', () => {
  it('does not create a Chat Context while the Knowledge Base is unavailable', async () => {
    const createSession = vi.fn()
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'unavailable',
        rootPath: '/home/builder/SpaceZero/knowledge-base',
        reason: 'missing'
      }),
      getCurrentChatContext: async () => undefined,
      createCurrentChatContext: vi.fn(),
      clearCurrentChatContext: vi.fn(),
      findSessionById: async () => undefined,
      createSession,
      deleteSession: async () => undefined
    })

    await expect(service.getOrCreateCurrentChatContext()).rejects.toThrow(
      'Knowledge Base is not available.'
    )
    expect(createSession).not.toHaveBeenCalled()
  })

  it('restores the persisted current Chat Context without creating another', async () => {
    const session = storedSession()
    const chatContext = storedChatContext()
    const createSession = vi.fn()
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => chatContext,
      createCurrentChatContext: vi.fn(),
      clearCurrentChatContext: vi.fn(),
      findSessionById: async () => session,
      createSession,
      deleteSession: async () => undefined
    })

    await expect(service.getOrCreateCurrentChatContext()).resolves.toMatchObject({
      id: chatContext.id,
      workspaceContext: { kind: 'knowledge-base', key: 'knowledge-base' },
      agentSession: { id: session.id }
    })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('lists older Knowledge Base Chat Contexts with their persisted transcript metadata', async () => {
    const currentContext = storedChatContext({
      id: 'knowledge-base-chat-context-current',
      agentSessionId: 'knowledge-base-agent-session-current'
    })
    const olderContext = storedChatContext({
      id: 'knowledge-base-chat-context-older',
      agentSessionId: 'knowledge-base-agent-session-older',
      createdAt: new Date('2026-07-19T08:30:00.000Z')
    })
    const foreignContext = storedChatContext({
      id: 'project-chat-context-foreign',
      workspaceContextKey: 'project-session-123',
      agentSessionId: 'project-agent-session-foreign'
    })
    const olderSession = storedSession({ id: olderContext.agentSessionId })
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => currentContext,
      listChatContexts: async () => [currentContext, olderContext, foreignContext],
      createCurrentChatContext: vi.fn(),
      setCurrentChatContext: vi.fn(),
      clearCurrentChatContext: vi.fn(),
      findSessionById: async (sessionId) =>
        sessionId === olderSession.id ? olderSession : storedSession({ id: sessionId }),
      getSessionState: async ({ sessionId }) => ({
        sessionId,
        kind: 'workspace',
        projectId: null,
        cwd: '/home/builder/SpaceZero/knowledge-base',
        status: 'idle',
        live: true,
        transcriptPath: `/tmp/${sessionId}.jsonl`,
        modelProvider: undefined,
        modelId: undefined,
        transcriptSnapshot: [
          {
            role: 'user',
            timestamp: 100,
            content: '  Explain the architecture\nwith implementation details.  '
          }
        ]
      }),
      createSession: vi.fn(),
      deleteSession: vi.fn()
    })

    await expect(service.listChatHistory()).resolves.toEqual([
      {
        id: olderContext.id,
        initialPrompt: 'Explain the architecture with implementation details.',
        createdAt: '2026-07-19T08:30:00.000Z'
      }
    ])
  })

  it('makes a selected retained Chat Context current without replacing its agent Session', async () => {
    const selectedContext = storedChatContext({
      id: 'knowledge-base-chat-context-selected',
      agentSessionId: 'knowledge-base-agent-session-selected'
    })
    const selectedSession = storedSession({ id: selectedContext.agentSessionId })
    const setCurrentChatContext = vi.fn(async () => selectedContext)
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => storedChatContext(),
      listChatContexts: async () => [selectedContext],
      findChatContextById: async (chatContextId) =>
        chatContextId === selectedContext.id ? selectedContext : undefined,
      createCurrentChatContext: vi.fn(),
      setCurrentChatContext,
      clearCurrentChatContext: vi.fn(),
      findSessionById: async (sessionId) =>
        sessionId === selectedSession.id ? selectedSession : undefined,
      getSessionState: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn()
    })

    await expect(service.resumeChatContext(selectedContext.id)).resolves.toMatchObject({
      id: selectedContext.id,
      agentSession: { id: selectedSession.id }
    })
    expect(setCurrentChatContext).toHaveBeenCalledWith(selectedContext.id)
  })

  it('rejects a Chat Context owned by another workspace scope', async () => {
    const setCurrentChatContext = vi.fn()
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => storedChatContext(),
      findChatContextById: async () =>
        storedChatContext({ workspaceContextKey: 'project-session-123' }),
      createCurrentChatContext: vi.fn(),
      setCurrentChatContext,
      clearCurrentChatContext: vi.fn(),
      findSessionById: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn()
    })

    await expect(service.resumeChatContext('foreign-chat-context')).rejects.toThrow(
      'Knowledge Base Chat Context was not found.'
    )
    expect(setCurrentChatContext).not.toHaveBeenCalled()
  })

  it('clears an invalid current Chat Context before creating a replacement', async () => {
    const replacementSession = storedSession({ id: 'knowledge-base-agent-session-2' })
    const replacementContext = storedChatContext({
      id: 'knowledge-base-chat-context-2',
      agentSessionId: replacementSession.id
    })
    const clearCurrentChatContext = vi.fn(async () => undefined)
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => storedChatContext(),
      createCurrentChatContext: async () => replacementContext,
      clearCurrentChatContext,
      findSessionById: async () => undefined,
      createSession: async () => replacementSession,
      deleteSession: async () => undefined
    })

    await expect(service.getOrCreateCurrentChatContext()).resolves.toMatchObject({
      id: replacementContext.id,
      agentSession: { id: replacementSession.id }
    })
    expect(clearCurrentChatContext).toHaveBeenCalledTimes(1)
  })

  it('removes a created agent Session when persisting its Chat Context fails', async () => {
    const session = storedSession()
    const deleteSession = vi.fn(async () => undefined)
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => undefined,
      createCurrentChatContext: async () => {
        throw new Error('Unable to persist current Chat Context')
      },
      clearCurrentChatContext: async () => undefined,
      findSessionById: async () => undefined,
      createSession: async () => session,
      deleteSession
    })

    await expect(service.getOrCreateCurrentChatContext()).rejects.toThrow(
      'Unable to persist current Chat Context'
    )
    expect(deleteSession).toHaveBeenCalledWith(session.id)
  })

  it('clears to a fresh current Chat Context while retaining previous history', async () => {
    const previousSession = storedSession()
    const replacementSession = storedSession({ id: 'knowledge-base-agent-session-2' })
    const previousContext = storedChatContext()
    const replacementContext = storedChatContext({
      id: 'knowledge-base-chat-context-2',
      agentSessionId: replacementSession.id
    })
    const contexts = [previousContext]
    let currentContext = previousContext
    const deleteSession = vi.fn(async () => undefined)
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => currentContext,
      createCurrentChatContext: async () => {
        contexts.push(replacementContext)
        currentContext = replacementContext
        return replacementContext
      },
      clearCurrentChatContext: async () => undefined,
      findSessionById: async (sessionId) =>
        sessionId === previousSession.id ? previousSession : replacementSession,
      createSession: async () => replacementSession,
      deleteSession
    })

    await expect(service.clearChat()).resolves.toMatchObject({
      id: replacementContext.id,
      agentSession: { id: replacementSession.id }
    })
    expect(currentContext).toBe(replacementContext)
    expect(contexts).toEqual([previousContext, replacementContext])
    expect(deleteSession).not.toHaveBeenCalled()
  })

  it('keeps the previous Chat Context current when replacement creation fails', async () => {
    const previousContext = storedChatContext()
    const createCurrentChatContext = vi.fn()
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => previousContext,
      createCurrentChatContext,
      clearCurrentChatContext: async () => undefined,
      findSessionById: async () => undefined,
      createSession: async () => {
        throw new Error('Agent runtime unavailable')
      },
      deleteSession: async () => undefined
    })

    await expect(service.clearChat()).rejects.toThrow('Agent runtime unavailable')
    expect(createCurrentChatContext).not.toHaveBeenCalled()
  })

  it('lazily creates and persists the first current Chat Context', async () => {
    const session = storedSession()
    const chatContext = storedChatContext()
    const createSession = vi.fn(async () => session)
    const createCurrentChatContext = vi.fn(async () => chatContext)
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => undefined,
      createCurrentChatContext,
      clearCurrentChatContext: async () => undefined,
      findSessionById: async () => undefined,
      createSession,
      deleteSession: async () => undefined
    })

    await expect(service.getOrCreateCurrentChatContext()).resolves.toEqual({
      id: chatContext.id,
      workspaceContext: { kind: 'knowledge-base', key: 'knowledge-base' },
      agentSession: {
        id: session.id,
        kind: 'workspace',
        title: 'Knowledge Base Chat',
        status: 'idle',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })
    expect(createCurrentChatContext).toHaveBeenCalledWith(session.id)
    expect(createSession).toHaveBeenCalledTimes(1)
  })
})
