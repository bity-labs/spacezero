import { describe, expect, it, vi } from 'vitest'

import type { StoredGlobalChatContext } from './global-chat.repository'
import { createGlobalChatService } from './global-chat.service'
import type { StoredSession } from './sessions.service'

const now = new Date('2026-07-31T12:00:00.000Z')

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
})
