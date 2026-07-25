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
    expect(() => normalizeBrowserUrl('file:///etc/passwd')).toThrow(/Only HTTP, HTTPS, and loopback URLs/)
    expect(() => normalizeBrowserUrl('spacezero://settings')).toThrow(/Only HTTP, HTTPS, and loopback URLs/)
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
    expect(adapter.loaded).toEqual([{ id: blank.activeTabId, url: 'http://localhost:4173/' }])
  })

  it('hides and cleans up native content by context lifecycle', async () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter, createContextRepository())
    const state = await service.show({
      ...workspaceContext,
      bounds: { x: 10, y: 20, width: 640, height: 480 }
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
      bounds: { x: 10, y: 20, width: 640, height: 480 }
    })

    expect(reopened.activeTabId).not.toBe(state.activeTabId)
    expect(reopened.tabs).toHaveLength(1)
    expect(adapter.created.map((tab) => tab.id)).toEqual([state.activeTabId, reopened.activeTabId])
    expect(adapter.shown).toEqual([
      { id: reopened.activeTabId, bounds: { x: 10, y: 20, width: 640, height: 480 } }
    ])
  })
})
