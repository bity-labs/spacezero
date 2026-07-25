import { beforeEach, describe, expect, it, vi } from 'vitest'

const fakes = vi.hoisted(() => {
  type Listener = (...args: never[]) => void

  class FakeEmitter {
    private readonly listeners = new Map<string, Listener[]>()

    on(event: string, listener: Listener): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
      return this
    }

    once(event: string, listener: Listener): this {
      const wrapped: Listener = (...args) => {
        this.off(event, wrapped)
        listener(...args)
      }
      return this.on(event, wrapped)
    }

    off(event: string, listener: Listener): this {
      this.listeners.set(
        event,
        (this.listeners.get(event) ?? []).filter((candidate) => candidate !== listener)
      )
      return this
    }

    emit(event: string, ...args: never[]): boolean {
      for (const listener of this.listeners.get(event) ?? []) listener(...args)
      return true
    }
  }

  const senderToWindow = new Map<unknown, FakeBrowserWindow>()
  const createdViews: FakeWebContentsView[] = []
  const permissionCheckHandlers: Array<(
    webContents: FakeWebContents | null,
    permission: string,
    requestingOrigin: string,
    details: { requestingUrl?: string; securityOrigin?: string; mediaType?: 'video' | 'audio' | 'unknown' }
  ) => boolean> = []
  const permissionHandlers: Array<(
    webContents: FakeWebContents,
    permission: string,
    callback: (allowed: boolean) => void,
    details: { requestingUrl?: string; mediaTypes?: string[] }
  ) => void> = []
  const certificateHandlers: Array<(
    event: { preventDefault: () => void },
    webContents: FakeWebContents,
    url: string,
    error: string,
    certificate: unknown,
    callback: (allowed: boolean) => void
  ) => void> = []

  class FakeContentView {
    readonly added: FakeWebContentsView[] = []
    readonly removed: FakeWebContentsView[] = []

    addChildView(view: FakeWebContentsView): void {
      this.added.push(view)
    }

    removeChildView(view: FakeWebContentsView): void {
      this.removed.push(view)
    }
  }

  class FakeWebContents extends FakeEmitter {
    closed = false
    destroyed = false
    loadedUrl: string | null = null
    wentBack = false
    wentForward = false
    reloaded = false
    stopped = false
    lastPreventDefault: (() => void) | null = null
    url = 'https://example.com/'
    windowOpenHandler: ((details: unknown) => unknown) | null = null
    readonly debugger = {
      attached: false,
      listeners: [] as Array<(event: unknown, method: string, params: unknown) => void>,
      isAttached: () => this.debugger.attached,
      attach: () => {
        this.debugger.attached = true
      },
      sendCommand: vi.fn().mockResolvedValue(undefined),
      on: (_event: 'message', listener: (event: unknown, method: string, params: unknown) => void) => {
        this.debugger.listeners.push(listener)
      }
    }

    setWindowOpenHandler(handler: (details: unknown) => unknown): void {
      this.windowOpenHandler = handler
    }
    getURL(): string {
      return this.url
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    close(): void {
      this.closed = true
      this.destroyed = true
    }
    async loadURL(url: string): Promise<void> {
      this.loadedUrl = url
    }
    async executeJavaScript(): Promise<boolean> {
      return true
    }
    canGoBack(): boolean {
      return true
    }
    canGoForward(): boolean {
      return true
    }
    goBack(): void {
      this.wentBack = true
    }
    goForward(): void {
      this.wentForward = true
    }
    reload(): void {
      this.reloaded = true
    }
    stop(): void {
      this.stopped = true
    }
    emitBeforeInput(input: unknown): void {
      const event = { preventDefault: vi.fn() }
      this.lastPreventDefault = event.preventDefault
      this.emit('before-input-event', event as never, input as never)
    }
    emitWindowOpenGesture(url: string, userGesture: boolean): void {
      for (const listener of this.debugger.listeners) listener({}, 'Page.windowOpen', { url, userGesture })
    }
  }

  class FakeWebContentsView {
    readonly webContents = new FakeWebContents()
    bounds: unknown = null

    constructor(_options: unknown) {
      createdViews.push(this)
    }

    setBounds(bounds: unknown): void {
      this.bounds = bounds
    }
  }

  class FakeBrowserWindow extends FakeEmitter {
    readonly contentView = new FakeContentView()
    readonly webContents = new FakeWebContents()
    closed = false

    constructor(readonly id: number) {
      super()
    }

    isDestroyed(): boolean {
      return this.closed
    }

    close(): void {
      this.closed = true
      this.emit('closed')
    }
  }

  return {
    senderToWindow,
    createdViews,
    permissionCheckHandlers,
    permissionHandlers,
    certificateHandlers,
    FakeWebContentsView,
    FakeBrowserWindow
  }
})

