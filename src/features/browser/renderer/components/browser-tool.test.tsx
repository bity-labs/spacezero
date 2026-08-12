import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppCommandProvider } from '../../../app-commands/renderer/app-command-context'
import {
  CommandPaletteControllerProvider,
  useCommandPaletteController
} from '../../../command-palette/renderer/command-palette-controller'
import { KeyboardShortcutsProvider } from '../../../keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorTrigger
} from '@renderer/components/ui/model-selector'
import type { BrowserContext, BrowserEvent } from '../../shared'
import { resetSidePaneStore, useSidePaneStore } from '../../../side-pane/renderer/side-pane-store'
import { BrowserTool } from './browser-tool'

const context = { kind: 'workspace-session' as const, sessionId: 'workspace-1' }
const contextKey = 'session:workspace-1'

type BrowserApi = ReturnType<typeof installBrowserApi>

type TestTab = {
  id: string
  url: string | null
  title: string | null
  faviconUrl: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
}

function makeTab(id: string, overrides: Partial<TestTab> = {}): TestTab {
  return {
    id,
    url: null,
    title: null,
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    error: null,
    ...overrides
  }
}

function installBrowserApi(initialTab: Partial<TestTab> = {}, initialTabs?: TestTab[]) {
  let state = {
    contextKey,
    activeTabId: initialTabs?.[0]?.id ?? 'browser-tab-1',
    tabs: initialTabs ?? [makeTab('browser-tab-1', initialTab)]
  }
  const browserEventListeners: Array<(event: BrowserEvent) => void> = []
  const api = {
    getState: vi.fn(async (_request?: { contextKey: string }) => state),
    navigate: vi.fn(async (request: { tabId?: string; input: string }) => {
      const tabId = request.tabId ?? state.activeTabId
      state = {
        ...state,
        activeTabId: tabId,
        tabs: state.tabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                url: request.input.startsWith('http') ? request.input : `http://${request.input}/`,
                isLoading: true,
                error: null
              }
            : tab
        )
      }
      return state
    }),
    goBack: vi.fn(async () => state),
    goForward: vi.fn(async () => state),
    reload: vi.fn(async () => ({
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId ? { ...tab, isLoading: true } : tab
      )
    })),
    stop: vi.fn(async () => ({
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId ? { ...tab, isLoading: false } : tab
      )
    })),
    openInDefaultBrowser: vi.fn(async () => undefined),
    openDownload: vi.fn(async () => undefined),
    revealDownload: vi.fn(async () => undefined),
    show: vi.fn(async () => state),
    hide: vi.fn(async () => undefined),
    createTab: vi.fn(async () => {
      const tab = makeTab(`browser-tab-${state.tabs.length + 1}`)
      state = { ...state, activeTabId: tab.id, tabs: [...state.tabs, tab] }
      return state
    }),
    selectTab: vi.fn(async (request: { tabId: string }) => {
      state = { ...state, activeTabId: request.tabId }
      return state
    }),
    closeTab: vi.fn(async (request: { tabId: string }) => {
      const tabs = state.tabs.filter((tab) => tab.id !== request.tabId)
      state = tabs.length
        ? { ...state, activeTabId: tabs[0]?.id ?? state.activeTabId, tabs }
        : { ...state, activeTabId: 'browser-tab-blank', tabs: [makeTab('browser-tab-blank')] }
      return state
    }),
    reorderTabs: vi.fn(async (request: { tabIds: string[] }) => {
      state = {
        ...state,
        tabs: request.tabIds.map(
          (tabId) => state.tabs.find((tab) => tab.id === tabId) ?? makeTab(tabId)
        )
      }
      return state
    }),
    onEvent: vi.fn((listener: (event: BrowserEvent) => void) => {
      browserEventListeners.push(listener)
      return () => {
        const index = browserEventListeners.indexOf(listener)
        if (index >= 0) browserEventListeners.splice(index, 1)
      }
    }),
    emitBrowserEvent: (event: BrowserEvent) => {
      for (const listener of [...browserEventListeners]) listener(event)
    },
    getTestState: () => state,
    setTestState: (nextState: typeof state) => {
      state = nextState
    }
  }
  Object.defineProperty(window, 'spacezero', {
    configurable: true,
    value: { browser: api }
  })
  return api
}

function TestProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <AppCommandProvider>
      <CommandPaletteControllerProvider>
        <KeyboardShortcutsProvider>{children}</KeyboardShortcutsProvider>
      </CommandPaletteControllerProvider>
    </AppCommandProvider>
  )
}

function renderBrowserTool(
  props: { contextKey: string; context: BrowserContext } = { contextKey, context }
): ReturnType<typeof render> {
  return render(
    <TestProviders>
      <BrowserTool context={props.context} contextKey={props.contextKey} />
    </TestProviders>
  )
}

function renderBrowserToolWithCommandPalette(): ReturnType<typeof render> {
  return render(
    <TestProviders>
      <OpenCommandPaletteButton />
      <BrowserTool context={context} contextKey={contextKey} />
    </TestProviders>
  )
}

function renderBrowserToolWithModelSelector(): ReturnType<typeof render> {
  return render(
    <TestProviders>
      <ModelSelector>
        <ModelSelectorTrigger render={<button type="button" />}>
          Open model selector
        </ModelSelectorTrigger>
        <ModelSelectorContent>Model options</ModelSelectorContent>
      </ModelSelector>
      <BrowserTool context={context} contextKey={contextKey} />
    </TestProviders>
  )
}

function OpenCommandPaletteButton(): React.JSX.Element {
  const commandPalette = useCommandPaletteController()
  return (
    <button type="button" onClick={commandPalette.open}>
      Open command palette
    </button>
  )
}

