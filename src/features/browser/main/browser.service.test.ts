import { describe, expect, it } from 'vitest'

import type { BrowserClearDataResult } from '../shared'

import {
  BrowserService,
  normalizeBrowserUrl,
  type BrowserContextRepository,
  type BrowserFaviconLoader,
  type BrowserPersistedTab,
  type BrowserTabsRepository,
  type BrowserViewAdapter
} from './browser.service'

class FakeBrowserTabsRepository implements BrowserTabsRepository {
  readonly contexts = new Map<string, BrowserPersistedTab[]>()
  readonly deletedContextKeys: string[] = []

  constructor(seed: BrowserPersistedTab[] = []) {
    if (seed.length > 0)
      this.contexts.set(
        seed[0].context.kind === 'knowledge-base'
          ? 'knowledge-base'
          : `session:${seed[0].context.sessionId}`,
        seed
      )
  }

  async listByContext(context: BrowserPersistedTab['context']): Promise<BrowserPersistedTab[]> {
    return (
      this.contexts.get(
        context.kind === 'knowledge-base' ? 'knowledge-base' : `session:${context.sessionId}`
      ) ?? []
    )
  }

  async replaceContext(
    context: BrowserPersistedTab['context'],
    tabs: BrowserPersistedTab[]
  ): Promise<void> {
    this.contexts.set(
      context.kind === 'knowledge-base' ? 'knowledge-base' : `session:${context.sessionId}`,
      tabs
    )
  }

  async deleteContext(context: BrowserPersistedTab['context']): Promise<void> {
    const contextKey =
      context.kind === 'knowledge-base' ? 'knowledge-base' : `session:${context.sessionId}`
    this.deletedContextKeys.push(contextKey)
    this.contexts.delete(contextKey)
  }

  async deleteContextKey(contextKey: string): Promise<void> {
    this.deletedContextKeys.push(contextKey)
    this.contexts.delete(contextKey)
  }
}

class FakeBrowserViewAdapter implements BrowserViewAdapter {
  readonly created: Array<{ id: string; partition: string; preferences: Record<string, unknown> }> =
    []
  readonly shown: Array<{
    id: string
    bounds: { x: number; y: number; width: number; height: number }
  }> = []
  readonly hidden: string[] = []
  readonly destroyed: string[] = []
  readonly loaded: Array<{ id: string; url: string }> = []
  readonly back: string[] = []
  readonly forward: string[] = []
  readonly reloaded: string[] = []
  readonly stopped: string[] = []
  clearResult: BrowserClearDataResult = {
    status: 'cleared',
    cleared: ['cookies-and-site-storage', 'cache', 'temporary-grants'],
    failures: []
  }

