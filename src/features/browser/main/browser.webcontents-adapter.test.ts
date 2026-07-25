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

    setWindowOpenHandler(): void {}
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

    constructor(readonly id: number) {
      super()
    }
  }

  return {
    senderToWindow,
    createdViews,
    permissionHandlers,
    certificateHandlers,
    FakeWebContentsView,
    FakeBrowserWindow
  }
})

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
    showMessageBox: vi.fn().mockResolvedValue({ response: 1 })
  },
  session: {
    fromPartition: () => ({
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
    fakes.permissionHandlers.length = 0
    fakes.certificateHandlers.length = 0
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
      requestPermission: vi.fn().mockResolvedValue(true),
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
    expect(policy.requestPermission).not.toHaveBeenCalled()

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

  it('handles certificate errors only for Browser web contents', async () => {
    const policy = {
      requestPermission: vi.fn(),
      requestCertificateException: vi.fn().mockResolvedValue(true)
    }
    const adapter = new ElectronBrowserViewAdapter(policy as never)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
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
})
