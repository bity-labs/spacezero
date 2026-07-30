import { describe, expect, it, vi } from 'vitest'

import type { AgentSessionState } from '../../../shared/agent-protocol'
import { BrowserService, type BrowserViewAdapter } from '../../browser/main/browser.service'
import type { BrowserClearDataResult } from '../../browser/shared'
import {
  createTerminalService,
  type PtyProcess,
  type TerminalPtyAdapter
} from '../../terminal/main/terminal.service'
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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
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

  it('surfaces creation and cleanup diagnostics when persistence rollback fails', async () => {
    const creationFailure = new Error('Unable to persist Global Chat Context')
    const cleanupFailure = new Error('Unable to delete fresh agent Session')
    const service = createGlobalChatService({
      getCurrentChatContext: async () => undefined,
      createCurrentChatContext: async () => {
        throw creationFailure
      },
      clearCurrentChatContext: vi.fn(),
      findSessionById: vi.fn(),
      createSession: async () => storedSession(),
      deleteSession: async () => {
        throw cleanupFailure
      }
    })

    const opening = service.getOrCreateCurrentChatContext()
    await expect(opening).rejects.toThrow('globalChat.creationRollbackFailed')
    await expect(opening).rejects.toMatchObject({ cause: creationFailure })
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

  it('keeps the latest resume persisted when resume lookups complete in reverse order', async () => {
    const initialContext = storedChatContext()
    const firstContext = storedChatContext({
      id: 'global-chat-context-first',
      agentSessionId: 'global-chat-agent-session-first'
    })
    const secondContext = storedChatContext({
      id: 'global-chat-context-second',
      agentSessionId: 'global-chat-agent-session-second'
    })
    const firstLookup = deferred<StoredGlobalChatContext | undefined>()
    let currentContext = initialContext
    const setCurrentChatContext = vi.fn(async (chatContextId: string) => {
      currentContext = chatContextId === firstContext.id ? firstContext : secondContext
      return currentContext
    })
    const service = createGlobalChatService({
      getCurrentChatContext: async () => currentContext,
      findChatContextById: async (chatContextId) =>
        chatContextId === firstContext.id ? firstLookup.promise : secondContext,
      setCurrentChatContext,
      createCurrentChatContext: vi.fn(),
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
      id: 'global-chat-context-selected',
      agentSessionId: 'global-chat-agent-session-selected'
    })
    const supersededSession = storedSession({ id: 'global-chat-agent-session-superseded' })
    const freshSession = deferred<StoredSession>()
    let currentContext = initialContext
    const deleteSession = vi.fn(async () => undefined)
    const createCurrentChatContext = vi.fn(async (sessionId: string) => {
      currentContext = storedChatContext({
        id: `global-chat-context-${sessionId}`,
        agentSessionId: sessionId
      })
      return currentContext
    })
    const service = createGlobalChatService({
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
      id: 'global-chat-context-selected',
      agentSessionId: 'global-chat-agent-session-selected'
    })
    const freshSession = storedSession({ id: 'global-chat-agent-session-superseded' })
    const freshContext = storedChatContext({
      id: 'global-chat-context-superseded',
      agentSessionId: freshSession.id
    })
    const contextWrite = deferred<StoredGlobalChatContext>()
    let currentContext = initialContext
    const deleteSession = vi.fn(async () => undefined)
    const createCurrentChatContext = vi.fn(async () => {
      const created = await contextWrite.promise
      currentContext = created
      return created
    })
    const service = createGlobalChatService({
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
      id: 'global-chat-context-selected',
      agentSessionId: 'global-chat-agent-session-selected'
    })
    const freshSession = storedSession({ id: 'global-chat-agent-session-fresh' })
    const freshContext = storedChatContext({
      id: 'global-chat-context-fresh',
      agentSessionId: freshSession.id
    })
    const selectedLookup = deferred<StoredGlobalChatContext | undefined>()
    let currentContext = initialContext
    const setCurrentChatContext = vi.fn(async () => {
      currentContext = selectedContext
      return currentContext
    })
    const service = createGlobalChatService({
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
      id: 'global-chat-context-selected',
      agentSessionId: 'global-chat-agent-session-selected'
    })
    const supersededSession = storedSession({ id: 'global-chat-agent-session-superseded' })
    const freshSession = deferred<StoredSession>()
    const cleanupFailure = new Error('utility cleanup failed')
    let currentContext = storedChatContext()
    const service = createGlobalChatService({
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

  it('keeps Browser and Terminal tab identities under global-chat across clear and resume', async () => {
    const originalSession = storedSession()
    const originalContext = storedChatContext()
    const freshSession = storedSession({ id: 'global-chat-agent-session-fresh' })
    const freshContext = storedChatContext({
      id: 'global-chat-context-fresh',
      agentSessionId: freshSession.id
    })
    let currentContext = originalContext
    const chatService = createGlobalChatService({
      getCurrentChatContext: async () => currentContext,
      findChatContextById: async (chatContextId) =>
        chatContextId === originalContext.id ? originalContext : undefined,
      setCurrentChatContext: async () => {
        currentContext = originalContext
        return originalContext
      },
      createCurrentChatContext: async () => {
        currentContext = freshContext
        return freshContext
      },
      clearCurrentChatContext: vi.fn(),
      findSessionById: async (sessionId) =>
        sessionId === originalSession.id ? originalSession : freshSession,
      createSession: async () => freshSession,
      deleteSession: vi.fn()
    })
    const clearedProfile: BrowserClearDataResult = {
      status: 'cleared',
      cleared: ['cookies-and-site-storage', 'cache', 'temporary-grants'],
      failures: []
    }
    const browserAdapter: BrowserViewAdapter = {
      createView: vi.fn(),
      showView: vi.fn(),
      hideView: vi.fn(),
      destroyView: vi.fn(),
      loadUrl: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      stop: vi.fn(),
      clearProfileData: async () => clearedProfile
    }
    const browserService = new BrowserService(browserAdapter)
    const ptyProcess: PtyProcess = {
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(async () => undefined),
      onData: vi.fn(() => () => undefined),
      onExit: vi.fn(() => () => undefined)
    }
    const pty: TerminalPtyAdapter = { spawn: vi.fn(async () => ptyProcess) }
    const terminalService = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => undefined),
        findProjectById: vi.fn(async () => undefined)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty,
      createId: () => 'terminal-global-chat',
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn()
    })
    const browserRequest = {
      contextKey: 'global-chat',
      context: { kind: 'global-chat' as const }
    }
    const terminalRequest = { context: { kind: 'global-chat' as const } }

    const initialBrowser = await browserService.getState(browserRequest)
    const initialTerminal = await terminalService.create({ ownerWindowId: 1, request: terminalRequest })

    await chatService.clearChat()
    const afterClearBrowser = await browserService.getState(browserRequest)
    const afterClearTerminal = await terminalService.create({
      ownerWindowId: 1,
      request: terminalRequest
    })
    await chatService.resumeChatContext(originalContext.id)
    const afterResumeBrowser = await browserService.getState(browserRequest)
    const afterResumeTerminal = await terminalService.create({
      ownerWindowId: 1,
      request: terminalRequest
    })

    expect(afterClearBrowser.activeTabId).toBe(initialBrowser.activeTabId)
    expect(afterResumeBrowser.activeTabId).toBe(initialBrowser.activeTabId)
    expect(afterClearTerminal.terminalId).toBe(initialTerminal.terminalId)
    expect(afterResumeTerminal.terminalId).toBe(initialTerminal.terminalId)
    expect(browserAdapter.createView).toHaveBeenCalledOnce()
    expect(pty.spawn).toHaveBeenCalledOnce()
    expect(currentContext).toBe(originalContext)
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