const openExternal = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const showMessageBox = vi.hoisted(() => vi.fn().mockResolvedValue({ response: 1 }))

vi.mock('electron', () => ({
  app: {
    isReady: () => true,
    whenReady: () => Promise.resolve(),
    on: (event: string, listener: never) => {
      if (event === 'certificate-error') fakes.certificateHandlers.push(listener)
    }
  },
  BrowserWindow: {
    fromWebContents: (sender: unknown) => fakes.senderToWindow.get(sender) ?? null
  },
  dialog: {
    showMessageBox
  },
  shell: {
    openExternal
  },
  session: {
    fromPartition: () => ({
      setPermissionCheckHandler: (handler: never) => fakes.permissionCheckHandlers.push(handler),
      setPermissionRequestHandler: (handler: never) => fakes.permissionHandlers.push(handler)
    })
  },
  WebContentsView: fakes.FakeWebContentsView
}))

import { BROWSER_COMMAND_IDS, type BrowserShortcutBinding } from '../shared'
import { ElectronBrowserViewAdapter } from './browser.webcontents-adapter'

const defaultShortcutBindings: BrowserShortcutBinding[] = [
  { commandId: BROWSER_COMMAND_IDS.focusAddress, keybinding: { normalized: 'mod+l' } },
  { commandId: BROWSER_COMMAND_IDS.reload, keybinding: { normalized: 'mod+r' } },
  {
    commandId: BROWSER_COMMAND_IDS.back,
    keybinding: { normalized: process.platform === 'darwin' ? 'mod+[' : 'alt+arrowleft' }
  },
  {
    commandId: BROWSER_COMMAND_IDS.forward,
    keybinding: { normalized: process.platform === 'darwin' ? 'mod+]' : 'alt+arrowright' }
  }
]

