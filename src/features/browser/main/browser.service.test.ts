import { describe, expect, it } from 'vitest'

import {
  BrowserService,
  normalizeBrowserUrl,
  type BrowserContextRepository,
  type BrowserViewAdapter
} from './browser.service'

class FakeBrowserViewAdapter implements BrowserViewAdapter {
  readonly created: Array<{ id: string; partition: string; preferences: Record<string, unknown> }> = []
  readonly shown: Array<{ id: string; bounds: { x: number; y: number; width: number; height: number } }> = []
  readonly hidden: string[] = []
  readonly destroyed: string[] = []
  readonly loaded: Array<{ id: string; url: string }> = []
  readonly back: string[] = []
  readonly forward: string[] = []
  readonly reloaded: string[] = []
  readonly stopped: string[] = []

  createView(tabId: string, options: { partition: string; preferences: Record<string, unknown> }): void {
    this.created.push({ id: tabId, partition: options.partition, preferences: options.preferences })
  }

  showView(tabId: string, bounds: { x: number; y: number; width: number; height: number }): void {
    this.shown.push({ id: tabId, bounds })
  }

  hideView(tabId: string): void {
    this.hidden.push(tabId)
  }

  destroyView(tabId: string): void {
    this.destroyed.push(tabId)
  }

  loadUrl(tabId: string, url: string): void {
    this.loaded.push({ id: tabId, url })
  }

  goBack(tabId: string): void {
    this.back.push(tabId)
  }

  goForward(tabId: string): void {
    this.forward.push(tabId)
  }

  reload(tabId: string): void {
    this.reloaded.push(tabId)
  }

  stop(tabId: string): void {
    this.stopped.push(tabId)
  }
}

function createContextRepository(overrides: Partial<BrowserContextRepository> = {}): BrowserContextRepository {
  return {
    findSessionById: async (sessionId) => {
      if (sessionId === 'project-session-1') return { id: sessionId, projectId: 'project-1' }
      if (sessionId === 'workspace-1') return { id: sessionId, projectId: null }
      if (sessionId === 'kb-session-1') return { id: sessionId, projectId: null, managedContext: 'knowledge-base' }
      return undefined
    },
    findProjectById: async (projectId) => (projectId === 'project-1' ? { id: projectId } : undefined),
    getCurrentKnowledgeBaseSessionId: async () => 'kb-session-1',
    ...overrides
  }
}

const projectContext = {
  contextKey: 'session:project-session-1',
  context: { kind: 'project-session' as const, projectId: 'project-1', sessionId: 'project-session-1' }
}

const workspaceContext = {
  contextKey: 'session:workspace-1',
  context: { kind: 'workspace-session' as const, sessionId: 'workspace-1' }
}

const knowledgeBaseContext = {
  contextKey: 'knowledge-base',
  context: { kind: 'knowledge-base' as const }
}

describe('normalizeBrowserUrl', () => {
  it('accepts HTTP, HTTPS, localhost, and loopback URLs only', () => {
    expect(normalizeBrowserUrl('https://example.com/path')).toEqual('https://example.com/path')
    expect(normalizeBrowserUrl('http://localhost:5173')).toEqual('http://localhost:5173/')
    expect(normalizeBrowserUrl('localhost:5173')).toEqual('http://localhost:5173/')
    expect(normalizeBrowserUrl('127.0.0.1:3000')).toEqual('http://127.0.0.1:3000/')
    expect(normalizeBrowserUrl('[::1]:8080')).toEqual('http://[::1]:8080/')
    expect(normalizeBrowserUrl('example.com')).toEqual('https://example.com/')
    expect(normalizeBrowserUrl('www.example.com/docs')).toEqual('https://www.example.com/docs')
    expect(normalizeBrowserUrl('sub.example.co.uk:8443/path?q=1')).toEqual('https://sub.example.co.uk:8443/path?q=1')
    expect(normalizeBrowserUrl('space zero browser')).toEqual('https://www.google.com/search?q=space%20zero%20browser')
    expect(normalizeBrowserUrl('what is a+b?')).toEqual('https://www.google.com/search?q=what%20is%20a%2Bb%3F')
    expect(() => normalizeBrowserUrl('file:///etc/passwd')).toThrow(/Only HTTP and HTTPS/)
    expect(() => normalizeBrowserUrl('spacezero://settings')).toThrow(/Only HTTP and HTTPS/)
    expect(() => normalizeBrowserUrl('http://')).toThrow(/valid HTTP/)
  })
})

