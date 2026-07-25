import type { WebContents } from 'electron'
import { nanoid } from 'nanoid'

import type {
  BrowserBounds,
  BrowserCloseTabRequest,
  BrowserContext,
  BrowserContextRequest,
  BrowserNavigateRequest,
  BrowserPresentationRequest,
  BrowserState,
  BrowserTab,
  BrowserTabRequest
} from '../shared'

export const BROWSER_PARTITION = 'persist:spacezero-browser'

export const BROWSER_WEB_PREFERENCES = {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  webviewTag: false
} as const

export type BrowserViewAdapter = {
  createView: (
    tabId: string,
    options: { partition: string; preferences: Record<string, unknown> }
  ) => void
  showView: (tabId: string, bounds: BrowserBounds, sender?: WebContents) => void
  hideView: (tabId: string) => void
  destroyView: (tabId: string) => void
  loadUrl: (tabId: string, url: string) => void
  goBack: (tabId: string) => void
  goForward: (tabId: string) => void
  reload: (tabId: string) => void
  stop: (tabId: string) => void
}

export type BrowserExternalOpener = {
  openExternal: (url: string) => Promise<void>
}

export type BrowserContextRepository = {
  findSessionById: (sessionId: string) => Promise<
    | {
        id: string
        projectId: string | null
        archivedAt?: Date | null
        managedContext?: 'knowledge-base' | null
      }
    | undefined
  >
  findProjectById: (projectId: string) => Promise<
    | {
        id: string
        archivedAt?: Date | null
      }
    | undefined
  >
  getCurrentKnowledgeBaseSessionId: () => Promise<string | undefined>
}

type BrowserContextState = {
  contextKey: string
  activeTabId: string
  tabs: BrowserTab[]
}

export class BrowserService {
  private readonly contexts = new Map<string, BrowserContextState>()

  constructor(
    private readonly adapter: BrowserViewAdapter,
    private readonly contextRepository?: BrowserContextRepository,
    private readonly externalOpener?: BrowserExternalOpener
  ) {}

  async getState(request: BrowserContextRequest): Promise<BrowserState> {
    return toBrowserState(await this.getOrCreateContext(request))
  }

  async navigate(request: BrowserNavigateRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    const url = normalizeBrowserUrl(request.input)
    tab.url = url
    tab.error = null
    tab.isLoading = true
    this.adapter.loadUrl(tab.id, url)
    return toBrowserState(context)
  }

  async goBack(request: BrowserTabRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    if (tab.canGoBack) {
      tab.isLoading = true
      tab.error = null
      this.adapter.goBack(tab.id)
    }
    return toBrowserState(context)
  }

  async goForward(request: BrowserTabRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    if (tab.canGoForward) {
      tab.isLoading = true
      tab.error = null
      this.adapter.goForward(tab.id)
    }
    return toBrowserState(context)
  }

  async reload(request: BrowserTabRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    if (tab.url) {
      tab.isLoading = true
      tab.error = null
      this.adapter.reload(tab.id)
    }
    return toBrowserState(context)
  }

  async stop(request: BrowserTabRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    if (tab.isLoading) {
      this.adapter.stop(tab.id)
      tab.isLoading = false
    }
    return toBrowserState(context)
  }

