import { BrowserWindow, WebContentsView, type Input, type WebContents } from 'electron'

import { type BrowserBounds, type BrowserShortcutBinding } from '../shared'
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
  shortcutBindings: BrowserShortcutBinding[]
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
      const commandId = browserCommandForInput(input, this.views.get(tabId)?.shortcutBindings ?? [])
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
    this.views.set(tabId, { view, ownerWindow: null, attachedWindow: null, shortcutBindings: [] })
  }

  showView(
    tabId: string,
    bounds: BrowserBounds,
    shortcutBindings: BrowserShortcutBinding[],
    sender?: WebContents
  ): void {
    const record = this.views.get(tabId)
    if (!record || !sender) return
    record.shortcutBindings = shortcutBindings
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

function browserCommandForInput(
  input: Input,
  shortcutBindings: BrowserShortcutBinding[]
): BrowserShortcutBinding['commandId'] | null {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return null

  for (const shortcutBinding of shortcutBindings) {
    if (inputMatchesKeybinding(input, shortcutBinding.keybinding.normalized)) return shortcutBinding.commandId
  }

  return null
}

function inputMatchesKeybinding(input: Input, normalized: string): boolean {
  const tokens = normalized.toLowerCase().split('+').map((token) => token.trim())
  const key = tokens.pop()
  if (!key || input.key.toLowerCase() !== key) return false

  const modifiers = new Set(tokens)
  if ([...modifiers].some((modifier) => !['mod', 'ctrl', 'alt', 'shift'].includes(modifier))) return false
  const wantsMod = modifiers.has('mod')
  const wantsCtrl = modifiers.has('ctrl')
  const wantsAlt = modifiers.has('alt')
  const wantsShift = modifiers.has('shift')
  const isMac = process.platform === 'darwin'

  if (isMac) {
    if (input.meta !== wantsMod) return false
    if (input.control !== wantsCtrl) return false
  } else if (input.control !== (wantsMod || wantsCtrl)) {
    return false
  }

  return input.alt === wantsAlt && input.shift === wantsShift
}
