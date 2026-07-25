import * as electron from 'electron'
import { type BrowserWindow, type Input, type WebContents } from 'electron'

import { type BrowserBounds, type BrowserShortcutBinding } from '../shared'
import {
  BROWSER_PARTITION,
  BROWSER_WEB_PREFERENCES,
  type BrowserService,
  type BrowserViewAdapter
} from './browser.service'
import { BrowserSecurityPolicy } from './browser.security-policy'

type BrowserViewRecord = {
  view: electron.WebContentsView
  ownerWindow: BrowserWindow | null
  attachedWindow: BrowserWindow | null
  shortcutBindings: BrowserShortcutBinding[]
  requestedUrl: string | null
}

export class ElectronBrowserViewAdapter implements BrowserViewAdapter {
  private readonly views = new Map<string, BrowserViewRecord>()
  private readonly activeTabByWindowId = new Map<number, string>()
  private readonly observedWindowIds = new Set<number>()
  private readonly securityPolicy: BrowserSecurityPolicy
  private service: BrowserService | null = null

  constructor(securityPolicy?: BrowserSecurityPolicy) {
    this.securityPolicy = securityPolicy ?? createNativeBrowserSecurityPolicy(() => this.activeOwnerWindow())
    this.installPermissionPolicy()
    this.installCertificatePolicy()
  }

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
    const view = new electron.WebContentsView({
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
    view.webContents.on('page-favicon-updated', (_event, favicons) =>
      this.service?.markFaviconChanged(tabId, favicons)
    )
    this.views.set(tabId, {
      view,
      ownerWindow: null,
      attachedWindow: null,
      shortcutBindings: [],
      requestedUrl: null
    })
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
    const window = electron.BrowserWindow.fromWebContents(sender)
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

  loadUrl(tabId: string, url: string, originalInput?: string): void {
    const record = this.views.get(tabId)
    if (!record) return
    record.requestedUrl = originalInput?.trim() || url
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

  private installPermissionPolicy(): void {
    if (!('session' in electron) || !('app' in electron)) return
    const install = (): void => {
      const browserSession = electron.session.fromPartition(BROWSER_PARTITION)
      browserSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        if (!webContents) return false
        const record = this.recordForWebContents(webContents)
        if (!record) return false
        return this.securityPolicy.checkPermission({
          requestingUrl: details.requestingUrl || details.securityOrigin || requestingOrigin || webContents.getURL(),
          permission,
          details: { mediaTypes: details.mediaType && details.mediaType !== 'unknown' ? [details.mediaType] : undefined },
          isBackground: !this.isRecordVisible(record)
        })
      })
      browserSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        const record = this.recordForWebContents(webContents)
        if (!record) {
          callback(false)
          return
        }
        void this.securityPolicy
          .requestPermission({
            requestingUrl: details.requestingUrl || webContents.getURL(),
            permission,
            details: { mediaTypes: 'mediaTypes' in details ? details.mediaTypes : undefined },
            isBackground: !this.isRecordVisible(record)
          })
          .then(callback, () => callback(false))
      })
    }
    if (electron.app.isReady()) install()
    else void electron.app.whenReady().then(install)
  }

  private installCertificatePolicy(): void {
    if (!('app' in electron)) return
    electron.app.on('certificate-error', (event, webContents, url, error, _certificate, callback) => {
      const record = this.recordForWebContents(webContents)
      if (!record) return
      event.preventDefault()
      void this.securityPolicy
        .requestCertificateException({ url: record.requestedUrl || webContents.getURL() || url, error })
        .then(callback, () => callback(false))
    })
  }

  private historyState(tabId: string): { canGoBack: boolean; canGoForward: boolean } {
    const webContents = this.views.get(tabId)?.view.webContents
    return {
      canGoBack: webContents?.canGoBack() ?? false,
      canGoForward: webContents?.canGoForward() ?? false
    }
  }

  private recordForWebContents(webContents: WebContents): BrowserViewRecord | null {
    for (const record of this.views.values()) {
      if (record.view.webContents === webContents) return record
    }
    return null
  }

  private activeOwnerWindow(): BrowserWindow | null {
    for (const record of this.views.values()) {
      if (record.attachedWindow) return record.attachedWindow
    }
    return null
  }

  private isRecordVisible(record: BrowserViewRecord): boolean {
    return record.attachedWindow !== null
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

function createNativeBrowserSecurityPolicy(ownerWindow: () => BrowserWindow | null): BrowserSecurityPolicy {
  return new BrowserSecurityPolicy(
    async ({ origin, capability }) => {
      const options = {
        type: 'question' as const,
        buttons: ['Allow for this app run', 'Deny'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: 'Allow website permission?',
        message: `Allow ${origin} to use ${capability}?`,
        detail: 'This decision applies only to this origin and capability until Space Zero exits.'
      }
      const window = ownerWindow()
      const result = window
        ? await electron.dialog.showMessageBox(window, options)
        : await electron.dialog.showMessageBox(options)
      return result.response === 0 ? 'allow' : 'deny'
    },
    async ({ origin, error }) => {
      const options = {
        type: 'warning' as const,
        buttons: ['Proceed for this app run', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: 'Proceed past local certificate warning?',
        message: `The local site ${origin} has an invalid certificate.`,
        detail: `${error}\n\nProceed only if you trust this local development server. This exception expires when Space Zero exits.`
      }
      const window = ownerWindow()
      const result = window
        ? await electron.dialog.showMessageBox(window, options)
        : await electron.dialog.showMessageBox(options)
      return result.response === 0 ? 'proceed' : 'cancel'
    }
  )
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