  async openInDefaultBrowser(request: BrowserTabRequest): Promise<void> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    if (!tab.url) throw new Error('Browser tab has no page to open.')
    const url = normalizeExternalBrowserUrl(tab.url)
    if (!this.externalOpener) throw new Error('Default browser opening is not available.')
    await this.externalOpener.openExternal(url)
  }

  async show(request: BrowserPresentationRequest, sender?: WebContents): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    this.adapter.showView(tab.id, request.bounds, sender)
    return toBrowserState(context)
  }

  async hide(request: BrowserContextRequest): Promise<void> {
    const contextKey = await this.assertAuthorizedContext(request)
    const context = this.contexts.get(contextKey)
    for (const tab of context?.tabs ?? []) this.adapter.hideView(tab.id)
  }

  async closeTab(request: BrowserCloseTabRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = context.tabs.find((candidate) => candidate.id === request.tabId)
    if (tab) {
      this.adapter.destroyView(tab.id)
      context.tabs = context.tabs.filter((candidate) => candidate.id !== request.tabId)
    }
    if (context.tabs.length === 0) context.tabs.push(this.createBlankTab())
    context.activeTabId = context.tabs[0]?.id ?? context.activeTabId
    return toBrowserState(context)
  }

  destroyContext(context: BrowserContext): void {
    const contextKey = browserContextKey(context)
    const state = this.contexts.get(contextKey)
    if (!state) return
    for (const tab of state.tabs) this.adapter.destroyView(tab.id)
    this.contexts.delete(contextKey)
  }

  destroySessionContext(sessionId: string): void {
    const state = this.contexts.get(`session:${sessionId}`)
    if (!state) return
    for (const tab of state.tabs) this.adapter.destroyView(tab.id)
    this.contexts.delete(state.contextKey)
  }

  destroyProjectSessionContext(sessionId: string, projectId: string): void {
    this.destroyContext({ kind: 'project-session', projectId, sessionId })
  }

  destroyKnowledgeBaseContext(): void {
    this.destroyContext({ kind: 'knowledge-base' })
  }

  removeNativeClosedTabs(tabIds: string[]): void {
    const closedTabIds = new Set(tabIds)
    for (const [contextKey, context] of this.contexts.entries()) {
      const remainingTabs = context.tabs.filter((tab) => !closedTabIds.has(tab.id))
      if (remainingTabs.length === context.tabs.length) continue
      if (remainingTabs.length === 0) {
        this.contexts.delete(contextKey)
        continue
      }
      context.tabs = remainingTabs
      if (closedTabIds.has(context.activeTabId)) context.activeTabId = remainingTabs[0]?.id ?? context.activeTabId
    }
  }

  markNavigationStarted(tabId: string): void {
    const tab = this.findTab(tabId)
    if (!tab) return
    tab.isLoading = true
    tab.error = null
  }

  markNavigationCommitted(tabId: string, url: string, history?: { canGoBack: boolean; canGoForward: boolean }): void {
    const tab = this.findTab(tabId)
    if (!tab) return
    tab.url = url
    tab.error = null
    tab.isLoading = false
    if (history) {
      tab.canGoBack = history.canGoBack
      tab.canGoForward = history.canGoForward
    }
  }

  markNavigationFailed(tabId: string, error: string): void {
    const tab = this.findTab(tabId)
    if (!tab) return
    tab.error = error
    tab.isLoading = false
  }

  markNavigationStopped(tabId: string): void {
    const tab = this.findTab(tabId)
    if (!tab) return
    tab.isLoading = false
  }

  markHistoryChanged(tabId: string, history: { canGoBack: boolean; canGoForward: boolean }): void {
    const tab = this.findTab(tabId)
    if (!tab) return
    tab.canGoBack = history.canGoBack
    tab.canGoForward = history.canGoForward
  }

  markTitleChanged(tabId: string, title: string): void {
    const tab = this.findTab(tabId)
    if (!tab) return
    tab.title = title || tab.url
  }

  disposeAll(): void {
    for (const context of this.contexts.values()) {
      for (const tab of context.tabs) this.adapter.destroyView(tab.id)
    }
    this.contexts.clear()
  }

  private async getOrCreateContext(request: BrowserContextRequest): Promise<BrowserContextState> {
    const contextKey = await this.assertAuthorizedContext(request)
    let context = this.contexts.get(contextKey)
    if (!context) {
      const tab = this.createBlankTab()
      context = { contextKey, activeTabId: tab.id, tabs: [tab] }
      this.contexts.set(contextKey, context)
    }
    return context
  }

  private createBlankTab(): BrowserTab {
    const tab: BrowserTab = {
      id: `browser-tab-${nanoid()}`,
      url: null,
      title: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      error: null
    }
    this.adapter.createView(tab.id, {
      partition: BROWSER_PARTITION,
      preferences: BROWSER_WEB_PREFERENCES
    })
    return tab
  }

  private resolveTab(context: BrowserContextState, requestedTabId: string | undefined): BrowserTab {
    const tab = context.tabs.find((candidate) => candidate.id === requestedTabId) ?? context.tabs[0]
    if (!tab) throw new Error('Browser context has no active tab.')
    context.activeTabId = tab.id
    return tab
  }

  private findTab(tabId: string): BrowserTab | undefined {
    for (const context of this.contexts.values()) {
      const tab = context.tabs.find((candidate) => candidate.id === tabId)
      if (tab) return tab
    }
    return undefined
  }

  private async assertAuthorizedContext(request: BrowserContextRequest): Promise<string> {
    const expectedKey = browserContextKey(request.context)
    if (request.contextKey !== expectedKey) throw new Error('Browser context is not authorized.')
    if (!this.contextRepository) return expectedKey

    switch (request.context.kind) {
      case 'project-session': {
        const session = await this.contextRepository.findSessionById(request.context.sessionId)
        if (!session || session.archivedAt) throw new Error('Browser context is not authorized.')
        if (session.managedContext || session.projectId !== request.context.projectId) {
          throw new Error('Browser context is not authorized.')
        }
        const project = await this.contextRepository.findProjectById(request.context.projectId)
        if (!project || project.archivedAt) throw new Error('Browser context is not authorized.')
        return expectedKey
      }
      case 'workspace-session': {
        const session = await this.contextRepository.findSessionById(request.context.sessionId)
        if (!session || session.archivedAt || session.projectId || session.managedContext) {
          throw new Error('Browser context is not authorized.')
        }
        return expectedKey
      }
      case 'knowledge-base': {
        const currentSessionId = await this.contextRepository.getCurrentKnowledgeBaseSessionId()
        if (!currentSessionId) throw new Error('Browser context is not authorized.')
        const session = await this.contextRepository.findSessionById(currentSessionId)
        if (!session || session.archivedAt || session.projectId || session.managedContext !== 'knowledge-base') {
          throw new Error('Browser context is not authorized.')
        }
        return expectedKey
      }
    }
  }
}