describe('ElectronBrowserViewAdapter', () => {
  beforeEach(() => {
    fakes.senderToWindow.clear()
    fakes.createdViews.length = 0
    fakes.permissionCheckHandlers.length = 0
    fakes.permissionHandlers.length = 0
    fakes.certificateHandlers.length = 0
    openExternal.mockClear()
    showMessageBox.mockClear()
    showMessageBox.mockResolvedValue({ response: 1 })
  })

  it('shows one active Browser view per owner window', () => {
    const adapter = new ElectronBrowserViewAdapter()
    const sender = {}
    const window = new fakes.FakeBrowserWindow(1)
    fakes.senderToWindow.set(sender, window)

    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    adapter.createView('tab-2', { partition: 'persist:test', preferences: {} })
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, defaultShortcutBindings, sender as never)
    adapter.showView('tab-2', { x: 5, y: 5, width: 200, height: 150 }, defaultShortcutBindings, sender as never)

    expect(window.contentView.added).toEqual([fakes.createdViews[0], fakes.createdViews[1]])
    expect(window.contentView.removed).toEqual([fakes.createdViews[0]])
    expect(fakes.createdViews[1]?.bounds).toEqual({ x: 5, y: 5, width: 200, height: 150 })
  })

  it('detaches a view from the previous owner window before showing it in a new one', () => {
    const adapter = new ElectronBrowserViewAdapter()
    const senderA = {}
    const senderB = {}
    const windowA = new fakes.FakeBrowserWindow(1)
    const windowB = new fakes.FakeBrowserWindow(2)
    fakes.senderToWindow.set(senderA, windowA)
    fakes.senderToWindow.set(senderB, windowB)

    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, defaultShortcutBindings, senderA as never)
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, defaultShortcutBindings, senderB as never)

    expect(windowA.contentView.removed).toEqual([fakes.createdViews[0]])
    expect(windowB.contentView.added).toEqual([fakes.createdViews[0]])
  })

  it('routes user-initiated target blank web requests into a same-context tab without creating a window', async () => {
    const adapter = new ElectronBrowserViewAdapter()
    const service = { openNativeRequestedTab: vi.fn() }
    adapter.setService(service as never)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })

    fakes.createdViews[0]?.webContents.emitWindowOpenGesture('https://docs.example/path', true)
    const decision = fakes.createdViews[0]?.webContents.windowOpenHandler?.({
      url: 'https://docs.example/path',
      disposition: 'foreground-tab',
      frameName: '_blank',
      features: ''
    })

    expect(decision).toEqual({ action: 'deny' })
    expect(service.openNativeRequestedTab).toHaveBeenCalledWith('tab-1', 'https://docs.example/path')
  })

  it('blocks script-created web popups without a request-scoped transient user gesture', () => {
    const adapter = new ElectronBrowserViewAdapter()
    const service = { openNativeRequestedTab: vi.fn() }
    adapter.setService(service as never)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })

    fakes.createdViews[0]?.webContents.emitWindowOpenGesture('https://ads.example/popup', false)
    const decision = fakes.createdViews[0]?.webContents.windowOpenHandler?.({
      url: 'https://ads.example/popup',
      disposition: 'foreground-tab',
      frameName: '_blank',
      features: ''
    })

    expect(decision).toEqual({ action: 'deny' })
    expect(service.openNativeRequestedTab).not.toHaveBeenCalled()
  })

  it('blocks named authentication popups fired without a request-scoped user gesture', () => {
    const adapter = new ElectronBrowserViewAdapter()
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })

    fakes.createdViews[0]?.webContents.emitWindowOpenGesture('https://login.example/oauth', false)
    const decision = fakes.createdViews[0]?.webContents.windowOpenHandler?.({
      url: 'https://login.example/oauth',
      disposition: 'new-window',
      frameName: 'oauth-popup',
      features: 'width=500,height=700'
    })

    expect(decision).toEqual({ action: 'deny' })
  })

  it('allows constrained authentication child windows with the Browser profile and closes them with the parent tab', () => {
    const adapter = new ElectronBrowserViewAdapter()
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })

    fakes.createdViews[0]?.webContents.emitWindowOpenGesture('https://login.example/oauth', true)
    const decision = fakes.createdViews[0]?.webContents.windowOpenHandler?.({
      url: 'https://login.example/oauth',
      disposition: 'new-window',
      frameName: 'oauth-popup',
      features: 'width=500,height=700'
    })
    const child = new fakes.FakeBrowserWindow(22)
    fakes.createdViews[0]?.webContents.emit('did-create-window', child as never, {} as never)

    expect(decision).toMatchObject({
      action: 'allow',
      overrideBrowserWindowOptions: {
        show: true,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webviewTag: false,
          partition: 'persist:spacezero-browser'
        }
      }
    })

    adapter.destroyView('tab-1')

    expect(child.webContents.windowOpenHandler?.({ url: 'https://login.example/descendant' })).toEqual({ action: 'deny' })
    expect(child.closed).toBe(true)
  })

  it('confirms supported external protocols before handing them to the operating system', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 })
    const adapter = new ElectronBrowserViewAdapter()
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })

    const decision = fakes.createdViews[0]?.webContents.windowOpenHandler?.({
      url: 'mailto:builder@example.com?subject=Hello',
      disposition: 'foreground-tab'
    })

    expect(decision).toEqual({ action: 'deny' })
    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledWith('mailto:builder@example.com?subject=Hello'))
    expect(showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Open mailto link?',
        detail: 'mailto:builder@example.com?subject=Hello'
      })
    )
  })

  it('confirms supported top-level external protocol navigations without loading them in Browser', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 })
    const adapter = new ElectronBrowserViewAdapter()
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    const preventDefault = vi.fn()

    fakes.createdViews[0]?.webContents.emit('will-navigate', { preventDefault } as never, 'mailto:builder@example.com' as never)

    expect(preventDefault).toHaveBeenCalled()
    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledWith('mailto:builder@example.com'))
  })

  it('denies canceled, malformed, unsupported, and nested unsafe external protocols', async () => {
    const adapter = new ElectronBrowserViewAdapter()
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })

    expect(
      fakes.createdViews[0]?.webContents.windowOpenHandler?.({ url: 'mailto:cancel@example.com' })
    ).toEqual({ action: 'deny' })
    expect(showMessageBox).toHaveBeenCalledTimes(1)
    showMessageBox.mockClear()
    expect(fakes.createdViews[0]?.webContents.windowOpenHandler?.({ url: 'file:///etc/passwd' })).toEqual({
      action: 'deny'
    })
    expect(fakes.createdViews[0]?.webContents.windowOpenHandler?.({ url: 'not a url' })).toEqual({
      action: 'deny'
    })
    expect(
      fakes.createdViews[0]?.webContents.windowOpenHandler?.({ url: 'mailto:x@y.test?body=file%3A%2F%2Fetc%2Fpasswd' })
    ).toEqual({ action: 'deny' })
    expect(fakes.createdViews[0]?.webContents.windowOpenHandler?.({ url: 'mailto:x%' })).toEqual({ action: 'deny' })
    expect(
      fakes.createdViews[0]?.webContents.windowOpenHandler?.({ url: 'mailto:builder@example.com?subject=%' })
    ).toEqual({ action: 'deny' })
    const preventDefault = vi.fn()
    expect(() =>
      fakes.createdViews[0]?.webContents.emit('will-navigate', { preventDefault } as never, 'mailto:x#%' as never)
    ).not.toThrow()
    expect(preventDefault).toHaveBeenCalled()

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(showMessageBox).not.toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('destroys attached native resources when the owner window closes', () => {
    const adapter = new ElectronBrowserViewAdapter()
    const sender = {}
    const window = new fakes.FakeBrowserWindow(1)
    fakes.senderToWindow.set(sender, window)

    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, defaultShortcutBindings, sender as never)

    window.emit('closed')

    expect(window.contentView.removed).toEqual([fakes.createdViews[0]])
    expect(fakes.createdViews[0]?.webContents.closed).toBe(true)
  })

  it('routes focused page Browser shortcuts through the main command capability', () => {
    const adapter = new ElectronBrowserViewAdapter()
    const service = { handleNativeCommand: vi.fn() }
    const sender = {}
    const window = new fakes.FakeBrowserWindow(1)
    fakes.senderToWindow.set(sender, window)
    adapter.setService(service as never)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, defaultShortcutBindings, sender as never)

    fakes.createdViews[0]?.webContents.emitBeforeInput({
      type: 'keyDown',
      key: 'r',
      control: process.platform !== 'darwin',
      meta: process.platform === 'darwin',
      alt: false,
      shift: false,
      isAutoRepeat: false
    })

    expect(fakes.createdViews[0]?.webContents.lastPreventDefault).toHaveBeenCalled()
    expect(service.handleNativeCommand).toHaveBeenCalledWith('tab-1', 'browser.reload')
  })

  it('honors remapped focused page Browser shortcuts and ignores the previous default', () => {
    const adapter = new ElectronBrowserViewAdapter()
    const service = { handleNativeCommand: vi.fn() }
    const sender = {}
    const window = new fakes.FakeBrowserWindow(1)
    fakes.senderToWindow.set(sender, window)
    adapter.setService(service as never)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    adapter.showView(
      'tab-1',
      { x: 0, y: 0, width: 100, height: 100 },
      [{ commandId: BROWSER_COMMAND_IDS.focusAddress, keybinding: { normalized: 'alt+enter' } }],
      sender as never
    )

    fakes.createdViews[0]?.webContents.emitBeforeInput({
      type: 'keyDown',
      key: 'l',
      control: process.platform !== 'darwin',
      meta: process.platform === 'darwin',
      alt: false,
      shift: false,
      isAutoRepeat: false
    })
    fakes.createdViews[0]?.webContents.emitBeforeInput({
      type: 'keyDown',
      key: 'Enter',
      control: false,
      meta: false,
      alt: true,
      shift: false,
      isAutoRepeat: false
    })

    expect(service.handleNativeCommand).toHaveBeenCalledTimes(1)
    expect(service.handleNativeCommand).toHaveBeenCalledWith('tab-1', BROWSER_COMMAND_IDS.focusAddress)
  })

  it('does not steal embedded page text-input cursor shortcuts on macOS', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' })
    const adapter = new ElectronBrowserViewAdapter()
    const service = { handleNativeCommand: vi.fn() }
    const sender = {}
    const window = new fakes.FakeBrowserWindow(1)
    fakes.senderToWindow.set(sender, window)
    adapter.setService(service as never)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, defaultShortcutBindings, sender as never)

    fakes.createdViews[0]?.webContents.emitBeforeInput({
      type: 'keyDown',
      key: 'ArrowLeft',
      control: false,
      meta: false,
      alt: true,
      shift: false,
      isAutoRepeat: false
    })

    expect(fakes.createdViews[0]?.webContents.lastPreventDefault).not.toHaveBeenCalled()
    expect(service.handleNativeCommand).not.toHaveBeenCalled()
    Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform })
  })

  it('destroys hidden native resources and clears service tabs when the owner window closes', () => {
    const adapter = new ElectronBrowserViewAdapter()
    const sender = {}
    const window = new fakes.FakeBrowserWindow(1)
    const service = { removeNativeClosedTabs: vi.fn() }
    fakes.senderToWindow.set(sender, window)
    adapter.setService(service as never)

    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, defaultShortcutBindings, sender as never)
    adapter.hideView('tab-1')

    window.emit('closed')

    expect(window.contentView.removed).toEqual([fakes.createdViews[0]])
    expect(fakes.createdViews[0]?.webContents.closed).toBe(true)
    expect(service.removeNativeClosedTabs).toHaveBeenCalledWith(['tab-1'])
  })

  it('denies background permission requests and prompts only for visible Browser contents', async () => {
    const policy = {
      checkPermission: vi.fn().mockReturnValue(false),
      requestPermission: vi.fn((request: { isBackground?: boolean }) => Promise.resolve(!request.isBackground)),
      requestCertificateException: vi.fn()
    }
    const adapter = new ElectronBrowserViewAdapter(policy as never)
    const sender = {}
    const window = new fakes.FakeBrowserWindow(1)
    fakes.senderToWindow.set(sender, window)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })

    let backgroundDecision: boolean | null = null
    fakes.permissionHandlers[0]?.(
      fakes.createdViews[0].webContents,
      'notifications',
      (allowed) => {
        backgroundDecision = allowed
      },
      { requestingUrl: 'https://example.com/' }
    )
    await vi.waitFor(() => expect(backgroundDecision).toBe(false))
    expect(policy.requestPermission).toHaveBeenCalledWith({
      requestingUrl: 'https://example.com/',
      permission: 'notifications',
      details: { mediaTypes: undefined },
      isBackground: true
    })

    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, defaultShortcutBindings, sender as never)
    let visibleDecision: boolean | null = null
    fakes.permissionHandlers[0]?.(
      fakes.createdViews[0].webContents,
      'notifications',
      (allowed) => {
        visibleDecision = allowed
      },
      { requestingUrl: 'https://example.com/' }
    )

    await vi.waitFor(() => expect(visibleDecision).toBe(true))
    expect(policy.requestPermission).toHaveBeenCalledWith({
      requestingUrl: 'https://example.com/',
      permission: 'notifications',
      details: { mediaTypes: undefined },
      isBackground: false
    })
  })

  it('denies permission checks unless Browser contents have a visible exact grant', () => {
    const policy = {
      checkPermission: vi.fn((request: { isBackground?: boolean }) => !request.isBackground),
      requestPermission: vi.fn(),
      requestCertificateException: vi.fn()
    }
    const adapter = new ElectronBrowserViewAdapter(policy as never)
    const sender = {}
    const window = new fakes.FakeBrowserWindow(1)
    fakes.senderToWindow.set(sender, window)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })

    expect(
      fakes.permissionCheckHandlers[0]?.(null, 'notifications', 'https://example.com', {
        requestingUrl: 'https://example.com/'
      })
    ).toBe(false)
    expect(
      fakes.permissionCheckHandlers[0]?.(fakes.createdViews[0].webContents, 'notifications', 'https://example.com', {
        requestingUrl: 'https://example.com/'
      })
    ).toBe(false)
    expect(policy.checkPermission).toHaveBeenLastCalledWith({
      requestingUrl: 'https://example.com/',
      permission: 'notifications',
      details: { mediaTypes: undefined },
      isBackground: true
    })

    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, defaultShortcutBindings, sender as never)
    expect(
      fakes.permissionCheckHandlers[0]?.(fakes.createdViews[0].webContents, 'media', 'https://example.com', {
        requestingUrl: 'https://example.com/',
        mediaType: 'video'
      })
    ).toBe(true)
    expect(policy.checkPermission).toHaveBeenLastCalledWith({
      requestingUrl: 'https://example.com/',
      permission: 'media',
      details: { mediaTypes: ['video'] },
      isBackground: false
    })
  })

  it('denies permission requests after a visible Browser view is hidden again', async () => {
    const policy = {
      checkPermission: vi.fn().mockReturnValue(false),
      requestPermission: vi.fn().mockResolvedValue(false),
      requestCertificateException: vi.fn()
    }
    const adapter = new ElectronBrowserViewAdapter(policy as never)
    const sender = {}
    const window = new fakes.FakeBrowserWindow(1)
    fakes.senderToWindow.set(sender, window)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, defaultShortcutBindings, sender as never)
    adapter.hideView('tab-1')

    let decision: boolean | null = null
    fakes.permissionHandlers[0]?.(
      fakes.createdViews[0].webContents,
      'notifications',
      (allowed) => {
        decision = allowed
      },
      { requestingUrl: 'https://example.com/' }
    )

    await vi.waitFor(() => expect(decision).toBe(false))
    expect(policy.requestPermission).toHaveBeenCalledWith({
      requestingUrl: 'https://example.com/',
      permission: 'notifications',
      details: { mediaTypes: undefined },
      isBackground: true
    })
  })

  it('handles certificate errors only for Browser web contents', async () => {
    const policy = {
      checkPermission: vi.fn(),
      requestPermission: vi.fn(),
      requestCertificateException: vi.fn().mockResolvedValue(true)
    }
    const adapter = new ElectronBrowserViewAdapter(policy as never)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    fakes.createdViews[0].webContents.url = 'https://localhost:3443/'
    const preventDefault = vi.fn()
    let decision: boolean | null = null

    fakes.certificateHandlers[0]?.(
      { preventDefault },
      fakes.createdViews[0].webContents,
      'https://localhost:3443/',
      'bad cert',
      {},
      (allowed) => {
        decision = allowed
      }
    )

    await vi.waitFor(() => expect(decision).toBe(true))
    expect(preventDefault).toHaveBeenCalled()
    expect(policy.requestCertificateException).toHaveBeenCalledWith({
      url: 'https://localhost:3443/',
      originalUrl: 'https://localhost:3443/',
      error: 'bad cert'
    })

    const nonBrowserPreventDefault = vi.fn()
    fakes.certificateHandlers[0]?.(
      { preventDefault: nonBrowserPreventDefault },
      {} as never,
      'https://localhost:3443/',
      'bad cert',
      {},
      vi.fn()
    )
    expect(nonBrowserPreventDefault).not.toHaveBeenCalled()
  })

  it('denies certificate errors when Electron reports a target that differs from the preserved loopback authority', async () => {
    const policy = {
      checkPermission: vi.fn(),
      requestPermission: vi.fn(),
      requestCertificateException: vi.fn((request: { url: string; originalUrl?: string }) =>
        Promise.resolve(request.url === request.originalUrl)
      )
    }
    const adapter = new ElectronBrowserViewAdapter(policy as never)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    adapter.loadUrl('tab-1', 'https://localhost:3443/start', 'https://localhost:3443/start')
    fakes.createdViews[0].webContents.url = 'https://remote.example.invalid/'
    const preventDefault = vi.fn()
    let decision: boolean | null = null

    fakes.certificateHandlers[0]?.(
      { preventDefault },
      fakes.createdViews[0].webContents,
      'https://remote.example.invalid/',
      'bad cert',
      {},
      (allowed) => {
        decision = allowed
      }
    )

    await vi.waitFor(() => expect(decision).toBe(false))
    expect(preventDefault).toHaveBeenCalled()
    expect(policy.requestCertificateException).toHaveBeenCalledWith({
      url: 'https://remote.example.invalid/',
      originalUrl: 'https://localhost:3443/start',
      error: 'bad cert'
    })
  })
})
