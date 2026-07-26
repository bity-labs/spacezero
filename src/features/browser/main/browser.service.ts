import type { WebContents } from 'electron'
import { nanoid } from 'nanoid'

import { BROWSER_COMMAND_IDS, browserContextKey } from '../shared'
import type {
  BrowserBounds,
  BrowserCloseTabRequest,
  BrowserContext,
  BrowserContextRequest,
  BrowserCreateTabRequest,
  BrowserEvent,
  BrowserNavigateRequest,
  BrowserOpenUrlInDefaultBrowserRequest,
  BrowserPresentationRequest,
  BrowserReorderTabsRequest,
  BrowserSelectTabRequest,
  BrowserShortcutBinding,
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
  showView: (
    tabId: string,
    bounds: BrowserBounds,
    shortcutBindings: BrowserShortcutBinding[],
    sender?: WebContents
  ) => void
  hideView: (tabId: string) => void
  destroyView: (tabId: string) => void
  loadUrl: (tabId: string, url: string, originalInput?: string) => void
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

type BrowserRuntimeTab = BrowserTab & {
  restoredUrl: string | null
  hasLoadedRestoredUrl: boolean
}

type BrowserContextState = {
  context: BrowserContext
  contextKey: string
  activeTabId: string
  tabs: BrowserRuntimeTab[]
}

export type BrowserPersistedTab = {
  context: BrowserContext
  tabId: string
  order: number
  active: boolean
  url: string | null
}

export type BrowserTabsRepository = {
  listByContext: (context: BrowserContext) => Promise<BrowserPersistedTab[]>
  replaceContext: (context: BrowserContext, tabs: BrowserPersistedTab[]) => Promise<void> | void
  deleteContext: (context: BrowserContext) => Promise<void> | void
  deleteContextKey: (contextKey: string) => Promise<void> | void
}

type BrowserEventListener = (event: BrowserEvent) => void

export class BrowserService {
  private readonly contexts = new Map<string, BrowserContextState>()
  private readonly listeners = new Set<BrowserEventListener>()

  constructor(
    private readonly adapter: BrowserViewAdapter,
    private readonly contextRepository?: BrowserContextRepository,
    private readonly externalOpener?: BrowserExternalOpener,
    private readonly tabsRepository?: BrowserTabsRepository
  ) {}

  async getState(request: BrowserContextRequest): Promise<BrowserState> {
    return toBrowserState(await this.getOrCreateContext(request))
  }

  async navigate(request: BrowserNavigateRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    const url = normalizeBrowserUrl(request.input)
    tab.url = url
    tab.restoredUrl = null
    tab.hasLoadedRestoredUrl = true
    clearPageMetadata(tab)
    tab.error = null
    tab.isLoading = true
    this.adapter.loadUrl(tab.id, url, request.input)
    return this.publishState(context)
  }

  async goBack(request: BrowserTabRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    if (tab.canGoBack) {
      tab.isLoading = true
      tab.error = null
      this.adapter.goBack(tab.id)
    }
    return this.publishState(context)
  }

  async goForward(request: BrowserTabRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    if (tab.canGoForward) {
      tab.isLoading = true
      tab.error = null
      this.adapter.goForward(tab.id)
    }
    return this.publishState(context)
  }

  async reload(request: BrowserTabRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    if (tab.url) {
      tab.isLoading = true
      tab.error = null
      this.adapter.reload(tab.id)
    }
    return this.publishState(context)
  }

  async stop(request: BrowserTabRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    if (tab.isLoading) {
      this.adapter.stop(tab.id)
      tab.isLoading = false
    }
    return this.publishState(context)
  }

  async openInDefaultBrowser(request: BrowserTabRequest): Promise<void> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    if (!tab.url) throw new Error('Browser tab has no page to open.')
    await this.openUrlInDefaultBrowser({ url: tab.url })
  }

  async openUrlInDefaultBrowser(request: BrowserOpenUrlInDefaultBrowserRequest): Promise<void> {
    const url = normalizeExternalBrowserUrl(request.url)
    if (!this.externalOpener) throw new Error('Default browser opening is not available.')
    await this.externalOpener.openExternal(url)
  }

  async show(request: BrowserPresentationRequest, sender?: WebContents): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.resolveTab(context, request.tabId)
    const loadedRestoredTab = this.loadRestoredTabIfNeeded(tab)
    for (const otherTab of context.tabs) {
      if (otherTab.id !== tab.id) this.adapter.hideView(otherTab.id)
    }
    this.adapter.showView(tab.id, request.bounds, request.shortcutBindings, sender)
    if (loadedRestoredTab) return this.publishState(context)
    return toBrowserState(context)
  }

  async hide(request: BrowserContextRequest): Promise<void> {
    const contextKey = await this.assertAuthorizedContext(request)
    const context = this.contexts.get(contextKey)
    for (const tab of context?.tabs ?? []) this.adapter.hideView(tab.id)
  }

  async createTab(request: BrowserCreateTabRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = this.createBlankTab()
    context.tabs.push(tab)
    context.activeTabId = tab.id
    if (request.input) {
      const url = normalizeBrowserUrl(request.input)
      tab.url = url
      tab.restoredUrl = null
      tab.hasLoadedRestoredUrl = true
      clearPageMetadata(tab)
      tab.error = null
      tab.isLoading = true
      this.adapter.loadUrl(tab.id, url, request.input)
    }
    return this.publishState(context)
  }

  async selectTab(request: BrowserSelectTabRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const tab = context.tabs.find((candidate) => candidate.id === request.tabId)
    if (!tab) throw new Error('Browser tab is not authorized for this context.')
    context.activeTabId = tab.id
    this.loadRestoredTabIfNeeded(tab)
    return this.publishState(context)
  }

  async closeTab(request: BrowserCloseTabRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const closingIndex = context.tabs.findIndex((candidate) => candidate.id === request.tabId)
    const tab = context.tabs[closingIndex]
    if (tab) {
      this.adapter.destroyView(tab.id)
      context.tabs = context.tabs.filter((candidate) => candidate.id !== request.tabId)
      if (context.activeTabId === request.tabId) {
        const nextTab = context.tabs[Math.min(closingIndex, context.tabs.length - 1)]
        context.activeTabId = nextTab?.id ?? context.activeTabId
      }
    }
    if (context.tabs.length === 0) {
      const blank = this.createBlankTab()
      context.tabs.push(blank)
      context.activeTabId = blank.id
    } else if (!context.tabs.some((candidate) => candidate.id === context.activeTabId)) {
      context.activeTabId = context.tabs[0]?.id ?? context.activeTabId
    }
    return this.publishState(context)
  }

  async reorderTabs(request: BrowserReorderTabsRequest): Promise<BrowserState> {
    const context = await this.getOrCreateContext(request)
    const requestedIds = new Set(request.tabIds)
    if (requestedIds.size !== request.tabIds.length || requestedIds.size !== context.tabs.length) {
      throw new Error('Browser tab order must contain each context tab exactly once.')
    }
    const tabsById = new Map(context.tabs.map((tab) => [tab.id, tab]))
    const reorderedTabs = request.tabIds.map((tabId) => tabsById.get(tabId))
    if (reorderedTabs.some((tab) => !tab)) {
      throw new Error('Browser tab order must contain each context tab exactly once.')
    }
    context.tabs = reorderedTabs as BrowserRuntimeTab[]
    return this.publishState(context)
  }

  closeContext(context: BrowserContext): void {
    this.closeContextKey(browserContextKey(context))
  }

  closeSessionContext(sessionId: string): void {
    this.closeContextKey(`session:${sessionId}`)
  }

  closeKnowledgeBaseContext(): void {
    this.closeContextKey(browserContextKey({ kind: 'knowledge-base' }))
  }

  async destroyContext(context: BrowserContext): Promise<void> {
    this.closeContext(context)
    await this.tabsRepository?.deleteContext(context)
  }

  async destroySessionContext(sessionId: string): Promise<void> {
    const contextKey = `session:${sessionId}`
    this.closeContextKey(contextKey)
    await this.tabsRepository?.deleteContextKey(contextKey)
  }

  async destroyProjectSessionContext(sessionId: string, projectId: string): Promise<void> {
    await this.destroyContext({ kind: 'project-session', projectId, sessionId })
  }

  async destroyKnowledgeBaseContext(): Promise<void> {
    await this.destroyContext({ kind: 'knowledge-base' })
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
      if (closedTabIds.has(context.activeTabId))
        context.activeTabId = remainingTabs[0]?.id ?? context.activeTabId
      this.publishState(context)
    }
  }

  onEvent(listener: BrowserEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  markNavigationStarted(tabId: string): void {
    const found = this.findTabWithContext(tabId)
    if (!found) return
    found.tab.isLoading = true
    found.tab.error = null
    this.publishState(found.context)
  }

  markNavigationCommitted(
    tabId: string,
    url: string,
    history?: { canGoBack: boolean; canGoForward: boolean }
  ): void {
    const found = this.findTabWithContext(tabId)
    if (!found) return
    if (found.tab.url !== url) {
      found.tab.url = url
      clearPageMetadata(found.tab)
    } else {
      found.tab.url = url
    }
    found.tab.restoredUrl = null
    found.tab.hasLoadedRestoredUrl = true
    found.tab.error = null
    if (history) {
      found.tab.canGoBack = history.canGoBack
      found.tab.canGoForward = history.canGoForward
    }
    this.publishState(found.context)
  }

  markNavigationFailed(tabId: string, error: string): void {
    const found = this.findTabWithContext(tabId)
    if (!found) return
    clearPageMetadata(found.tab)
    found.tab.error = error
    found.tab.isLoading = false
    this.publishState(found.context)
  }

  markNavigationStopped(tabId: string): void {
    const found = this.findTabWithContext(tabId)
    if (!found) return
    found.tab.isLoading = false
    this.publishState(found.context)
  }

  markHistoryChanged(tabId: string, history: { canGoBack: boolean; canGoForward: boolean }): void {
    const found = this.findTabWithContext(tabId)
    if (!found) return
    found.tab.canGoBack = history.canGoBack
    found.tab.canGoForward = history.canGoForward
    this.publishState(found.context)
  }

  markTitleChanged(tabId: string, title: string): void {
    const found = this.findTabWithContext(tabId)
    if (!found) return
    found.tab.title = title || fallbackTitleForUrl(found.tab.url)
    this.publishState(found.context)
  }

  markFaviconChanged(tabId: string, faviconUrls: string[]): void {
    const found = this.findTabWithContext(tabId)
    if (!found) return
    found.tab.faviconUrl = faviconUrls[0] ?? null
    this.publishState(found.context)
  }

  openNativeRequestedTab(parentTabId: string, url: string): BrowserState | undefined {
    const found = this.findTabWithContext(parentTabId)
    if (!found) return undefined
    const tab = this.createBlankTab()
    found.context.tabs.push(tab)
    found.context.activeTabId = tab.id
    tab.url = url
    clearPageMetadata(tab)
    tab.error = null
    tab.isLoading = true
    this.adapter.loadUrl(tab.id, url, url)
    return this.publishState(found.context)
  }

  handleNativeCommand(
    tabId: string,
    commandId: (typeof BROWSER_COMMAND_IDS)[keyof typeof BROWSER_COMMAND_IDS]
  ): void {
    const found = this.findTabWithContext(tabId)
    if (!found) return
    switch (commandId) {
      case BROWSER_COMMAND_IDS.focusAddress:
      case BROWSER_COMMAND_IDS.newTab:
      case BROWSER_COMMAND_IDS.closeActiveTab:
        this.publishCommand(found.context, commandId)
        return
      case BROWSER_COMMAND_IDS.reload:
        if (!found.tab.url) return
        found.tab.isLoading = true
        found.tab.error = null
        this.adapter.reload(found.tab.id)
        this.publishState(found.context)
        return
      case BROWSER_COMMAND_IDS.back:
        if (!found.tab.canGoBack) return
        found.tab.isLoading = true
        found.tab.error = null
        this.adapter.goBack(found.tab.id)
        this.publishState(found.context)
        return
      case BROWSER_COMMAND_IDS.forward:
        if (!found.tab.canGoForward) return
        found.tab.isLoading = true
        found.tab.error = null
        this.adapter.goForward(found.tab.id)
        this.publishState(found.context)
        return
    }
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
      context = await this.restoreContext(request.context, contextKey)
      this.contexts.set(contextKey, context)
    }
    return context
  }

  private async restoreContext(
    context: BrowserContext,
    contextKey: string
  ): Promise<BrowserContextState> {
    const persistedTabs = (await this.tabsRepository?.listByContext(context)) ?? []
    const validTabs = persistedTabs.flatMap((tab) => {
      if (!tab.context || !tab.tabId) return []
      const url = normalizePersistedBrowserUrl(tab.url)
      if (url === undefined) return []
      return [{ ...tab, url }]
    })
    if (validTabs.length === 0) {
      const tab = this.createBlankTab()
      const state = { context, contextKey, activeTabId: tab.id, tabs: [tab] }
      await this.persistContext(state)
      return state
    }

    const tabs = validTabs.map((tab) => this.createRestoredTab(tab.tabId, tab.url))
    const activeTab = validTabs.find((tab) => tab.active)?.tabId
    const activeTabId =
      activeTab && tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0].id
    return { context, contextKey, activeTabId, tabs }
  }

  private createBlankTab(): BrowserRuntimeTab {
    return this.createRuntimeTab(`browser-tab-${nanoid()}`, null, true)
  }

  private createRestoredTab(tabId: string, url: string | null): BrowserRuntimeTab {
    return this.createRuntimeTab(tabId, url, !url)
  }

  private createRuntimeTab(
    tabId: string,
    url: string | null,
    hasLoadedRestoredUrl: boolean
  ): BrowserRuntimeTab {
    const tab: BrowserRuntimeTab = {
      id: tabId,
      url,
      title: null,
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      error: null,
      restoredUrl: url,
      hasLoadedRestoredUrl
    }
    this.adapter.createView(tab.id, {
      partition: BROWSER_PARTITION,
      preferences: BROWSER_WEB_PREFERENCES
    })
    return tab
  }

  private closeContextKey(contextKey: string): void {
    const state = this.contexts.get(contextKey)
    if (!state) return
    for (const tab of state.tabs) this.adapter.destroyView(tab.id)
    this.contexts.delete(contextKey)
  }

  private loadRestoredTabIfNeeded(tab: BrowserRuntimeTab): boolean {
    if (!tab.restoredUrl || tab.hasLoadedRestoredUrl) return false
    tab.hasLoadedRestoredUrl = true
    tab.isLoading = true
    tab.error = null
    tab.canGoBack = false
    tab.canGoForward = false
    this.adapter.loadUrl(tab.id, tab.restoredUrl)
    return true
  }

  private resolveTab(
    context: BrowserContextState,
    requestedTabId: string | undefined
  ): BrowserRuntimeTab {
    const tab =
      context.tabs.find((candidate) => candidate.id === requestedTabId) ??
      context.tabs.find((candidate) => candidate.id === context.activeTabId) ??
      context.tabs[0]
    if (!tab) throw new Error('Browser context has no active tab.')
    context.activeTabId = tab.id
    return tab
  }

  private findTabWithContext(
    tabId: string
  ): { context: BrowserContextState; tab: BrowserRuntimeTab } | undefined {
    for (const context of this.contexts.values()) {
      const tab = context.tabs.find((candidate) => candidate.id === tabId)
      if (tab) return { context, tab }
    }
    return undefined
  }

  private publishState(context: BrowserContextState): BrowserState {
    const state = toBrowserState(context)
    void this.persistContext(context)
    this.publishEvent({ type: 'state-changed', contextKey: context.contextKey, state })
    return state
  }

  private async persistContext(context: BrowserContextState): Promise<void> {
    await this.tabsRepository?.replaceContext(
      context.context,
      context.tabs.map((tab, order) => ({
        context: context.context,
        tabId: tab.id,
        order,
        active: tab.id === context.activeTabId,
        url: tab.url
      }))
    )
  }

  private publishCommand(
    context: BrowserContextState,
    commandId: (typeof BROWSER_COMMAND_IDS)[keyof typeof BROWSER_COMMAND_IDS]
  ): void {
    this.publishEvent({ type: 'command-requested', contextKey: context.contextKey, commandId })
  }

  private publishEvent(event: BrowserEvent): void {
    for (const listener of this.listeners) listener(event)
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
        if (
          !session ||
          session.archivedAt ||
          session.projectId ||
          session.managedContext !== 'knowledge-base'
        ) {
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

export function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Enter a URL or search terms.')

  if (hasExplicitScheme(trimmed)) {
    return normalizeExplicitHttpUrl(trimmed)
  }

  if (isLoopbackAddress(trimmed)) {
    return normalizeExplicitHttpUrl(`http://${trimmed}`)
  }

  if (isRecognizableWebAddress(trimmed)) {
    return normalizeExplicitHttpUrl(`https://${trimmed}`)
  }

  return googleSearchUrl(trimmed)
}

export function normalizeExternalBrowserUrl(input: string): string {
  const url = new URL(input)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS pages can be opened in the default browser.')
  }
  if (!url.hostname)
    throw new Error('Only HTTP and HTTPS pages can be opened in the default browser.')
  return url.toString()
}

