import * as electron from 'electron'
import { type BrowserWindow, type Input, type WebContents } from 'electron'

import {
  type BrowserBounds,
  type BrowserClearDataCategory,
  type BrowserClearDataFailure,
  type BrowserClearDataResult,
  type BrowserShortcutBinding
} from '../shared'
import {
  BROWSER_PARTITION,
  BROWSER_WEB_PREFERENCES,
  type BrowserService,
  type BrowserViewAdapter
} from './browser.service'
import type { BrowserDownloadsService } from './browser-downloads.service'
import { BrowserSecurityPolicy } from './browser.security-policy'

type BrowserChildWindow = BrowserWindow & {
  webContents?: Pick<WebContents, 'setWindowOpenHandler'>
  close?: () => void
  destroy?: () => void
  isDestroyed?: () => boolean
}

type PendingWindowOpenGesture = {
  url: string
  userGesture: boolean
  observedAt: number
}

type BrowserViewRecord = {
  view: electron.WebContentsView
  ownerWindow: BrowserWindow | null
  attachedWindow: BrowserWindow | null
  shortcutBindings: BrowserShortcutBinding[]
  requestedUrl: string | null
  childWindows: Set<BrowserChildWindow>
  pendingWindowOpenGestures: PendingWindowOpenGesture[]
}

export class ElectronBrowserViewAdapter implements BrowserViewAdapter {
  private readonly views = new Map<string, BrowserViewRecord>()
  private readonly activeTabByWindowId = new Map<number, string>()
  private readonly observedWindowIds = new Set<number>()
  private readonly securityPolicy: BrowserSecurityPolicy
  private service: BrowserService | null = null