describe('BrowserService', () => {
  it('creates one blank tab per authenticated context using the dedicated profile', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())

    const state = await service.getState(projectContext)

    expect(state.contextKey).toBe('session:project-session-1')
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0]).toMatchObject({ url: null, title: null, isLoading: false })
    expect(adapter.created).toEqual([
      {
        id: state.activeTabId,
        partition: 'persist:spacezero-browser',
        preferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webviewTag: false
        }
      }
    ])
  })

  it('rejects forged context keys before creating native content', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())

    await expect(
      service.getState({
        contextKey: 'session:other',
        context: { kind: 'workspace-session', sessionId: 'workspace-1' }
      })
    ).rejects.toThrow(/Browser context is not authorized/)
    expect(adapter.created).toEqual([])
  })

  it('rejects missing and archived session contexts before creating native content', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(
      adapter,
      createContextRepository({
        findSessionById: async (sessionId) =>
          sessionId === 'archived-session' ? { id: sessionId, projectId: null, archivedAt: new Date() } : undefined
      })
    )

    await expect(
      service.getState({ contextKey: 'session:missing', context: { kind: 'workspace-session', sessionId: 'missing' } })
    ).rejects.toThrow(/Browser context is not authorized/)
    await expect(
      service.getState({
        contextKey: 'session:archived-session',
        context: { kind: 'workspace-session', sessionId: 'archived-session' }
      })
    ).rejects.toThrow(/Browser context is not authorized/)
    expect(adapter.created).toEqual([])
  })

  it('rejects wrong-kind and mismatched-project session contexts', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())

    await expect(
      service.getState({
        contextKey: 'session:project-session-1',
        context: { kind: 'workspace-session', sessionId: 'project-session-1' }
      })
    ).rejects.toThrow(/Browser context is not authorized/)
    await expect(
      service.getState({
        contextKey: 'session:workspace-1',
        context: { kind: 'project-session', projectId: 'project-1', sessionId: 'workspace-1' }
      })
    ).rejects.toThrow(/Browser context is not authorized/)
    await expect(
      service.getState({
        contextKey: 'session:project-session-1',
        context: { kind: 'project-session', projectId: 'other-project', sessionId: 'project-session-1' }
      })
    ).rejects.toThrow(/Browser context is not authorized/)
    expect(adapter.created).toEqual([])
  })

  it('rejects missing and archived projects for project-session contexts', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(
      adapter,
      createContextRepository({ findProjectById: async () => ({ id: 'project-1', archivedAt: new Date() }) })
    )

    await expect(service.getState(projectContext)).rejects.toThrow(/Browser context is not authorized/)
    expect(adapter.created).toEqual([])
  })

  it('verifies the main-owned Knowledge Base context before creating native content', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())

    await expect(service.getState(knowledgeBaseContext)).resolves.toMatchObject({ contextKey: 'knowledge-base' })

    const rejectingService = new BrowserService(
      new FakeBrowserViewAdapter(),
      createContextRepository({ getCurrentKnowledgeBaseSessionId: async () => undefined })
    )
    await expect(rejectingService.getState(knowledgeBaseContext)).rejects.toThrow(
      /Browser context is not authorized/
    )
  })

  it('loads validated URLs and never lets renderer choose a native content id', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const blank = await service.getState(projectContext)

    const state = await service.navigate({ ...projectContext, tabId: 'forged-tab-id', input: 'localhost:4173' })

    expect(state.activeTabId).toBe(blank.activeTabId)
    expect(state.tabs[0]?.url).toBe('http://localhost:4173/')
    expect(state.tabs[0]?.isLoading).toBe(true)
    expect(adapter.loaded).toEqual([{ id: blank.activeTabId, url: 'http://localhost:4173/' }])
  })

  it('routes search terms to encoded Google Search navigation', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const blank = await service.getState(workspaceContext)

    const state = await service.navigate({ ...workspaceContext, input: 'space zero browser' })

    expect(state.tabs[0]?.url).toBe('https://www.google.com/search?q=space%20zero%20browser')
    expect(adapter.loaded).toEqual([
      { id: blank.activeTabId, url: 'https://www.google.com/search?q=space%20zero%20browser' }
    ])
  })

  it('keeps loading through commit until native loading settles', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const state = await service.navigate({ ...workspaceContext, input: 'https://down.example/' })

    service.markNavigationCommitted(state.activeTabId, 'https://example.com/', {
      canGoBack: true,
      canGoForward: false
    })
    let current = await service.getState(workspaceContext)
    expect(current.tabs[0]).toMatchObject({
      url: 'https://example.com/',
      isLoading: true,
      canGoBack: true,
      canGoForward: false,
      error: null
    })

    service.markNavigationStopped(state.activeTabId)
    current = await service.getState(workspaceContext)
    expect(current.tabs[0]?.isLoading).toBe(false)
  })

  it('updates failed navigation state without clearing the failed URL', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const state = await service.navigate({ ...workspaceContext, input: 'https://down.example/' })
    service.markNavigationFailed(state.activeTabId, 'Host unavailable')
    const current = await service.getState(workspaceContext)
    expect(current.tabs[0]).toMatchObject({
      url: 'https://down.example/',
      isLoading: false,
      error: 'Host unavailable'
    })
  })

  it('publishes context-scoped state updates for asynchronous native lifecycle events', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const events: unknown[] = []
    service.onEvent((event) => events.push(event))
    const state = await service.navigate({ ...workspaceContext, input: 'https://example.com/' })
    events.length = 0

    service.markNavigationStarted(state.activeTabId)
    service.markNavigationCommitted(state.activeTabId, 'https://example.com/docs', {
      canGoBack: true,
      canGoForward: false
    })
    service.markTitleChanged(state.activeTabId, 'Example Docs')
    service.markNavigationStopped(state.activeTabId)

    expect(events).toEqual([
      expect.objectContaining({ type: 'state-changed', contextKey: 'session:workspace-1' }),
      expect.objectContaining({ type: 'state-changed', contextKey: 'session:workspace-1' }),
      expect.objectContaining({ type: 'state-changed', contextKey: 'session:workspace-1' }),
      expect.objectContaining({ type: 'state-changed', contextKey: 'session:workspace-1' })
    ])
    expect(events[events.length - 1]).toMatchObject({
      state: {
        tabs: [expect.objectContaining({ url: 'https://example.com/docs', title: 'Example Docs', isLoading: false })]
      }
    })
  })

  it('controls back, forward, reload, and stop through main-owned native operations', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const state = await service.navigate({ ...workspaceContext, input: 'https://example.com/' })
    service.markHistoryChanged(state.activeTabId, { canGoBack: true, canGoForward: true })

    await service.goBack(workspaceContext)
    await service.goForward(workspaceContext)
    await service.reload(workspaceContext)
    await service.stop(workspaceContext)

    expect(adapter.back).toEqual([state.activeTabId])
    expect(adapter.forward).toEqual([state.activeTabId])
    expect(adapter.reloaded).toEqual([state.activeTabId])
    expect(adapter.stopped).toEqual([state.activeTabId])
  })

  it('opens the active HTTP page externally through a validated narrow opener', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const opened: string[] = []
    const service = new BrowserService(adapter, createContextRepository(), {
      openExternal: async (url) => {
        opened.push(url)
      }
    })
    await service.navigate({ ...workspaceContext, input: 'https://example.com/docs' })

    await service.openInDefaultBrowser(workspaceContext)

    expect(opened).toEqual(['https://example.com/docs'])
  })

  it('rejects malformed active URLs before external opening', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const opened: string[] = []
    const service = new BrowserService(adapter, createContextRepository(), {
      openExternal: async (url) => {
        opened.push(url)
      }
    })
    const state = await service.getState(workspaceContext)
    service.markNavigationCommitted(state.activeTabId, 'file:///etc/passwd')

    await expect(service.openInDefaultBrowser(workspaceContext)).rejects.toThrow(/Only HTTP and HTTPS/)
    expect(opened).toEqual([])
  })

  it('hides and cleans up native content by context lifecycle', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const state = await service.show({
      ...workspaceContext,
      bounds: { x: 10, y: 20, width: 640, height: 480 },
      shortcutBindings: []
    })

    await service.hide(workspaceContext)
    const closed = await service.closeTab({ ...workspaceContext, tabId: state.activeTabId })

    expect(adapter.shown).toEqual([
      { id: state.activeTabId, bounds: { x: 10, y: 20, width: 640, height: 480 } }
    ])
    expect(adapter.hidden).toEqual([state.activeTabId])
    expect(adapter.destroyed).toEqual([state.activeTabId])
    expect(closed.tabs).toHaveLength(1)
    expect(closed.tabs[0]?.url).toBeNull()
  })

  it('destroys all tabs when a context is deleted', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const state = await service.getState(workspaceContext)

    service.destroySessionContext('workspace-1')

    expect(adapter.destroyed).toEqual([state.activeTabId])
  })

  it('recreates context state after native window cleanup removes hidden tabs', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const state = await service.getState(workspaceContext)

    service.removeNativeClosedTabs([state.activeTabId])
    const reopened = await service.show({
      ...workspaceContext,
      bounds: { x: 10, y: 20, width: 640, height: 480 },
      shortcutBindings: []
    })

    expect(reopened.activeTabId).not.toBe(state.activeTabId)
    expect(reopened.tabs).toHaveLength(1)
    expect(adapter.created.map((tab) => tab.id)).toEqual([state.activeTabId, reopened.activeTabId])
    expect(adapter.shown).toEqual([
      { id: reopened.activeTabId, bounds: { x: 10, y: 20, width: 640, height: 480 } }
    ])
  })
})