function normalizePersistedBrowserUrl(input: string | null): string | null | undefined {
  if (input === null) return null
  try {
    return normalizeExternalBrowserUrl(input)
  } catch {
    return undefined
  }
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
  return (
    /^[a-z][a-z\d+.-]*:/i.test(input) &&
    !isBareLoopbackWithPort(input) &&
    !isBareWebAddressWithPort(input)
  )
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

function isBareWebAddressWithPort(input: string): boolean {
  const hostAndPort = input.split(/[/?#]/, 1)[0]
  if (!hostAndPort || !/^.+:\d+$/.test(hostAndPort)) return false
  return isRecognizableWebAddress(input)
}

function isRecognizableWebAddress(input: string): boolean {
  if (/\s/.test(input)) return false
  if (input.includes('@')) return false
  const candidate = input.split(/[/?#]/, 1)[0]
  if (!candidate || candidate.startsWith('.') || candidate.endsWith('.')) return false
  const host = candidate.split(':', 1)[0]
  if (!host || host.startsWith('-') || host.endsWith('-')) return false
  const labels = host.split('.')
  if (labels.length < 2) return false
  const tld = labels[labels.length - 1]
  if (!tld || !/^[a-z]{2,63}$/i.test(tld)) return false
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
}

function googleSearchUrl(input: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`
}

function fallbackTitleForUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.hostname || parsed.toString()
  } catch {
    return url
  }
}

function clearPageMetadata(tab: BrowserTab): void {
  tab.title = null
  tab.faviconUrl = null
}

function toBrowserState(context: BrowserContextState): BrowserState {
  return {
    contextKey: context.contextKey,
    activeTabId: context.activeTabId,
    tabs: context.tabs.map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      faviconUrl: tab.faviconUrl,
      isLoading: tab.isLoading,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      error: tab.error
    }))
  }
}