  createView(
    tabId: string,
    options: { partition: string; preferences: Record<string, unknown> }
  ): void {
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

  async clearProfileData(): Promise<BrowserClearDataResult> {
    return {
      status: this.clearResult.status,
      cleared: [...this.clearResult.cleared],
      failures: [...this.clearResult.failures]
    }
  }
}

function createContextRepository(
  overrides: Partial<BrowserContextRepository> = {}
): BrowserContextRepository {
  return {
    findSessionById: async (sessionId) => {
      if (sessionId === 'project-session-1') return { id: sessionId, projectId: 'project-1' }
      if (sessionId === 'workspace-1') return { id: sessionId, projectId: null }
      if (sessionId === 'kb-session-1')
        return { id: sessionId, projectId: null, managedContext: 'knowledge-base' }
      return undefined
    },
    findProjectById: async (projectId) =>
      projectId === 'project-1' ? { id: projectId } : undefined,
    getCurrentKnowledgeBaseSessionId: async () => 'kb-session-1',
    ...overrides
  }
}

const projectContext = {
  contextKey: 'session:project-session-1',
  context: {
    kind: 'project-session' as const,
    projectId: 'project-1',
    sessionId: 'project-session-1'
  }
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
    expect(normalizeBrowserUrl('sub.example.co.uk:8443/path?q=1')).toEqual(
      'https://sub.example.co.uk:8443/path?q=1'
    )
    expect(normalizeBrowserUrl('space zero browser')).toEqual(
      'https://www.google.com/search?q=space%20zero%20browser'
    )
    expect(normalizeBrowserUrl('what is a+b?')).toEqual(
      'https://www.google.com/search?q=what%20is%20a%2Bb%3F'
    )
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
          sessionId === 'archived-session'
            ? { id: sessionId, projectId: null, archivedAt: new Date() }
            : undefined
      })
    )

    await expect(
      service.getState({
        contextKey: 'session:missing',
        context: { kind: 'workspace-session', sessionId: 'missing' }
      })
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
        context: {
          kind: 'project-session',
          projectId: 'other-project',
          sessionId: 'project-session-1'
        }
      })
    ).rejects.toThrow(/Browser context is not authorized/)
    expect(adapter.created).toEqual([])
  })

  it('rejects missing and archived projects for project-session contexts', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(
      adapter,
      createContextRepository({
        findProjectById: async () => ({ id: 'project-1', archivedAt: new Date() })
      })
    )

    await expect(service.getState(projectContext)).rejects.toThrow(
      /Browser context is not authorized/
    )
    expect(adapter.created).toEqual([])
  })

  it('verifies the main-owned Knowledge Base context before creating native content', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())

    await expect(service.getState(knowledgeBaseContext)).resolves.toMatchObject({
      contextKey: 'knowledge-base'
    })

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

    const state = await service.navigate({
      ...projectContext,
      tabId: 'forged-tab-id',
      input: 'localhost:4173'
    })

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

  it('clears stale title and favicon when existing tabs navigate to a new page or fail', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const state = await service.navigate({ ...workspaceContext, input: 'https://example.com/' })
    service.markTitleChanged(state.activeTabId, 'Example')
    await service.markFaviconChanged(state.activeTabId, ['https://example.com/favicon.ico'])

    let current = await service.navigate({
      ...workspaceContext,
      input: 'https://untitled.example/'
    })
    expect(current.tabs[0]).toMatchObject({
      url: 'https://untitled.example/',
      title: null,
      faviconUrl: null,
      isLoading: true,
      error: null
    })

    service.markTitleChanged(state.activeTabId, 'Untitled Previous')
    await service.markFaviconChanged(state.activeTabId, ['https://untitled.example/favicon.ico'])
    service.markNavigationFailed(state.activeTabId, 'Host unavailable')
    current = await service.getState(workspaceContext)
    expect(current.tabs[0]).toMatchObject({
      url: 'https://untitled.example/',
      title: null,
      faviconUrl: null,
      isLoading: false,
      error: 'Host unavailable'
    })
  })

  it('clears stale title and favicon when native navigation commits to a different page', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const state = await service.navigate({ ...workspaceContext, input: 'https://example.com/' })
    service.markTitleChanged(state.activeTabId, 'Example')
    await service.markFaviconChanged(state.activeTabId, ['https://example.com/favicon.ico'])

    service.markNavigationCommitted(state.activeTabId, 'https://other.example/', {
      canGoBack: true,
      canGoForward: false
    })

    const current = await service.getState(workspaceContext)
    expect(current.tabs[0]).toMatchObject({
      url: 'https://other.example/',
      title: null,
      faviconUrl: null,
      canGoBack: true,
      canGoForward: false,
      error: null
    })
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
        tabs: [
          expect.objectContaining({
            url: 'https://example.com/docs',
            title: 'Example Docs',
            isLoading: false
          })
        ]
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

  it('opens explicit Terminal Link fallback URLs externally through the same validated narrow opener', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const opened: string[] = []
    const service = new BrowserService(adapter, createContextRepository(), {
      openExternal: async (url) => {
        opened.push(url)
      }
    })

    await service.openUrlInDefaultBrowser({ url: 'http://localhost:5173/path' })

    expect(opened).toEqual(['http://localhost:5173/path'])
  })

  it('rejects invalid schemes from Terminal Link fallback before external opening', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const opened: string[] = []
    const service = new BrowserService(adapter, createContextRepository(), {
      openExternal: async (url) => {
        opened.push(url)
      }
    })

    await expect(service.openUrlInDefaultBrowser({ url: 'file:///etc/passwd' })).rejects.toThrow(
      /Only HTTP and HTTPS/
    )
    expect(opened).toEqual([])
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

    await expect(service.openInDefaultBrowser(workspaceContext)).rejects.toThrow(
      /Only HTTP and HTTPS/
    )
    expect(opened).toEqual([])
  })

  it('creates, selects, reorders, and closes multiple tabs without leaking across contexts', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const project = await service.navigate({ ...projectContext, input: 'https://project.example/' })

    const withSecondTab = await service.createTab({
      ...projectContext,
      input: 'https://docs.example/'
    })

    expect(withSecondTab.tabs.map((tab) => tab.url)).toEqual([
      'https://project.example/',
      'https://docs.example/'
    ])
    expect(withSecondTab.activeTabId).not.toBe(project.activeTabId)
    expect(adapter.loaded).toEqual([
      { id: project.activeTabId, url: 'https://project.example/' },
      { id: withSecondTab.activeTabId, url: 'https://docs.example/' }
    ])

    const workspace = await service.getState(workspaceContext)
    expect(workspace.tabs).toHaveLength(1)
    expect(workspace.tabs[0]?.url).toBeNull()
    expect(workspace.activeTabId).not.toBe(withSecondTab.activeTabId)

    const reordered = await service.reorderTabs({
      ...projectContext,
      tabIds: [withSecondTab.activeTabId, project.activeTabId]
    })
    expect(reordered.tabs.map((tab) => tab.id)).toEqual([
      withSecondTab.activeTabId,
      project.activeTabId
    ])
    expect(reordered.activeTabId).toBe(withSecondTab.activeTabId)

    const selected = await service.selectTab({ ...projectContext, tabId: project.activeTabId })
    expect(selected.activeTabId).toBe(project.activeTabId)

    const closed = await service.closeTab({ ...projectContext, tabId: project.activeTabId })
    expect(closed.tabs.map((tab) => tab.id)).toEqual([withSecondTab.activeTabId])
    expect(adapter.destroyed).toEqual([project.activeTabId])
  })

  it('persists tab creation, navigation, active selection, reordering, and close metadata by context', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const tabsRepository = new FakeBrowserTabsRepository()
    const service = new BrowserService(
      adapter,
      createContextRepository(),
      undefined,
      tabsRepository
    )

    const first = await service.navigate({ ...projectContext, input: 'https://project.example/' })
    const second = await service.createTab({ ...projectContext, input: 'https://docs.example/' })
    await service.selectTab({ ...projectContext, tabId: first.activeTabId })
    await service.reorderTabs({
      ...projectContext,
      tabIds: [second.activeTabId, first.activeTabId]
    })
    await service.closeTab({ ...projectContext, tabId: first.activeTabId })

    expect(tabsRepository.contexts.get('session:project-session-1')).toEqual([
      {
        context: projectContext.context,
        tabId: second.activeTabId,
        order: 0,
        active: true,
        url: 'https://docs.example/'
      }
    ])
    expect(tabsRepository.contexts.get('session:workspace-1')).toBeUndefined()
  })

  it('persists the initial blank tab when an empty context is materialized', async () => {
    const tabsRepository = new FakeBrowserTabsRepository()
    const firstAdapter = new FakeBrowserViewAdapter()
    const firstService = new BrowserService(
      firstAdapter,
      createContextRepository(),
      undefined,
      tabsRepository
    )

    const initial = await firstService.getState(workspaceContext)
    await firstService.show({
      ...workspaceContext,
      bounds: { x: 10, y: 20, width: 640, height: 480 },
      shortcutBindings: []
    })

    expect(tabsRepository.contexts.get('session:workspace-1')).toEqual([
      {
        context: workspaceContext.context,
        tabId: initial.activeTabId,
        order: 0,
        active: true,
        url: null
      }
    ])
    expect(firstAdapter.loaded).toEqual([])

    const secondAdapter = new FakeBrowserViewAdapter()
    const secondService = new BrowserService(
      secondAdapter,
      createContextRepository(),
      undefined,
      tabsRepository
    )
    const restored = await secondService.show({
      ...workspaceContext,
      bounds: { x: 10, y: 20, width: 640, height: 480 },
      shortcutBindings: []
    })

    expect(restored.activeTabId).toBe(initial.activeTabId)
    expect(restored.tabs).toEqual([expect.objectContaining({ id: initial.activeTabId, url: null })])
    expect(secondAdapter.loaded).toEqual([])
  })

  it('restores saved tab order and active selection without loading pages until shown or selected', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const tabsRepository = new FakeBrowserTabsRepository([
      {
        context: workspaceContext.context,
        tabId: 'browser-tab-restored-1',
        order: 0,
        active: false,
        url: 'https://inactive.example/'
      },
      {
        context: workspaceContext.context,
        tabId: 'browser-tab-restored-2',
        order: 1,
        active: true,
        url: 'https://active.example/'
      }
    ])
    const service = new BrowserService(
      adapter,
      createContextRepository(),
      undefined,
      tabsRepository
    )

    const restored = await service.getState(workspaceContext)

    expect(restored.tabs.map((tab) => tab.id)).toEqual([
      'browser-tab-restored-1',
      'browser-tab-restored-2'
    ])
    expect(restored.activeTabId).toBe('browser-tab-restored-2')
    expect(restored.tabs).toEqual([
      expect.objectContaining({ url: 'https://inactive.example/', canGoBack: false }),
      expect.objectContaining({ url: 'https://active.example/', canGoForward: false })
    ])
    expect(adapter.loaded).toEqual([])

    await service.show({
      ...workspaceContext,
      bounds: { x: 10, y: 20, width: 640, height: 480 },
      shortcutBindings: []
    })
    expect(adapter.loaded).toEqual([
      { id: 'browser-tab-restored-2', url: 'https://active.example/' }
    ])

    await service.selectTab({ ...workspaceContext, tabId: 'browser-tab-restored-1' })
    expect(adapter.loaded).toEqual([
      { id: 'browser-tab-restored-2', url: 'https://active.example/' },
      { id: 'browser-tab-restored-1', url: 'https://inactive.example/' }
    ])
  })

  it('rejects invalid persisted URLs before native Browser navigation', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const tabsRepository = new FakeBrowserTabsRepository([
      {
        context: workspaceContext.context,
        tabId: 'browser-tab-file-url',
        order: 0,
        active: true,
        url: 'file:///etc/passwd'
      },
      {
        context: workspaceContext.context,
        tabId: 'browser-tab-blank',
        order: 1,
        active: false,
        url: null
      },
      {
        context: workspaceContext.context,
        tabId: 'browser-tab-http-url',
        order: 2,
        active: false,
        url: 'https://safe.example/path'
      }
    ])
    const service = new BrowserService(
      adapter,
      createContextRepository(),
      undefined,
      tabsRepository
    )

    const state = await service.show({
      ...workspaceContext,
      bounds: { x: 10, y: 20, width: 640, height: 480 },
      shortcutBindings: []
    })
    await service.selectTab({ ...workspaceContext, tabId: 'browser-tab-http-url' })

    expect(state.tabs.map((tab) => tab.id)).toEqual(['browser-tab-blank', 'browser-tab-http-url'])
    expect(adapter.loaded).toEqual([
      { id: 'browser-tab-http-url', url: 'https://safe.example/path' }
    ])
  })

  it('falls back to a blank tab when persisted Browser tab metadata is malformed', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const tabsRepository = new FakeBrowserTabsRepository([
      {
        context: workspaceContext.context,
        tabId: '',
        order: 0,
        active: true,
        url: 'https://malformed.example/'
      }
    ])
    const service = new BrowserService(
      adapter,
      createContextRepository(),
      undefined,
      tabsRepository
    )

    const state = await service.getState(workspaceContext)

    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0]).toMatchObject({ url: null, title: null, error: null })
    expect(adapter.loaded).toEqual([])
  })

  it('restores blank tabs without fabricating network URLs', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const tabsRepository = new FakeBrowserTabsRepository([
      {
        context: knowledgeBaseContext.context,
        tabId: 'browser-tab-blank',
        order: 0,
        active: true,
        url: null
      }
    ])
    const service = new BrowserService(
      adapter,
      createContextRepository(),
      undefined,
      tabsRepository
    )

    const state = await service.show({
      ...knowledgeBaseContext,
      bounds: { x: 10, y: 20, width: 640, height: 480 },
      shortcutBindings: []
    })

    expect(state.tabs).toEqual([expect.objectContaining({ id: 'browser-tab-blank', url: null })])
    expect(adapter.loaded).toEqual([])
  })

  it('closes live Browser views without removing durable metadata', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const tabsRepository = new FakeBrowserTabsRepository()
    const service = new BrowserService(
      adapter,
      createContextRepository(),
      undefined,
      tabsRepository
    )
    const state = await service.createTab({ ...workspaceContext, input: 'https://docs.example/' })

    service.closeSessionContext('workspace-1')

    expect(adapter.destroyed).toEqual(state.tabs.map((tab) => tab.id))
    expect(tabsRepository.deletedContextKeys).toEqual([])
    expect(tabsRepository.contexts.get('session:workspace-1')).toBeDefined()
  })

  it('removes persisted metadata when an owning context is deleted', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const tabsRepository = new FakeBrowserTabsRepository()
    const service = new BrowserService(
      adapter,
      createContextRepository(),
      undefined,
      tabsRepository
    )
    const state = await service.createTab({ ...workspaceContext, input: 'https://docs.example/' })

    await service.destroySessionContext('workspace-1')

    expect(adapter.destroyed).toEqual(state.tabs.map((tab) => tab.id))
    expect(tabsRepository.deletedContextKeys).toEqual(['session:workspace-1'])
    expect(tabsRepository.contexts.get('session:workspace-1')).toBeUndefined()
  })

  it('routes eligible native new-window web requests into a same-context Browser tab', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const project = await service.navigate({ ...projectContext, input: 'https://project.example/' })
    const workspace = await service.navigate({
      ...workspaceContext,
      input: 'https://workspace.example/'
    })

    const routed = service.openNativeRequestedTab(project.activeTabId, 'https://auth.example/start')

    expect(routed?.contextKey).toBe(project.contextKey)
    expect(routed?.tabs.map((tab) => tab.url)).toEqual([
      'https://project.example/',
      'https://auth.example/start'
    ])
    expect(routed?.activeTabId).not.toBe(project.activeTabId)
    expect(adapter.loaded).toContainEqual({
      id: routed?.activeTabId,
      url: 'https://auth.example/start'
    })
    expect((await service.getState(workspaceContext)).activeTabId).toBe(workspace.activeTabId)
    expect(
      service.openNativeRequestedTab('browser-tab-forged', 'https://example.com/')
    ).toBeUndefined()
  })

  it('clears the shared profile while retaining tab metadata and reloading live tabs across contexts', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const repository = new FakeBrowserTabsRepository()
    const service = new BrowserService(adapter, createContextRepository(), undefined, repository)

    const project = await service.getState(projectContext)
    await service.navigate({
      ...projectContext,
      tabId: project.activeTabId,
      input: 'https://example.com/account'
    })
    service.markNavigationCommitted(project.activeTabId, 'https://example.com/account')
    const projectSecond = await service.createTab({
      ...projectContext,
      input: 'https://example.com/docs'
    })
    const workspace = await service.createTab({
      ...workspaceContext,
      input: 'https://example.net/login'
    })
    service.markNavigationCommitted(workspace.activeTabId, 'https://example.net/login')

    const result = await service.clearData()

    expect(result).toEqual({
      status: 'cleared',
      cleared: ['cookies-and-site-storage', 'cache', 'temporary-grants'],
      failures: []
    })
    expect(adapter.reloaded).toEqual(
      expect.arrayContaining([
        project.activeTabId,
        projectSecond.activeTabId,
        workspace.activeTabId
      ])
    )
    expect(repository.contexts.get('session:project-session-1')?.map((tab) => tab.url)).toEqual([
      'https://example.com/account',
      'https://example.com/docs'
    ])
    expect(repository.contexts.get('session:workspace-1')?.map((tab) => tab.url)).toEqual([
      null,
      'https://example.net/login'
    ])
  })

  it('leaves lazily restored tabs unloaded when browser data is cleared', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const repository = new FakeBrowserTabsRepository([
      {
        context: projectContext.context,
        tabId: 'persisted-live-tab',
        order: 0,
        active: true,
        url: 'https://example.com/live'
      },
      {
        context: projectContext.context,
        tabId: 'persisted-lazy-tab',
        order: 1,
        active: false,
        url: 'https://example.com/lazy'
      }
    ])
    const service = new BrowserService(adapter, createContextRepository(), undefined, repository)

    await service.getState(projectContext)
    await service.show({
      ...projectContext,
      tabId: 'persisted-live-tab',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      shortcutBindings: []
    })
    adapter.loaded.length = 0

    await service.clearData()

    expect(adapter.reloaded).toEqual(['persisted-live-tab'])
    expect(adapter.loaded).toEqual([])
    expect(repository.contexts.get('session:project-session-1')?.map((tab) => tab.tabId)).toEqual([
      'persisted-live-tab',
      'persisted-lazy-tab'
    ])
  })

  it('reports partial clear failures without claiming a fully clean profile', async () => {
    const adapter = new FakeBrowserViewAdapter()
    adapter.clearResult = {
      status: 'partial-failure',
      cleared: ['cache', 'temporary-grants'],
      failures: [{ category: 'cookies-and-site-storage', message: 'storage failed' }]
    }
    const service = new BrowserService(adapter, createContextRepository())
    const state = await service.createTab({ ...workspaceContext, input: 'https://example.com' })

    const result = await service.clearData()

    expect(result).toEqual({
      status: 'partial-failure',
      cleared: ['cache', 'temporary-grants'],
      failures: [{ category: 'cookies-and-site-storage', message: 'storage failed' }]
    })
    expect(adapter.reloaded).toContain(state.activeTabId)
  })

  it('rejects reorder requests that omit, duplicate, or import tab ids', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const first = await service.getState(projectContext)
    await service.createTab(projectContext)

    await expect(
      service.reorderTabs({ ...projectContext, tabIds: [first.activeTabId] })
    ).rejects.toThrow(/contain each context tab exactly once/)
    await expect(
      service.reorderTabs({ ...projectContext, tabIds: [first.activeTabId, first.activeTabId] })
    ).rejects.toThrow(/contain each context tab exactly once/)
    await expect(
      service.reorderTabs({ ...projectContext, tabIds: [first.activeTabId, 'browser-tab-forged'] })
    ).rejects.toThrow(/contain each context tab exactly once/)
  })

  it('uses favicon and hostname title fallbacks for tabs', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const state = await service.navigate({ ...workspaceContext, input: 'https://example.com/path' })

    service.markTitleChanged(state.activeTabId, '')
    await service.markFaviconChanged(state.activeTabId, ['https://example.com/favicon.ico'])

    const current = await service.getState(workspaceContext)
    expect(current.tabs[0]).toMatchObject({
      title: 'example.com',
      faviconUrl: 'https://example.com/favicon.ico'
    })
  })

  it('stores securely loaded favicon data in the matching tab only', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const faviconLoader: BrowserFaviconLoader = {
      load: async () => 'data:image/png;base64,aWNvbg=='
    }
    const service = new BrowserService(
      adapter,
      createContextRepository(),
      undefined,
      undefined,
      faviconLoader
    )

    const state = await service.navigate({ ...projectContext, input: 'https://example.com/path' })
    await service.createTab({ ...projectContext, input: 'https://other.example/' })
    await service.markFaviconChanged(state.activeTabId, ['https://example.com/favicon.png'])

    expect(await service.getState(projectContext)).toMatchObject({
      tabs: [
        { id: state.activeTabId, faviconUrl: 'data:image/png;base64,aWNvbg==' },
        { faviconUrl: null }
      ]
    })
  })

  it('does not apply a favicon if navigation changes before secure loading completes', async () => {
    const adapter = new FakeBrowserViewAdapter()
    let resolveLoad: (faviconUrl: string | null) => void = () => {}
    const faviconLoader: BrowserFaviconLoader = {
      load: () => new Promise((resolve) => (resolveLoad = resolve))
    }
    const service = new BrowserService(
      adapter,
      createContextRepository(),
      undefined,
      undefined,
      faviconLoader
    )

    const state = await service.navigate({ ...projectContext, input: 'https://example.com/path' })
    const faviconPromise = service.markFaviconChanged(state.activeTabId, [
      'https://example.com/favicon.png'
    ])
    service.markNavigationCommitted(state.activeTabId, 'https://other.example/')
    resolveLoad('data:image/png;base64,aWNvbg==')
    await faviconPromise

    expect(await service.getState(projectContext)).toMatchObject({
      tabs: [{ url: 'https://other.example/', faviconUrl: null }]
    })
  })

  it('aborts a superseded favicon load before starting the replacement for the same tab', async () => {
    const adapter = new FakeBrowserViewAdapter()
    let firstSignal: AbortSignal | undefined
    let resolveFirst: (faviconUrl: string | null) => void = () => {}
    const faviconLoader: BrowserFaviconLoader = {
      load: vi.fn((async (_faviconUrls, options) => {
        if (!firstSignal) {
          firstSignal = options?.signal
          return new Promise<string | null>((resolve) => (resolveFirst = resolve))
        }
        return 'data:image/png;base64,bmV3LWljb24='
      }) satisfies BrowserFaviconLoader['load'])
    }
    const service = new BrowserService(
      adapter,
      createContextRepository(),
      undefined,
      undefined,
      faviconLoader
    )

    const state = await service.navigate({ ...projectContext, input: 'https://example.com/path' })
    const firstFavicon = service.markFaviconChanged(state.activeTabId, [
      'https://example.com/old.png'
    ])
    await service.markFaviconChanged(state.activeTabId, ['https://example.com/new.png'])
    resolveFirst('data:image/png;base64,b2xkLWljb24=')
    await firstFavicon

    expect(firstSignal?.aborted).toBe(true)
    expect(await service.getState(projectContext)).toMatchObject({
      tabs: [{ faviconUrl: 'data:image/png;base64,bmV3LWljb24=' }]
    })
  })

  it('does not apply an old-document favicon after same-URL committed navigation', async () => {
    const adapter = new FakeBrowserViewAdapter()
    let resolveLoad: (faviconUrl: string | null) => void = () => {}
    const faviconLoader: BrowserFaviconLoader = {
      load: () => new Promise((resolve) => (resolveLoad = resolve))
    }
    const service = new BrowserService(
      adapter,
      createContextRepository(),
      undefined,
      undefined,
      faviconLoader
    )

    const state = await service.navigate({ ...projectContext, input: 'https://a.example/' })
    service.markNavigationCommitted(state.activeTabId, 'https://a.example/')
    await service.navigate({ ...projectContext, tabId: state.activeTabId, input: 'https://b.example/' })
    const oldDocumentFavicon = service.markFaviconChanged(state.activeTabId, [
      'https://a.example/favicon.png'
    ])
    service.markNavigationCommitted(state.activeTabId, 'https://b.example/')
    resolveLoad('data:image/png;base64,b2xkLWljb24=')
    await oldDocumentFavicon

    expect(await service.getState(projectContext)).toMatchObject({
      tabs: [{ url: 'https://b.example/', faviconUrl: null }]
    })
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

  it('keeps every live tab while hiding or switching and destroys every tab when a multi-tab context is deleted', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const first = await service.show({
      ...workspaceContext,
      bounds: { x: 10, y: 20, width: 640, height: 480 },
      shortcutBindings: []
    })
    const second = await service.createTab({
      ...workspaceContext,
      input: 'https://second.example/'
    })
    const tabIds = second.tabs.map((tab) => tab.id)

    await service.hide(workspaceContext)
    expect(adapter.hidden).toEqual(tabIds)
    expect(adapter.destroyed).toEqual([])
    expect((await service.getState(workspaceContext)).tabs.map((tab) => tab.id)).toEqual(tabIds)

    await service.selectTab({ ...workspaceContext, tabId: first.activeTabId })
    await service.show({
      ...workspaceContext,
      bounds: { x: 20, y: 30, width: 320, height: 240 },
      shortcutBindings: []
    })
    expect(adapter.hidden.slice(-1)).toEqual([second.activeTabId])
    expect((await service.getState(workspaceContext)).tabs.map((tab) => tab.id)).toEqual(tabIds)

    await service.destroySessionContext('workspace-1')

    expect(adapter.destroyed).toEqual(tabIds)
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