export function assertAuthorizedContext(request: BrowserContextRequest): string {
  const expectedKey = browserContextKey(request.context)
  if (request.contextKey !== expectedKey) throw new Error('Browser context is not authorized.')
  return expectedKey
}

export function browserContextKey(context: BrowserContext): string {
  switch (context.kind) {
    case 'project-session':
    case 'workspace-session':
      return `session:${context.sessionId}`
    case 'knowledge-base':
      return 'knowledge-base'
  }
}

export function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Enter a URL or search terms.')

  if (hasExplicitScheme(trimmed)) {
    return normalizeExplicitHttpUrl(trimmed)
  }

  if (isLoopbackAddress(trimmed)) {
    return normalizeExplicitHttpUrl(`http://${trimmed}`)
  }

  return googleSearchUrl(trimmed)
}

export function normalizeExternalBrowserUrl(input: string): string {
  const url = new URL(input)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS pages can be opened in the default browser.')
  }
  if (!url.hostname) throw new Error('Only HTTP and HTTPS pages can be opened in the default browser.')
  return url.toString()
}

function normalizeExplicitHttpUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error('Enter a valid HTTP, HTTPS, localhost, or loopback URL.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS pages can be loaded in Browser.')
  }
  if (!url.hostname) throw new Error('Enter a valid HTTP, HTTPS, localhost, or loopback URL.')
  return url.toString()
}

function hasExplicitScheme(input: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(input) && !isBareLoopbackWithPort(input)
}

function isLoopbackAddress(input: string): boolean {
  return (
    input.startsWith('localhost') ||
    input.startsWith('127.') ||
    input.startsWith('[::1]') ||
    input === '::1'
  )
}

function isBareLoopbackWithPort(input: string): boolean {
  return /^(?:localhost|127\.\d+\.\d+\.\d+|\[::1\]):\d+/i.test(input)
}

function googleSearchUrl(input: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`
}

function toBrowserState(context: BrowserContextState): BrowserState {
  return {
    contextKey: context.contextKey,
    activeTabId: context.activeTabId,
    tabs: context.tabs.map((tab) => ({ ...tab }))
  }
}
