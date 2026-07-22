import { describe, expect, it, vi } from 'vitest'

import type { StoredSession } from '../../sessions/main/sessions.service'
import { createKnowledgeBaseChatService } from './knowledge-base-chat.service'

const now = new Date('2026-07-20T12:00:00.000Z')

function storedSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: 'knowledge-base-session-1',
    projectId: null,
    managedContext: 'knowledge-base',
    title: 'Knowledge Base Chat',
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

describe('createKnowledgeBaseChatService', () => {
  it('does not create a Session while the Knowledge Base is unavailable', async () => {
    const createSession = vi.fn()
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'unavailable',
        rootPath: '/home/builder/SpaceZero/knowledge-base',
        reason: 'missing'
      }),
      getCurrentSessionId: async () => undefined,
      setCurrentSessionId: async () => undefined,
      clearCurrentSessionId: async () => undefined,
      findSessionById: async () => undefined,
      createSession,
      deleteSession: async () => undefined
    })

    await expect(service.getOrCreateCurrentSession()).rejects.toThrow(
      'Knowledge Base is not available.'
    )
    expect(createSession).not.toHaveBeenCalled()
  })

  it('restores the persisted current managed Workspace Session without creating another', async () => {
    const session = storedSession()
    const createSession = vi.fn()
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentSessionId: async () => session.id,
      setCurrentSessionId: async () => undefined,
      clearCurrentSessionId: async () => undefined,
      findSessionById: async () => session,
      createSession,
      deleteSession: async () => undefined
    })

    await expect(service.getOrCreateCurrentSession()).resolves.toMatchObject({ id: session.id })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('removes a created Session when persisting its current identity fails', async () => {
    const session = storedSession()
    const deleteSession = vi.fn(async () => undefined)
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentSessionId: async () => undefined,
      setCurrentSessionId: async () => {
        throw new Error('Unable to persist current Session')
      },
      clearCurrentSessionId: async () => undefined,
      findSessionById: async () => undefined,
      createSession: async () => session,
      deleteSession
    })

    await expect(service.getOrCreateCurrentSession()).rejects.toThrow(
      'Unable to persist current Session'
    )
    expect(deleteSession).toHaveBeenCalledWith(session.id)
  })

  it('lazily creates and persists the current managed Workspace Session', async () => {
    let currentSessionId: string | undefined
    const session = storedSession()
    const createSession = vi.fn(async () => session)
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentSessionId: async () => currentSessionId,
      setCurrentSessionId: async (sessionId) => {
        currentSessionId = sessionId
      },
      clearCurrentSessionId: async () => {
        currentSessionId = undefined
      },
      findSessionById: async () => undefined,
      createSession,
      deleteSession: async () => undefined
    })

    await expect(service.getOrCreateCurrentSession()).resolves.toEqual({
      id: session.id,
      kind: 'workspace',
      title: 'Knowledge Base Chat',
      status: 'idle',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })
    expect(currentSessionId).toBe(session.id)
    expect(createSession).toHaveBeenCalledTimes(1)
  })
})
