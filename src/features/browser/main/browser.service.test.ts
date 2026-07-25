import { describe, expect, it } from 'vitest'

import { BrowserService, normalizeBrowserUrl, type BrowserViewAdapter } from './browser.service'

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

const projectContext = {
  contextKey: 'session:project-session-1',
  context: { kind: 'project-session' as const, projectId: 'project-1', sessionId: 'project-session-1' }
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
  it('creates one blank tab per authenticated context using the dedicated profile', () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter)

    const state = service.getState(projectContext)

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

  it('rejects forged context keys before creating native content', () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter)

    expect(() =>
      service.getState({
        contextKey: 'session:other',
        context: { kind: 'workspace-session', sessionId: 'workspace-1' }
      })
    ).toThrow(/Browser context is not authorized/)
    expect(adapter.created).toEqual([])
  })

  it('loads validated URLs and never lets renderer choose a native content id', () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter)
    const blank = service.getState(projectContext)

    const state = service.navigate({ ...projectContext, tabId: 'forged-tab-id', input: 'localhost:4173' })

    expect(state.activeTabId).toBe(blank.activeTabId)
    expect(state.tabs[0]?.url).toBe('http://localhost:4173/')
    expect(adapter.loaded).toEqual([{ id: blank.activeTabId, url: 'http://localhost:4173/' }])
  })

  it('hides and cleans up native content by context lifecycle', () => {
    const adapter = new FakeBrowserViewAdapter()
    const service = new BrowserService(adapter)
    const state = service.show({
      ...projectContext,
      bounds: { x: 10, y: 20, width: 640, height: 480 }
    })

    service.hide(projectContext)
    const closed = service.closeTab({ ...projectContext, tabId: state.activeTabId })

    expect(adapter.shown).toEqual([
      { id: state.activeTabId, bounds: { x: 10, y: 20, width: 640, height: 480 } }
    ])
    expect(adapter.hidden).toEqual([state.activeTabId])
    expect(adapter.destroyed).toEqual([state.activeTabId])
    expect(closed.tabs).toHaveLength(1)
    expect(closed.tabs[0]?.url).toBeNull()
  })
})
