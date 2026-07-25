import { BrowserWindow, WebContentsView, type Input, type WebContents } from 'electron'

import { BROWSER_COMMAND_IDS, type BrowserBounds } from '../shared'
import {
  BROWSER_PARTITION,
  BROWSER_WEB_PREFERENCES,
  type BrowserService,
  type BrowserViewAdapter
} from './browser.service'

type BrowserViewRecord = {
  view: WebContentsView
  ownerWindow: BrowserWindow | null
  attachedWindow: BrowserWindow | null
}

export class ElectronBrowserViewAdapter implements BrowserViewAdapter {
  private readonly views = new Map<string, BrowserViewRecord>()
  private readonly activeTabByWindowId = new Map<number, string>()
  private readonly observedWindowIds = new Set<number>()
  private service: BrowserService | null = null

  setService(service: BrowserService): void {
    this.service = service
  }

  getOwnerWindows(): BrowserWindow[] {
    const windows = [...this.views.values()]
      .map((record) => record.ownerWindow)
      .filter((window): window is BrowserWindow => window !== null)
    return [...new Set(windows)]
  }

  createView(tabId: string, _options?: { partition: string; preferences: Record<string, unknown> }): void {
    const view = new WebContentsView({
      webPreferences: {
        ...BROWSER_WEB_PREFERENCES,
        partition: BROWSER_PARTITION
      }
    })
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    view.webContents.on('before-input-event', (event, input) => {
      const commandId = browserCommandForInput(input)
      if (!commandId) return
      event.preventDefault()
      this.service?.handleNativeCommand(tabId, commandId)
    })
    view.webContents.on('did-start-navigation', () => this.service?.markNavigationStarted(tabId))
    view.webContents.on('did-start-loading', () => this.service?.markNavigationStarted(tabId))
    view.webContents.on('did-stop-loading', () => this.service?.markNavigationStopped(tabId))
    view.webContents.on('did-navigate', (_event, url) =>
      this.service?.markNavigationCommitted(tabId, url, this.historyState(tabId))
    )
    view.webContents.on('did-navigate-in-page', (_event, url) =>
      this.service?.markNavigationCommitted(tabId, url, this.historyState(tabId))
    )
    view.webContents.on('did-fail-load', (_event, _code, description, validatedUrl, isMainFrame) => {
      if (!isMainFrame) return
      this.service?.markNavigationFailed(tabId, `${description}${validatedUrl ? `: ${validatedUrl}` : ''}`)
      this.service?.markHistoryChanged(tabId, this.historyState(tabId))
    })
    view.webContents.on('page-title-updated', (_event, title) =>
      this.service?.markTitleChanged(tabId, title)
    )
    this.views.set(tabId, { view, ownerWindow: null, attachedWindow: null })
  }

  showView(tabId: string, bounds: BrowserBounds, sender?: WebContents): void {
    const record = this.views.get(tabId)
    if (!record || !sender) return
    const window = BrowserWindow.fromWebContents(sender)
    if (!window) return

    const previouslyActiveTabId = this.activeTabByWindowId.get(window.id)
    if (previouslyActiveTabId && previouslyActiveTabId !== tabId) this.hideView(previouslyActiveTabId)

    if (record.attachedWindow && record.attachedWindow !== window) this.detachRecord(tabId, record)
    if (record.ownerWindow !== window) record.ownerWindow = window
    if (record.attachedWindow !== window) {
      window.contentView.addChildView(record.view)
      record.attachedWindow = window
      this.activeTabByWindowId.set(window.id, tabId)
      this.observeWindowClose(window)
    } else {
      this.activeTabByWindowId.set(window.id, tabId)
    }
    record.view.setBounds(bounds)
  }

  hideView(tabId: string): void {
    const record = this.views.get(tabId)
    if (!record?.attachedWindow) return
    this.detachRecord(tabId, record)
  }

  destroyView(tabId: string): void {
    const record = this.views.get(tabId)
    if (!record) return
    this.detachRecord(tabId, record)
    if (!record.view.webContents.isDestroyed()) record.view.webContents.close()
    this.views.delete(tabId)
  }

  loadUrl(tabId: string, url: string): void {
    const record = this.views.get(tabId)
    if (!record) return
    void record.view.webContents.loadURL(url)
  }

  goBack(tabId: string): void {
    const record = this.views.get(tabId)
    if (!record?.view.webContents.canGoBack()) return
    record.view.webContents.goBack()
  }

  goForward(tabId: string): void {
    const record = this.views.get(tabId)
    if (!record?.view.webContents.canGoForward()) return
    record.view.webContents.goForward()
  }

  reload(tabId: string): void {
    const record = this.views.get(tabId)
    if (!record) return
    record.view.webContents.reload()
  }

  stop(tabId: string): void {
    const record = this.views.get(tabId)
    if (!record) return
    record.view.webContents.stop()
  }

  private historyState(tabId: string): { canGoBack: boolean; canGoForward: boolean } {
    const webContents = this.views.get(tabId)?.view.webContents
    return {
      canGoBack: webContents?.canGoBack() ?? false,
      canGoForward: webContents?.canGoForward() ?? false
    }
  }

  private detachRecord(tabId: string, record: BrowserViewRecord): void {
    const window = record.attachedWindow
    if (!window) return
    window.contentView.removeChildView(record.view)
    if (this.activeTabByWindowId.get(window.id) === tabId) this.activeTabByWindowId.delete(window.id)
    record.attachedWindow = null
  }

  private observeWindowClose(window: BrowserWindow): void {
    if (this.observedWindowIds.has(window.id)) return
    this.observedWindowIds.add(window.id)
    window.once('closed', () => this.destroyViewsForWindow(window))
  }

  private destroyViewsForWindow(window: BrowserWindow): void {
    const destroyedTabIds: string[] = []
    for (const [tabId, record] of [...this.views.entries()]) {
      if (record.ownerWindow !== window) continue
      this.destroyView(tabId)
      destroyedTabIds.push(tabId)
    }
    if (destroyedTabIds.length > 0) this.service?.removeNativeClosedTabs(destroyedTabIds)
    this.activeTabByWindowId.delete(window.id)
    this.observedWindowIds.delete(window.id)
  }
}

function browserCommandForInput(input: Input): (typeof BROWSER_COMMAND_IDS)[keyof typeof BROWSER_COMMAND_IDS] | null {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return null
  const key = input.key.toLowerCase()
  const isMac = process.platform === 'darwin'

  if ((isMac ? input.meta && !input.control : input.control && !input.meta) && !input.alt && !input.shift && key === 'l') {
    return BROWSER_COMMAND_IDS.focusAddress
  }

  if ((isMac ? input.meta && !input.control : input.control && !input.meta) && !input.alt && !input.shift && key === 'r') {
    return BROWSER_COMMAND_IDS.reload
  }

  if (isMac) {
    if (input.meta && !input.control && !input.alt && !input.shift && key === '[') return BROWSER_COMMAND_IDS.back
    if (input.meta && !input.control && !input.alt && !input.shift && key === ']') return BROWSER_COMMAND_IDS.forward
    return null
  }

  if (input.alt && !input.control && !input.meta && !input.shift && key === 'arrowleft') return BROWSER_COMMAND_IDS.back
  if (input.alt && !input.control && !input.meta && !input.shift && key === 'arrowright') return BROWSER_COMMAND_IDS.forward

  return null
}
