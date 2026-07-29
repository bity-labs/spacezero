import { describe, expect, it, vi } from 'vitest'

import type { StoredSession } from '../../sessions/main/sessions.service'
import type { StoredChatContext } from './knowledge-base-chat.repository'
import { createKnowledgeBaseChatService } from './knowledge-base-chat.service'

const now = new Date('2026-07-20T12:00:00.000Z')

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
