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

    setWindowOpenHandler(): void {}
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

  return { senderToWindow, createdViews, FakeWebContentsView, FakeBrowserWindow }
})

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: (sender: unknown) => fakes.senderToWindow.get(sender) ?? null
  },
  WebContentsView: fakes.FakeWebContentsView
}))

import { ElectronBrowserViewAdapter } from './browser.webcontents-adapter'

describe('ElectronBrowserViewAdapter', () => {
  beforeEach(() => {
    fakes.senderToWindow.clear()
    fakes.createdViews.length = 0
  })

  it('shows one active Browser view per owner window', () => {
    const adapter = new ElectronBrowserViewAdapter()
    const sender = {}
    const window = new fakes.FakeBrowserWindow(1)
    fakes.senderToWindow.set(sender, window)

    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    adapter.createView('tab-2', { partition: 'persist:test', preferences: {} })
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, sender as never)
    adapter.showView('tab-2', { x: 5, y: 5, width: 200, height: 150 }, sender as never)

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
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, senderA as never)
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, senderB as never)

    expect(windowA.contentView.removed).toEqual([fakes.createdViews[0]])
    expect(windowB.contentView.added).toEqual([fakes.createdViews[0]])
  })

  it('destroys attached native resources when the owner window closes', () => {
    const adapter = new ElectronBrowserViewAdapter()
    const sender = {}
    const window = new fakes.FakeBrowserWindow(1)
    fakes.senderToWindow.set(sender, window)

    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, sender as never)

    window.emit('closed')

    expect(window.contentView.removed).toEqual([fakes.createdViews[0]])
    expect(fakes.createdViews[0]?.webContents.closed).toBe(true)
  })

  it('routes focused page Browser shortcuts through the main command capability', () => {
    const adapter = new ElectronBrowserViewAdapter()
    const service = { handleNativeCommand: vi.fn() }
    adapter.setService(service as never)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })

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

  it('does not steal embedded page text-input cursor shortcuts on macOS', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' })
    const adapter = new ElectronBrowserViewAdapter()
    const service = { handleNativeCommand: vi.fn() }
    adapter.setService(service as never)
    adapter.createView('tab-1', { partition: 'persist:test', preferences: {} })

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
    adapter.showView('tab-1', { x: 0, y: 0, width: 100, height: 100 }, sender as never)
    adapter.hideView('tab-1')

    window.emit('closed')

    expect(window.contentView.removed).toEqual([fakes.createdViews[0]])
    expect(fakes.createdViews[0]?.webContents.closed).toBe(true)
    expect(service.removeNativeClosedTabs).toHaveBeenCalledWith(['tab-1'])
  })
})