  constructor(
    securityPolicy?: BrowserSecurityPolicy,
    private readonly downloadsService?: BrowserDownloadsService,
    private readonly platform: NodeJS.Platform = process.platform
  ) {
    this.securityPolicy =
      securityPolicy ?? createNativeBrowserSecurityPolicy(() => this.activeOwnerWindow())
    this.installPermissionPolicy()
    this.installCertificatePolicy()
    this.installDownloadPolicy()
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

  createView(
    tabId: string,
    _options?: { partition: string; preferences: Record<string, unknown> }
  ): void {
    const view = new electron.WebContentsView({
      webPreferences: {
        ...BROWSER_WEB_PREFERENCES,
        partition: BROWSER_PARTITION
      }
    })
    this.installWindowOpenGestureObserver(view.webContents)
    view.webContents.setWindowOpenHandler((details) => this.handleWindowOpen(tabId, details))
    view.webContents.on('before-input-event', (event, input) => {
      const commandId = browserCommandForInput(
        input,
        this.views.get(tabId)?.shortcutBindings ?? [],
        this.platform
      )
      if (!commandId) return
      event.preventDefault()
      this.service?.handleNativeCommand(tabId, commandId)
    })
    view.webContents.on('will-navigate', (event, url) => this.handleWillNavigate(tabId, event, url))
    view.webContents.on('did-start-navigation', () => this.service?.markNavigationStarted(tabId))
    view.webContents.on('did-start-loading', () => this.service?.markNavigationStarted(tabId))
    view.webContents.on('did-stop-loading', () => this.service?.markNavigationStopped(tabId))
    view.webContents.on('did-navigate', (_event, url) =>
      this.service?.markNavigationCommitted(tabId, url, this.historyState(tabId))
    )
    view.webContents.on('did-navigate-in-page', (_event, url) =>
      this.service?.markNavigationCommitted(tabId, url, this.historyState(tabId))
    )
    view.webContents.on(
      'did-fail-load',
      (_event, _code, description, validatedUrl, isMainFrame) => {
        if (!isMainFrame) return
        this.service?.markNavigationFailed(
          tabId,
          `${description}${validatedUrl ? `: ${validatedUrl}` : ''}`
        )
        this.service?.markHistoryChanged(tabId, this.historyState(tabId))
      }
    )
    view.webContents.on('page-title-updated', (_event, title) =>
      this.service?.markTitleChanged(tabId, title)
    )
    view.webContents.on('page-favicon-updated', (_event, favicons) => {
      void this.service?.markFaviconChanged(tabId, favicons)
    })
    view.webContents.on('did-create-window', (childWindow, details) =>
      this.trackAuthenticationChildWindow(tabId, childWindow as BrowserChildWindow, details)
    )
    this.views.set(tabId, {
      view,
      ownerWindow: null,
      attachedWindow: null,
      shortcutBindings: [],
      requestedUrl: null,
      childWindows: new Set(),
      pendingWindowOpenGestures: []
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
    if (previouslyActiveTabId && previouslyActiveTabId !== tabId)
      this.hideView(previouslyActiveTabId)

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
    this.closeChildWindows(record)
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

  async clearProfileData(): Promise<BrowserClearDataResult> {
    const cleared: BrowserClearDataCategory[] = []
    const failures: BrowserClearDataFailure[] = []

    const browserSession = electron.session.fromPartition(BROWSER_PARTITION)
    await clearBrowserDataCategory(
      'cookies-and-site-storage',
      () =>
        browserSession.clearStorageData({
          storages: [
            'cookies',
            'filesystem',
            'localstorage',
            'indexdb',
            'serviceworkers',
            'cachestorage',
            'shadercache'
          ]
        }),
      cleared,
      failures
    )
    await clearBrowserDataCategory('cache', () => browserSession.clearCache(), cleared, failures)

    this.securityPolicy.resetTemporaryDecisions()
    cleared.push('temporary-grants')

    return {
      status: failures.length === 0 ? 'cleared' : cleared.length > 0 ? 'partial-failure' : 'failed',
      cleared,
      failures
    }
  }

  private installPermissionPolicy(): void {
    if (!('session' in electron) || !('app' in electron)) return
    const install = (): void => {
      const browserSession = electron.session.fromPartition(BROWSER_PARTITION)
      browserSession.setPermissionCheckHandler(
        (webContents, permission, requestingOrigin, details) => {
          if (!webContents) return false
          const record = this.recordForWebContents(webContents)
          if (!record) return false
          return this.securityPolicy.checkPermission({
            requestingUrl:
              details.requestingUrl ||
              details.securityOrigin ||
              requestingOrigin ||
              webContents.getURL(),
            permission,
            details: {
              mediaTypes:
                details.mediaType && details.mediaType !== 'unknown'
                  ? [details.mediaType]
                  : undefined
            },
            isBackground: !this.isRecordVisible(record)
          })
        }
      )
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
    electron.app.on(
      'certificate-error',
      (event, webContents, url, error, _certificate, callback) => {
        const record = this.recordForWebContents(webContents)
        if (!record) return
        event.preventDefault()
        void this.securityPolicy
          .requestCertificateException({
            url,
            originalUrl: record.requestedUrl ?? webContents.getURL(),
            error
          })
          .then(callback, () => callback(false))
      }
    )
  }

  private installDownloadPolicy(): void {
    if (!this.downloadsService || !('session' in electron) || !('app' in electron)) return
    const install = (): void => {
      const browserSession = electron.session.fromPartition(BROWSER_PARTITION)
      browserSession.on('will-download', (_event, item, webContents) => {
        const found = this.tabIdForWebContents(webContents)
        if (!found) {
          item.cancel()
          return
        }
        void this.downloadsService?.handleDownloadStarted(
          found.tabId,
          item,
          found.record.ownerWindow ?? undefined
        )
      })
    }
    if (electron.app.isReady()) install()
    else void electron.app.whenReady().then(install)
  }

  private handleWillNavigate(
    tabId: string,
    event: { preventDefault: () => void },
    urlText: string
  ): void {
    const url = safeUrl(urlText)
    if (!url) {
      event.preventDefault()
      return
    }
    if (url.protocol === 'http:' || url.protocol === 'https:') return

    event.preventDefault()
    if (isSupportedExternalProtocolUrl(url)) {
      void confirmAndOpenExternalProtocol(url, this.views.get(tabId)?.ownerWindow ?? null)
    }
  }

  private handleWindowOpen(
    tabId: string,
    details: ElectronWindowOpenDetails
  ): ElectronWindowOpenDecision {
    const url = safeUrl(details.url)
    if (!url) return { action: 'deny' }

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (isEligibleSameContextTabRequest(details)) {
        if (this.consumeEligibleUserGesture(tabId, url.toString())) {
          this.service?.openNativeRequestedTab(tabId, url.toString())
        }
        return { action: 'deny' }
      }
      if (
        isEligibleAuthenticationPopupRequest(details) &&
        this.consumeEligibleUserGesture(tabId, url.toString())
      ) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: this.views.get(tabId)?.ownerWindow ?? undefined,
            show: true,
            webPreferences: {
              ...BROWSER_WEB_PREFERENCES,
              partition: BROWSER_PARTITION
            }
          }
        }
      }
      return { action: 'deny' }
    }

    if (isSupportedExternalProtocolUrl(url)) {
      void confirmAndOpenExternalProtocol(url, this.views.get(tabId)?.ownerWindow ?? null)
    }
    return { action: 'deny' }
  }

  private installWindowOpenGestureObserver(webContents: WebContents): void {
    try {
      if (!webContents.debugger.isAttached()) webContents.debugger.attach('1.3')
      webContents.debugger.sendCommand('Page.enable').catch(() => undefined)
      webContents.debugger.on('message', (_event, method, params: unknown) => {
        if (method !== 'Page.windowOpen') return
        const windowOpen = params as { url?: unknown; userGesture?: unknown }
        if (typeof windowOpen.url !== 'string') return
        const record = this.recordForWebContents(webContents)
        if (!record) return
        record.pendingWindowOpenGestures.push({
          url: windowOpen.url,
          userGesture: windowOpen.userGesture === true,
          observedAt: Date.now()
        })
        this.prunePendingWindowOpenGestures(record)
      })
    } catch {
      // Without a request-scoped Chromium signal, popup authorization must fail closed.
    }
  }

  private consumeEligibleUserGesture(tabId: string, url: string): boolean {
    const record = this.views.get(tabId)
    if (!record) return false
    this.prunePendingWindowOpenGestures(record)
    const index = record.pendingWindowOpenGestures.findIndex((gesture) => gesture.url === url)
    if (index === -1) return false
    const [gesture] = record.pendingWindowOpenGestures.splice(index, 1)
    return gesture?.userGesture === true
  }

  private prunePendingWindowOpenGestures(record: BrowserViewRecord): void {
    const oldestAllowedAt = Date.now() - 1000
    record.pendingWindowOpenGestures = record.pendingWindowOpenGestures.filter(
      (gesture) => gesture.observedAt >= oldestAllowedAt
    )
  }

  private trackAuthenticationChildWindow(
    tabId: string,
    childWindow: BrowserChildWindow,
    _details: unknown
  ): void {
    const record = this.views.get(tabId)
    if (!record) {
      closeBrowserWindow(childWindow)
      return
    }
    childWindow.webContents?.setWindowOpenHandler(() => ({ action: 'deny' }))
    record.childWindows.add(childWindow)
    childWindow.once?.('closed', () => record.childWindows.delete(childWindow))
  }

  private closeChildWindows(record: BrowserViewRecord): void {
    for (const childWindow of record.childWindows) closeBrowserWindow(childWindow)
    record.childWindows.clear()
  }

  private historyState(tabId: string): { canGoBack: boolean; canGoForward: boolean } {
    const webContents = this.views.get(tabId)?.view.webContents
    return {
      canGoBack: webContents?.canGoBack() ?? false,
      canGoForward: webContents?.canGoForward() ?? false
    }
  }

  private recordForWebContents(webContents: WebContents): BrowserViewRecord | null {
    return this.tabIdForWebContents(webContents)?.record ?? null
  }

  private tabIdForWebContents(
    webContents: WebContents
  ): { tabId: string; record: BrowserViewRecord } | null {
    for (const [tabId, record] of this.views.entries()) {
      if (record.view.webContents === webContents) return { tabId, record }
      for (const childWindow of record.childWindows) {
        if (childWindow.webContents === webContents) return { tabId, record }
      }
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
    if (this.activeTabByWindowId.get(window.id) === tabId)
      this.activeTabByWindowId.delete(window.id)
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

function createNativeBrowserSecurityPolicy(
  ownerWindow: () => BrowserWindow | null
): BrowserSecurityPolicy {
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

type ElectronWindowOpenDetails = {
  url: string
  frameName?: string
  features?: string
  disposition?: string
}

type ElectronWindowOpenDecision =
  { action: 'deny' } | { action: 'allow'; overrideBrowserWindowOptions?: Record<string, unknown> }

function isEligibleSameContextTabRequest(details: ElectronWindowOpenDetails): boolean {
  return details.disposition === 'foreground-tab' || details.disposition === 'background-tab'
}

function isEligibleAuthenticationPopupRequest(details: ElectronWindowOpenDetails): boolean {
  if (details.disposition !== 'new-window') return false
  return (
    Boolean(details.frameName && details.frameName !== '_blank') &&
    Boolean(details.features?.trim())
  )
}

function safeUrl(input: string): URL | null {
  try {
    return new URL(input)
  } catch {
    return null
  }
}

function isSupportedExternalProtocolUrl(url: URL): boolean {
  if (url.protocol !== 'mailto:') return false
  return !containsUnsafeNestedProtocol(url.toString())
}

function containsUnsafeNestedProtocol(input: string): boolean {
  try {
    return /(?:file|spacezero|javascript|data|shell|ftp):/i.test(decodeURIComponent(input))
  } catch {
    return true
  }
}

async function confirmAndOpenExternalProtocol(
  url: URL,
  ownerWindow: BrowserWindow | null
): Promise<void> {
  const options = {
    type: 'question' as const,
    buttons: ['Open', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: 'Open external application?',
    message: `Open ${url.protocol.slice(0, -1)} link?`,
    detail: url.toString()
  }
  const result = ownerWindow
    ? await electron.dialog.showMessageBox(ownerWindow, options)
    : await electron.dialog.showMessageBox(options)
  if (result.response !== 0) return
  await electron.shell.openExternal(url.toString())
}

function closeBrowserWindow(window: BrowserChildWindow): void {
  if (window.isDestroyed?.()) return
  if (window.close) window.close()
  else window.destroy?.()
}

function browserCommandForInput(
  input: Input,
  shortcutBindings: BrowserShortcutBinding[],
  platform: NodeJS.Platform
): BrowserShortcutBinding['commandId'] | null {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return null

  for (const shortcutBinding of shortcutBindings) {
    if (inputMatchesKeybinding(input, shortcutBinding.keybinding.normalized, platform))
      return shortcutBinding.commandId
  }

  return null
}

function inputMatchesKeybinding(
  input: Input,
  normalized: string,
  platform: NodeJS.Platform
): boolean {
  const tokens = normalized
    .toLowerCase()
    .split('+')
    .map((token) => token.trim())
  const key = tokens.pop()
  if (!key || input.key.toLowerCase() !== key) return false

  const modifiers = new Set(tokens)
  if ([...modifiers].some((modifier) => !['mod', 'ctrl', 'alt', 'shift'].includes(modifier)))
    return false
  const wantsMod = modifiers.has('mod')
  const wantsCtrl = modifiers.has('ctrl')
  const wantsAlt = modifiers.has('alt')
  const wantsShift = modifiers.has('shift')
  const isMac = platform === 'darwin'

  if (isMac) {
    if (input.meta !== wantsMod) return false
    if (input.control !== wantsCtrl) return false
  } else if (input.control !== (wantsMod || wantsCtrl)) {
    return false
  }

  return input.alt === wantsAlt && input.shift === wantsShift
}

async function clearBrowserDataCategory(
  category: BrowserClearDataCategory,
  action: () => Promise<void>,
  cleared: BrowserClearDataCategory[],
  failures: BrowserClearDataFailure[]
): Promise<void> {
  try {
    await action()
    cleared.push(category)
  } catch {
    failures.push({ category, message: 'Could not clear this Browser data category.' })
  }
}