async function expectNavigateCalled(browser: BrowserApi, input: string): Promise<void> {
  await waitFor(() =>
    expect(browser.navigate).toHaveBeenCalledWith({
      contextKey,
      context,
      tabId: 'browser-tab-1',
      input
    })
  )
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function settlePresentationFrame(): Promise<void> {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

describe('BrowserTool', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetSidePaneStore()
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverStub
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 400,
      y: 100,
      width: 640,
      height: 480,
      top: 100,
      right: 1040,
      bottom: 580,
      left: 400,
      toJSON: () => ({})
    })
  })

  it('occludes native Browser content while the command palette is open and restores it on close', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })
    const user = userEvent.setup()

    renderBrowserToolWithCommandPalette()

    await waitFor(() => expect(browser.show).toHaveBeenCalled())
    await settlePresentationFrame()
    browser.hide.mockClear()
    browser.show.mockClear()

    await user.click(screen.getByRole('button', { name: 'Open command palette' }))

    expect(await screen.findByRole('dialog', { name: 'Command Palette' })).toBeVisible()
    await waitFor(() => expect(browser.hide).toHaveBeenCalledWith({ contextKey, context }))

    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
    )
    await waitFor(() => expect(browser.show).toHaveBeenCalled())
  })

  it('occludes native Browser content while the chat model selector is open and restores it on close', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })
    const user = userEvent.setup()

    renderBrowserToolWithModelSelector()

    await waitFor(() => expect(browser.show).toHaveBeenCalled())
    await settlePresentationFrame()
    browser.hide.mockClear()
    browser.show.mockClear()

    await user.click(screen.getByRole('button', { name: 'Open model selector' }))

    expect(await screen.findByRole('dialog', { name: 'Model Selector' })).toBeVisible()
    await waitFor(() => expect(browser.hide).toHaveBeenCalledWith({ contextKey, context }))

    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Model Selector' })).not.toBeInTheDocument()
    )
    await waitFor(() => expect(browser.show).toHaveBeenCalled())
  })

  it('hides immediately and blocks page input when an overlay opens during a delayed native show', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })
    const pendingShow = deferred<Awaited<ReturnType<BrowserApi['show']>>>()
    let nativeAttached = false
    let pageInputCount = 0
    browser.show.mockImplementationOnce(() => {
      nativeAttached = true
      return pendingShow.promise
    })
    browser.hide.mockImplementation(async () => {
      nativeAttached = false
    })
    const attemptPageInput = (): void => {
      if (nativeAttached) pageInputCount += 1
    }
    const user = userEvent.setup()

    renderBrowserToolWithCommandPalette()

    await waitFor(() => expect(browser.show).toHaveBeenCalled())
    expect(nativeAttached).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Open command palette' }))
    expect(await screen.findByRole('dialog', { name: 'Command Palette' })).toBeVisible()
    await waitFor(() => expect(browser.hide).toHaveBeenCalledWith({ contextKey, context }))
    expect(nativeAttached).toBe(false)
    attemptPageInput()
    expect(pageInputCount).toBe(0)

    pendingShow.resolve(browser.getTestState())

    await act(async () => pendingShow.promise)
    expect(nativeAttached).toBe(false)
    attemptPageInput()
    expect(pageInputCount).toBe(0)
  })

  it('shows immediately when an overlay closes while an older native hide is delayed', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })
    const user = userEvent.setup()

    renderBrowserToolWithCommandPalette()
    await waitFor(() => expect(browser.show).toHaveBeenCalled())
    await settlePresentationFrame()
    browser.show.mockClear()

    const pendingHide = deferred<undefined>()
    browser.hide.mockImplementationOnce(() => pendingHide.promise)
    await user.click(screen.getByRole('button', { name: 'Open command palette' }))
    expect(await screen.findByRole('dialog', { name: 'Command Palette' })).toBeVisible()
    await waitFor(() => expect(browser.hide).toHaveBeenCalled())

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
    )
    await waitFor(() => expect(browser.show).toHaveBeenCalled())

    pendingHide.resolve(undefined)
    await act(async () => pendingHide.promise)

    expect(browser.show).toHaveBeenCalled()
  })

  it('hides and shows the next context immediately when an older native show is delayed', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })
    const user = userEvent.setup()
    const view = renderBrowserToolWithCommandPalette()

    await waitFor(() => expect(browser.show).toHaveBeenCalled())
    await settlePresentationFrame()
    await user.click(screen.getByRole('button', { name: 'Open command palette' }))
    expect(await screen.findByRole('dialog', { name: 'Command Palette' })).toBeVisible()
    await waitFor(() => expect(browser.hide).toHaveBeenCalled())

    browser.hide.mockClear()
    browser.show.mockClear()
    const pendingShow = deferred<Awaited<ReturnType<BrowserApi['show']>>>()
    browser.show.mockImplementationOnce(() => pendingShow.promise)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(browser.show).toHaveBeenCalledTimes(1))

    view.unmount()
    const nextContext = { kind: 'workspace-session' as const, sessionId: 'workspace-2' }
    const nextContextKey = 'session:workspace-2'
    renderBrowserTool({ contextKey: nextContextKey, context: nextContext })

    await waitFor(() => expect(browser.hide).toHaveBeenCalledWith({ contextKey, context }))
    await waitFor(() =>
      expect(browser.show).toHaveBeenLastCalledWith(
        expect.objectContaining({ contextKey: nextContextKey, context: nextContext })
      )
    )

    pendingShow.resolve(browser.getTestState())
    await act(async () => pendingShow.promise)

    expect(browser.show).toHaveBeenLastCalledWith(
      expect.objectContaining({ contextKey: nextContextKey, context: nextContext })
    )
  })

  it('shows a focused blank URL field and opens submitted URLs through preload contracts', async () => {
    const browser = installBrowserApi()
    const user = userEvent.setup()

    renderBrowserTool()

    const input = await screen.findByLabelText('Browser URL')
    await waitFor(() => expect(input).toHaveFocus())
    expect(
      screen.queryByText('Enter a URL or search terms to open a secure Browser page.')
    ).not.toBeInTheDocument()
    expect(input).toHaveAttribute('placeholder', 'Enter a URL or search terms')

    await user.type(input, 'localhost:4173')
    await user.click(screen.getByRole('button', { name: 'Go' }))

    await expectNavigateCalled(browser, 'localhost:4173')
  })

  it('shows the absolute-path failure when a relative local HTML path is submitted', async () => {
    const browser = installBrowserApi()
    browser.navigate.mockRejectedValueOnce(
      new Error('Enter an absolute local HTML file path for this operating system.')
    )
    const user = userEvent.setup()

    renderBrowserTool()

    const input = await screen.findByLabelText('Browser URL')
    await user.type(input, 'preview/index.html')
    await user.click(screen.getByRole('button', { name: 'Go' }))

    await expectNavigateCalled(browser, 'preview/index.html')
    expect(
      await screen.findByText('Enter an absolute local HTML file path for this operating system.')
    ).toBeInTheDocument()
  })

  it('does not navigate or show an IPC error when Enter submits whitespace-only input', async () => {
    const browser = installBrowserApi()
    browser.navigate.mockRejectedValueOnce(
      new Error("Error invoking remote method 'browser:navigate': input is too small")
    )
    const user = userEvent.setup()

    renderBrowserTool()

    const input = await screen.findByLabelText('Browser URL')
    await user.type(input, '   ')
    await user.keyboard('{Enter}')

    expect(browser.navigate).not.toHaveBeenCalled()
    expect(screen.queryByText(/Error invoking remote method/)).not.toBeInTheDocument()
  })

  it('disables Go while the trimmed address is empty', async () => {
    installBrowserApi()
    const user = userEvent.setup()

    renderBrowserTool()

    const input = await screen.findByLabelText('Browser URL')
    const go = screen.getByRole('button', { name: 'Go' })
    expect(go).toBeDisabled()

    await user.type(input, '   ')
    expect(go).toBeDisabled()

    await user.type(input, 'spacezero.dev')
    expect(go).toBeEnabled()
  })

  it('reflects Back and Forward enablement from active-tab runtime history', async () => {
    installBrowserApi({ url: 'https://example.com/', canGoBack: true, canGoForward: false })

    renderBrowserTool()

    expect(await screen.findByRole('button', { name: 'Back' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled()
  })

  it('switches Reload to a tooltip-backed Stop loading icon while loading and invokes stop', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/', isLoading: true })
    const user = userEvent.setup()

    renderBrowserTool()

    const stop = await screen.findByRole('button', { name: 'Stop loading' })
    expect(stop).toHaveAttribute('title', 'Stop loading')
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    expect(screen.queryByText('Stop')).not.toBeInTheDocument()
    await user.click(stop)

    await waitFor(() =>
      expect(browser.stop).toHaveBeenCalledWith({ contextKey, context, tabId: 'browser-tab-1' })
    )
    expect(browser.reload).not.toHaveBeenCalled()
  })

  it('does not replace builder URL edits when state refreshes during editing', async () => {
    const user = userEvent.setup()
    installBrowserApi({ url: 'https://committed.example/' })

    renderBrowserTool()

    const input = await screen.findByLabelText('Browser URL')
    await user.clear(input)
    await user.type(input, 'draft search')

    expect(input).toHaveValue('draft search')
  })

  it('renders navigation failures in chrome and retries the failed URL', async () => {
    const browser = installBrowserApi({ url: 'https://down.example/', error: 'Host unavailable' })
    const user = userEvent.setup()

    renderBrowserTool()

    expect(await screen.findByText('Host unavailable')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await expectNavigateCalled(browser, 'https://down.example/')
  })

  it('uses compact icon-only Browser toolbar controls and removes default-browser chrome', async () => {
    installBrowserApi({ url: 'https://example.com/', canGoBack: true, canGoForward: true })

    renderBrowserTool()

    expect(await screen.findByRole('button', { name: 'Back' })).toHaveAttribute('title', 'Back')
    expect(screen.getByRole('button', { name: 'Forward' })).toHaveAttribute('title', 'Forward')
    expect(screen.getByRole('button', { name: 'Reload' })).toHaveAttribute('title', 'Reload')
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('title', 'Go')
    expect(
      screen.queryByRole('button', { name: 'Open in default browser' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Reload')).not.toBeInTheDocument()
    expect(screen.queryByText('Go')).not.toBeInTheDocument()
  })

  it('shows safe Browser download completion metadata with main-owned actions', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/download' })
    const user = userEvent.setup()

    renderBrowserTool()
    await screen.findByLabelText('Browser URL')
    await waitFor(() => expect(browser.onEvent).toHaveBeenCalled())

    act(() => {
      browser.emitBrowserEvent({
        type: 'download-updated',
        download: {
          id: 'download-1',
          tabId: 'browser-tab-1',
          filename: 'report.pdf',
          status: 'completed',
          receivedBytes: 42,
          totalBytes: 42
        }
      })
    })

    expect(await screen.findByLabelText('Browser downloads')).toHaveTextContent('report.pdf')
    expect(screen.getByLabelText('Browser downloads')).not.toHaveTextContent('/tmp')
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.click(screen.getByRole('button', { name: 'Reveal in folder' }))

    expect(browser.openDownload).toHaveBeenCalledWith({ downloadId: 'download-1' })
    expect(browser.revealDownload).toHaveBeenCalledWith({ downloadId: 'download-1' })
  })

  it('replays owning Browser download completion after unmount without leaking to another context', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/download' })
    const user = userEvent.setup()

    const { unmount } = renderBrowserTool()
    await screen.findByLabelText('Browser URL')
    await waitFor(() => expect(browser.onEvent).toHaveBeenCalled())
    unmount()

    act(() => {
      browser.emitBrowserEvent({
        type: 'download-updated',
        download: {
          id: 'download-1',
          tabId: 'browser-tab-1',
          filename: 'report.pdf',
          status: 'completed',
          receivedBytes: 42,
          totalBytes: 42
        }
      })
    })

    browser.setTestState({
      contextKey: 'session:workspace-2',
      activeTabId: 'browser-tab-other',
      tabs: [makeTab('browser-tab-other', { url: 'https://other.example/' })]
    })
    const otherContext = { kind: 'workspace-session' as const, sessionId: 'workspace-2' }
    const otherRender = render(
      <TestProviders>
        <BrowserTool context={otherContext} contextKey="session:workspace-2" />
      </TestProviders>
    )
    await screen.findByLabelText('Browser URL')
    expect(screen.queryByLabelText('Browser downloads')).not.toBeInTheDocument()
    otherRender.unmount()

    browser.setTestState({
      contextKey,
      activeTabId: 'browser-tab-1',
      tabs: [makeTab('browser-tab-1', { url: 'https://example.com/download' })]
    })
    renderBrowserTool()
    expect(await screen.findByLabelText('Browser downloads')).toHaveTextContent('report.pdf')
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.click(screen.getByRole('button', { name: 'Reveal in folder' }))

    expect(browser.openDownload).toHaveBeenCalledWith({ downloadId: 'download-1' })
    expect(browser.revealDownload).toHaveBeenCalledWith({ downloadId: 'download-1' })
  })

  it('clears stale tab and download state when one mounted Browser is rebound A to B to A', async () => {
    const browser = installBrowserApi({ url: 'https://a.example/download', title: 'Context A' })
    browser.getState.mockImplementation(async (request?: { contextKey: string }) => {
      if (request?.contextKey === 'session:workspace-2') throw new Error('state unavailable')
      return {
        contextKey,
        activeTabId: 'browser-tab-1',
        tabs: [makeTab('browser-tab-1', { url: 'https://a.example/download', title: 'Context A' })]
      }
    })
    const otherContext = { kind: 'workspace-session' as const, sessionId: 'workspace-2' }

    const view = renderBrowserTool()
    await waitFor(() =>
      expect(useSidePaneStore.getState().contexts[contextKey]?.tabs).toContainEqual(
        expect.objectContaining({ id: 'browser-tab-1', title: 'Context A' })
      )
    )
    await waitFor(() => expect(browser.onEvent).toHaveBeenCalled())

    act(() => {
      browser.emitBrowserEvent({
        type: 'download-updated',
        download: {
          id: 'download-a',
          tabId: 'browser-tab-1',
          filename: 'a.zip',
          status: 'completed',
          receivedBytes: 1,
          totalBytes: 1
        }
      })
    })
    expect(await screen.findByLabelText('Browser downloads')).toHaveTextContent('a.zip')

    view.rerender(
      <TestProviders>
        <BrowserTool context={otherContext} contextKey="session:workspace-2" />
      </TestProviders>
    )

    expect(screen.getByLabelText('Browser URL')).toHaveValue('')
    expect(screen.queryByLabelText('Browser downloads')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('state unavailable')).toBeInTheDocument())
    expect(useSidePaneStore.getState().contexts['session:workspace-2']).toBeUndefined()
    expect(screen.queryByLabelText('Browser downloads')).not.toBeInTheDocument()

    view.rerender(
      <TestProviders>
        <BrowserTool context={context} contextKey={contextKey} />
      </TestProviders>
    )

    await waitFor(() =>
      expect(screen.getByLabelText('Browser URL')).toHaveValue('https://a.example/download')
    )
    expect(screen.getByLabelText('Browser downloads')).toHaveTextContent('a.zip')
  })

  it('uses focus-scoped browser shortcuts without firing when focus leaves Browser', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })
    const user = userEvent.setup()

    render(
      <TestProviders>
        <button type="button">Outside</button>
        <BrowserTool context={context} contextKey={contextKey} />
      </TestProviders>
    )

    const input = await screen.findByLabelText('Browser URL')
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    await user.keyboard('{Control>}l{/Control}')
    expect(input).toHaveFocus()

    browser.reload.mockClear()
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    await user.keyboard('{Control>}r{/Control}')
    expect(browser.reload).not.toHaveBeenCalled()
  })

  it('refreshes chrome state from context-scoped native Browser events', async () => {
    const browser = installBrowserApi({ url: 'https://start.example/', isLoading: true })
    const user = userEvent.setup()

    renderBrowserTool()

    const input = await screen.findByLabelText('Browser URL')
    expect(screen.getByRole('button', { name: 'Stop loading' })).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()

    act(() => {
      browser.emitBrowserEvent({
        type: 'state-changed',
        contextKey,
        state: {
          contextKey,
          activeTabId: 'browser-tab-1',
          tabs: [
            {
              id: 'browser-tab-1',
              url: 'https://settled.example/',
              title: null,
              faviconUrl: null,
              isLoading: false,
              canGoBack: true,
              canGoForward: false,
              error: null
            }
          ]
        }
      })
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument())
    await waitFor(() => expect(input).toHaveValue('https://settled.example/'))
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled()

    await user.clear(input)
    await user.type(input, 'draft search')
    act(() => {
      browser.emitBrowserEvent({
        type: 'state-changed',
        contextKey,
        state: {
          contextKey,
          activeTabId: 'browser-tab-1',
          tabs: [
            {
              id: 'browser-tab-1',
              url: 'https://other.example/',
              title: null,
              faviconUrl: null,
              isLoading: false,
              canGoBack: true,
              canGoForward: false,
              error: null
            }
          ]
        }
      })
    })

    expect(input).toHaveValue('draft search')
  })

  it('projects every Browser page into the peer Side Pane strip without a nested tab strip', async () => {
    installBrowserApi({}, [
      makeTab('browser-tab-1', { title: 'Example', url: 'https://example.com/' }),
      makeTab('browser-tab-2', { title: 'Docs', url: 'https://docs.example/' })
    ])

    renderBrowserTool()

    await waitFor(() =>
      expect(useSidePaneStore.getState().contexts[contextKey]).toMatchObject({
        isOpen: true,
        activeTabId: 'browser-tab-1',
        tabs: [
          { id: 'browser-tab-1', categoryId: 'browser', title: 'Example' },
          { id: 'browser-tab-2', categoryId: 'browser', title: 'Docs' }
        ]
      })
    )
    expect(screen.queryByRole('tablist', { name: 'Browser tabs' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New tab' })).not.toBeInTheDocument()
  })

  it('promotes a supported native popup into a newly active peer Side Pane tab', async () => {
    const browser = installBrowserApi({ title: 'Parent', url: 'https://parent.example/' })

    renderBrowserTool()
    await waitFor(() =>
      expect(screen.getByLabelText('Browser URL')).toHaveValue('https://parent.example/')
    )
    await waitFor(() => expect(browser.show).toHaveBeenCalled())

    act(() => {
      browser.emitBrowserEvent({
        type: 'state-changed',
        contextKey,
        state: {
          contextKey,
          activeTabId: 'browser-tab-2',
          tabs: [
            makeTab('browser-tab-1', { title: 'Parent', url: 'https://parent.example/' }),
            makeTab('browser-tab-2', { title: 'Popup', url: 'https://popup.example/' })
          ]
        }
      })
    })

    await waitFor(() =>
      expect(useSidePaneStore.getState().contexts[contextKey]).toMatchObject({
        activeTabId: 'browser-tab-2',
        tabs: [
          { id: 'browser-tab-1', categoryId: 'browser', title: 'Parent' },
          { id: 'browser-tab-2', categoryId: 'browser', title: 'Popup' }
        ]
      })
    )
  })

  it('selects the main-owned page when its peer Side Pane tab becomes active', async () => {
    const browser = installBrowserApi({}, [
      makeTab('browser-tab-1', { title: 'First', url: 'https://first.example/' }),
      makeTab('browser-tab-2', { title: 'Second', url: 'https://second.example/' })
    ])

    renderBrowserTool()
    await waitFor(() =>
      expect(screen.getByLabelText('Browser URL')).toHaveValue('https://first.example/')
    )

    act(() => {
      useSidePaneStore.getState().activateTab(contextKey, 'browser-tab-2')
    })

    await waitFor(() =>
      expect(browser.selectTab).toHaveBeenCalledWith({
        contextKey,
        context,
        tabId: 'browser-tab-2'
      })
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Browser URL')).toHaveValue('https://second.example/')
    )
  })

  it('runs focus-scoped mod+t and mod+w through stable Browser command identities', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })
    const user = userEvent.setup()

    renderBrowserTool()

    await user.click(await screen.findByLabelText('Browser URL'))
    await user.keyboard('{Control>}t{/Control}')
    await waitFor(() => expect(browser.createTab).toHaveBeenCalledWith({ contextKey, context }))

    await user.keyboard('{Control>}w{/Control}')
    await waitFor(() =>
      expect(browser.closeTab).toHaveBeenCalledWith({ contextKey, context, tabId: 'browser-tab-2' })
    )
  })

  it('focuses the chrome address field from native Browser command events', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })

    renderBrowserTool()

    const input = await screen.findByLabelText('Browser URL')
    input.blur()
    act(() => {
      browser.emitBrowserEvent({
        type: 'command-requested',
        contextKey,
        commandId: 'browser.focusAddress'
      })
    })

    await waitFor(() => expect(input).toHaveFocus())
  })

  it('does not run reload shortcut while a text-input context owns the keystroke', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })
    const user = userEvent.setup()

    renderBrowserTool()

    const input = await screen.findByLabelText('Browser URL')
    await user.click(input)
    await user.keyboard('{Control>}r{/Control}')

    expect(browser.reload).not.toHaveBeenCalled()
  })
})
