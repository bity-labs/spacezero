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

  it('keeps the latest resume persisted when resume lookups complete in reverse order', async () => {
    const initialContext = storedChatContext()
    const firstContext = storedChatContext({
      id: 'knowledge-base-chat-context-first',
      agentSessionId: 'knowledge-base-agent-session-first'
    })
    const secondContext = storedChatContext({
      id: 'knowledge-base-chat-context-second',
      agentSessionId: 'knowledge-base-agent-session-second'
    })
    const firstLookup = deferred<StoredChatContext | undefined>()
    let currentContext = initialContext
    const setCurrentChatContext = vi.fn(async (chatContextId: string) => {
      currentContext = chatContextId === firstContext.id ? firstContext : secondContext
      return currentContext
    })
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => currentContext,
      findChatContextById: async (chatContextId) =>
        chatContextId === firstContext.id ? firstLookup.promise : secondContext,
      createCurrentChatContext: vi.fn(),
      setCurrentChatContext,
      clearCurrentChatContext: vi.fn(),
      findSessionById: async (sessionId) => storedSession({ id: sessionId }),
      createSession: vi.fn(),
      deleteSession: vi.fn()
    })

    const firstResume = service.resumeChatContext(firstContext.id)
    await expect(service.resumeChatContext(secondContext.id)).resolves.toMatchObject({
      id: secondContext.id,
      agentSession: { id: secondContext.agentSessionId }
    })
    firstLookup.resolve(firstContext)

    await expect(firstResume).resolves.toMatchObject({ id: secondContext.id })
    expect(currentContext).toBe(secondContext)
    expect(setCurrentChatContext).toHaveBeenCalledOnce()
    expect(setCurrentChatContext).toHaveBeenCalledWith(secondContext.id)
  })

  it('keeps a later resume current and deletes a superseded fresh Session when clear finishes late', async () => {
    const initialContext = storedChatContext()
    const selectedContext = storedChatContext({
      id: 'knowledge-base-chat-context-selected',
      agentSessionId: 'knowledge-base-agent-session-selected'
    })
    const supersededSession = storedSession({ id: 'knowledge-base-agent-session-superseded' })
    const freshSession = deferred<StoredSession>()
    let currentContext = initialContext
    const deleteSession = vi.fn(async () => undefined)
    const createCurrentChatContext = vi.fn(async (sessionId: string) => {
      currentContext = storedChatContext({
        id: `knowledge-base-chat-context-${sessionId}`,
        agentSessionId: sessionId
      })
      return currentContext
    })
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => currentContext,
      findChatContextById: async () => selectedContext,
      setCurrentChatContext: async () => {
        currentContext = selectedContext
        return currentContext
      },
      createCurrentChatContext,
      clearCurrentChatContext: vi.fn(),
      findSessionById: async (sessionId) => storedSession({ id: sessionId }),
      createSession: () => freshSession.promise,
      deleteSession
    })

    const clearing = service.clearChat()
    await expect(service.resumeChatContext(selectedContext.id)).resolves.toMatchObject({
      id: selectedContext.id
    })
    freshSession.resolve(supersededSession)

    await expect(clearing).resolves.toMatchObject({ id: selectedContext.id })
    expect(currentContext).toBe(selectedContext)
    expect(createCurrentChatContext).not.toHaveBeenCalled()
    expect(deleteSession).toHaveBeenCalledWith(supersededSession.id)
  })

  it('deletes a fresh Session superseded while its Chat Context write is in flight', async () => {
    const initialContext = storedChatContext()
    const selectedContext = storedChatContext({
      id: 'knowledge-base-chat-context-selected',
      agentSessionId: 'knowledge-base-agent-session-selected'
    })
    const freshSession = storedSession({ id: 'knowledge-base-agent-session-superseded' })
    const freshContext = storedChatContext({
      id: 'knowledge-base-chat-context-superseded',
      agentSessionId: freshSession.id
    })
    const contextWrite = deferred<StoredChatContext>()
    let currentContext = initialContext
    const deleteSession = vi.fn(async () => undefined)
    const createCurrentChatContext = vi.fn(async () => {
      const created = await contextWrite.promise
      currentContext = created
      return created
    })
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => currentContext,
      findChatContextById: async () => selectedContext,
      setCurrentChatContext: async () => {
        currentContext = selectedContext
        return selectedContext
      },
      createCurrentChatContext,
      clearCurrentChatContext: vi.fn(),
      findSessionById: async (sessionId) => storedSession({ id: sessionId }),
      createSession: async () => freshSession,
      deleteSession
    })

    const clearing = service.clearChat()
    await vi.waitFor(() => expect(createCurrentChatContext).toHaveBeenCalledOnce())
    const resuming = service.resumeChatContext(selectedContext.id)
    contextWrite.resolve(freshContext)

    await expect(resuming).resolves.toMatchObject({ id: selectedContext.id })
    await expect(clearing).resolves.toMatchObject({ id: selectedContext.id })
    expect(currentContext).toBe(selectedContext)
    expect(deleteSession).toHaveBeenCalledWith(freshSession.id)
  })

  it('keeps a later clear current when an earlier resume lookup finishes late', async () => {
    const initialContext = storedChatContext()
    const selectedContext = storedChatContext({
      id: 'knowledge-base-chat-context-selected',
      agentSessionId: 'knowledge-base-agent-session-selected'
    })
    const freshSession = storedSession({ id: 'knowledge-base-agent-session-fresh' })
    const freshContext = storedChatContext({
      id: 'knowledge-base-chat-context-fresh',
      agentSessionId: freshSession.id
    })
    const selectedLookup = deferred<StoredChatContext | undefined>()
    let currentContext = initialContext
    const setCurrentChatContext = vi.fn(async () => {
      currentContext = selectedContext
      return currentContext
    })
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => currentContext,
      findChatContextById: () => selectedLookup.promise,
      setCurrentChatContext,
      createCurrentChatContext: async () => {
        currentContext = freshContext
        return freshContext
      },
      clearCurrentChatContext: vi.fn(),
      findSessionById: async (sessionId) => storedSession({ id: sessionId }),
      createSession: async () => freshSession,
      deleteSession: vi.fn()
    })

    const resuming = service.resumeChatContext(selectedContext.id)
    await expect(service.clearChat()).resolves.toMatchObject({ id: freshContext.id })
    selectedLookup.resolve(selectedContext)

    await expect(resuming).resolves.toMatchObject({ id: freshContext.id })
    expect(currentContext).toBe(freshContext)
    expect(setCurrentChatContext).not.toHaveBeenCalled()
  })

  it('surfaces cleanup failures for a superseded fresh Session', async () => {
    const selectedContext = storedChatContext({
      id: 'knowledge-base-chat-context-selected',
      agentSessionId: 'knowledge-base-agent-session-selected'
    })
    const supersededSession = storedSession({ id: 'knowledge-base-agent-session-superseded' })
    const freshSession = deferred<StoredSession>()
    const cleanupFailure = new Error('utility cleanup failed')
    let currentContext = storedChatContext()
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => currentContext,
      findChatContextById: async () => selectedContext,
      setCurrentChatContext: async () => {
        currentContext = selectedContext
        return selectedContext
      },
      createCurrentChatContext: vi.fn(),
      clearCurrentChatContext: vi.fn(),
      findSessionById: async (sessionId) => storedSession({ id: sessionId }),
      createSession: () => freshSession.promise,
      deleteSession: async () => {
        throw cleanupFailure
      }
    })

    const clearing = service.clearChat()
    await service.resumeChatContext(selectedContext.id)
    freshSession.resolve(supersededSession)

    await expect(clearing).rejects.toBe(cleanupFailure)
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

  it('surfaces creation and cleanup diagnostics when persistence rollback fails', async () => {
    const creationFailure = new Error('Unable to persist Knowledge Base Chat Context')
    const cleanupFailure = new Error('Unable to delete fresh agent Session')
    const session = storedSession()
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => undefined,
      createCurrentChatContext: async () => {
        throw creationFailure
      },
      clearCurrentChatContext: vi.fn(),
      findSessionById: vi.fn(),
      createSession: async () => session,
      deleteSession: async () => {
        throw cleanupFailure
      }
    })

    const opening = service.getOrCreateCurrentChatContext()
    await expect(opening).rejects.toThrow('knowledgeBaseChat.creationRollbackFailed')
    await expect(opening).rejects.toMatchObject({
      cause: creationFailure,
      rollbackFailures: [cleanupFailure]
    })
  })

  it('persists an accepted clear before cold agent runtime activation completes', async () => {
    const previousContext = storedChatContext()
    const replacementSession = storedSession({ id: 'knowledge-base-agent-session-2' })
    const replacementContext = storedChatContext({
      id: 'knowledge-base-chat-context-2',
      agentSessionId: replacementSession.id
    })
    const activation = deferred<StoredSession>()
    let currentContext = previousContext
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => currentContext,
      createCurrentChatContext: async () => {
        currentContext = replacementContext
        return replacementContext
      },
      clearCurrentChatContext: async () => undefined,
      findSessionById: async (sessionId) => storedSession({ id: sessionId }),
      createSession: vi.fn(),
      prepareSession: async () => ({
        session: replacementSession,
        activate: () => activation.promise
      }),
      deleteSession: vi.fn()
    })

    const clearing = service.clearChat()

    await vi.waitFor(() => expect(currentContext).toBe(replacementContext))
    let settled = false
    void clearing.finally(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    activation.resolve(replacementSession)
    await expect(clearing).resolves.toMatchObject({
      id: replacementContext.id,
      agentSession: { id: replacementSession.id }
    })
  })

  it('restores the previous current Chat Context when prepared activation fails', async () => {
    const activationFailure = new Error('Agent runtime unavailable')
    const previousContext = storedChatContext()
    const replacementSession = storedSession({ id: 'knowledge-base-agent-session-2' })
    const replacementContext = storedChatContext({
      id: 'knowledge-base-chat-context-2',
      agentSessionId: replacementSession.id
    })
    let currentContext = previousContext
    const setCurrentChatContext = vi.fn(async () => {
      currentContext = previousContext
      return previousContext
    })
    const service = createKnowledgeBaseChatService({
      getStatus: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      getCurrentChatContext: async () => currentContext,
      createCurrentChatContext: async () => {
        currentContext = replacementContext
        return replacementContext
      },
      setCurrentChatContext,
      clearCurrentChatContext: async () => undefined,
      findSessionById: async (sessionId) => storedSession({ id: sessionId }),
      createSession: vi.fn(),
      prepareSession: async () => ({
        session: replacementSession,
        activate: async () => {
          throw activationFailure
        }
      }),
      deleteSession: vi.fn()
    })

    await expect(service.clearChat()).rejects.toBe(activationFailure)
    expect(currentContext).toBe(previousContext)
    expect(setCurrentChatContext).toHaveBeenCalledWith(previousContext.id)
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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
