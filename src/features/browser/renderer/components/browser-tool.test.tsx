import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppCommandProvider } from '../../../app-commands/renderer/app-command-context'
import { KeyboardShortcutsProvider } from '../../../keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import type { BrowserContext, BrowserEvent } from '../../shared'
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
            ? { ...tab, url: request.input.startsWith('http') ? request.input : `http://${request.input}/`, isLoading: true, error: null }
            : tab
        )
      }
      return state
    }),
    goBack: vi.fn(async () => state),
    goForward: vi.fn(async () => state),
    reload: vi.fn(async () => ({
      ...state,
      tabs: state.tabs.map((tab) => (tab.id === state.activeTabId ? { ...tab, isLoading: true } : tab))
    })),
    stop: vi.fn(async () => ({
      ...state,
      tabs: state.tabs.map((tab) => (tab.id === state.activeTabId ? { ...tab, isLoading: false } : tab))
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
      state = { ...state, tabs: request.tabIds.map((tabId) => state.tabs.find((tab) => tab.id === tabId) ?? makeTab(tabId)) }
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

function renderBrowserTool(
  props: { contextKey: string; context: BrowserContext } = { contextKey, context }
): ReturnType<typeof render> {
  return render(
    <AppCommandProvider>
      <KeyboardShortcutsProvider>
        <BrowserTool context={props.context} contextKey={props.contextKey} />
      </KeyboardShortcutsProvider>
    </AppCommandProvider>
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

describe('BrowserTool', () => {
  beforeEach(() => {
    class ResizeObserverStub {
      observe(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })
  })

  it('shows a focused blank URL field and opens submitted URLs through preload contracts', async () => {
    const browser = installBrowserApi()
    const user = userEvent.setup()

    renderBrowserTool()

    const input = await screen.findByLabelText('Browser URL')
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.getByText('Enter a URL or search terms to open a secure Browser page.')).toBeInTheDocument()

    await user.type(input, 'localhost:4173')
    await user.click(screen.getByRole('button', { name: 'Go' }))

    await expectNavigateCalled(browser, 'localhost:4173')
  })

  it('reflects Back and Forward enablement from active-tab runtime history', async () => {
    installBrowserApi({ url: 'https://example.com/', canGoBack: true, canGoForward: false })

    renderBrowserTool()

    expect(await screen.findByRole('button', { name: 'Back' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled()
  })

  it('switches Reload to Stop while loading and invokes stop instead of reload', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/', isLoading: true })
    const user = userEvent.setup()

    renderBrowserTool()

    const stop = await screen.findByRole('button', { name: 'Stop' })
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await user.click(stop)

    await waitFor(() => expect(browser.stop).toHaveBeenCalledWith({ contextKey, context, tabId: 'browser-tab-1' }))
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

  it('opens the active page in the default browser through the typed Browser API', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })
    const user = userEvent.setup()

    renderBrowserTool()

    await user.click(await screen.findByRole('button', { name: 'Open in default browser' }))

    expect(browser.openInDefaultBrowser).toHaveBeenCalledWith({ contextKey, context, tabId: 'browser-tab-1' })
  })

  it('shows safe Browser download completion metadata with main-owned actions', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/download' })
    const user = userEvent.setup()

    renderBrowserTool()
    await screen.findByRole('button', { name: 'Open in default browser' })
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
    await screen.findByRole('button', { name: 'Open in default browser' })
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
      <AppCommandProvider>
        <KeyboardShortcutsProvider>
          <BrowserTool context={otherContext} contextKey="session:workspace-2" />
        </KeyboardShortcutsProvider>
      </AppCommandProvider>
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
    expect(await screen.findByRole('tab', { name: 'Context A' })).toBeInTheDocument()
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
      <AppCommandProvider>
        <KeyboardShortcutsProvider>
          <BrowserTool context={otherContext} contextKey="session:workspace-2" />
        </KeyboardShortcutsProvider>
      </AppCommandProvider>
    )

    expect(screen.queryByRole('tab', { name: 'Context A' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Browser downloads')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('state unavailable')).toBeInTheDocument())
    expect(screen.queryByRole('tab', { name: 'Context A' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Browser downloads')).not.toBeInTheDocument()

    view.rerender(
      <AppCommandProvider>
        <KeyboardShortcutsProvider>
          <BrowserTool context={context} contextKey={contextKey} />
        </KeyboardShortcutsProvider>
      </AppCommandProvider>
    )

    expect(await screen.findByRole('tab', { name: 'Context A' })).toBeInTheDocument()
    expect(screen.getByLabelText('Browser downloads')).toHaveTextContent('a.zip')
  })

  it('uses focus-scoped browser shortcuts without firing when focus leaves Browser', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })
    const user = userEvent.setup()

    render(
      <AppCommandProvider>
        <KeyboardShortcutsProvider>
          <button type="button">Outside</button>
          <BrowserTool context={context} contextKey={contextKey} />
        </KeyboardShortcutsProvider>
      </AppCommandProvider>
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
    expect(await screen.findByText('Loading…')).toBeInTheDocument()

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

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
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

  it('creates, selects, closes, and labels multiple normal tabs', async () => {
    const browser = installBrowserApi({}, [
      makeTab('browser-tab-1', { url: 'https://example.com/path', title: 'Example', faviconUrl: 'https://example.com/favicon.ico' }),
      makeTab('browser-tab-2', { url: 'https://docs.spacezero.dev/guide' })
    ])
    const user = userEvent.setup()

    renderBrowserTool()

    expect(await screen.findByRole('tab', { name: /Example/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /docs.spacezero.dev/ })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /docs.spacezero.dev/ }))
    expect(browser.selectTab).toHaveBeenCalledWith({ contextKey, context, tabId: 'browser-tab-2' })

    await user.click(screen.getByRole('button', { name: 'New tab' }))
    expect(browser.createTab).toHaveBeenCalledWith({ contextKey, context })
    expect(await screen.findByRole('tab', { name: /New tab/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Close New tab/ }))
    expect(browser.closeTab).toHaveBeenCalledWith({ contextKey, context, tabId: 'browser-tab-3' })
  })

  it('shows data favicons, updates them from state, and omits missing favicons cleanly', async () => {
    const browser = installBrowserApi({}, [
      makeTab('browser-tab-1', {
        title: 'Example',
        url: 'https://example.com/',
        faviconUrl: 'data:image/png;base64,old'
      }),
      makeTab('browser-tab-2', { title: 'No icon', url: 'https://no-icon.example/' })
    ])

    renderBrowserTool()

    const exampleTab = await screen.findByRole('tab', { name: 'Example' })
    expect(exampleTab.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,old')
    expect(screen.getByRole('tab', { name: 'No icon' }).querySelector('img')).toBeNull()

    act(() => {
      browser.emitBrowserEvent({
        type: 'state-changed',
        contextKey,
        state: {
          contextKey,
          activeTabId: 'browser-tab-1',
          tabs: [
            makeTab('browser-tab-1', {
              title: 'Example',
              url: 'https://example.com/',
              faviconUrl: 'data:image/png;base64,new'
            }),
            makeTab('browser-tab-2', { title: 'No icon', url: 'https://no-icon.example/' })
          ]
        }
      })
    })

    expect(screen.getByRole('tab', { name: 'Example' }).querySelector('img')).toHaveAttribute(
      'src',
      'data:image/png;base64,new'
    )
  })

  it('hides a favicon image if the sanitized favicon source still fails to load', async () => {
    installBrowserApi({}, [
      makeTab('browser-tab-1', {
        title: 'Example',
        url: 'https://example.com/',
        faviconUrl: 'data:image/png;base64,broken'
      })
    ])

    renderBrowserTool()

    const favicon = (await screen.findByRole('tab', { name: 'Example' })).querySelector('img')
    expect(favicon).not.toBeNull()
    fireEvent.error(favicon as HTMLImageElement)

    expect(favicon).toHaveStyle({ display: 'none' })
  })

  it('selects inactive tabs with roving tab keyboard navigation and keeps close controls separate', async () => {
    const browser = installBrowserApi({}, [
      makeTab('browser-tab-1', { title: 'First', url: 'https://first.example/' }),
      makeTab('browser-tab-2', { title: 'Second', url: 'https://second.example/' }),
      makeTab('browser-tab-3', { title: 'Third', url: 'https://third.example/' })
    ])
    const user = userEvent.setup()

    renderBrowserTool()

    const first = await screen.findByRole('tab', { name: 'First' })
    expect(first).toHaveAttribute('tabIndex', '0')
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveAttribute('tabIndex', '-1')
    expect(first).not.toContainElement(screen.getByRole('button', { name: 'Close First' }))

    first.focus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(browser.selectTab).toHaveBeenLastCalledWith({ contextKey, context, tabId: 'browser-tab-2' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Second' })).toHaveFocus())

    await user.keyboard('{End}')
    await waitFor(() => expect(browser.selectTab).toHaveBeenLastCalledWith({ contextKey, context, tabId: 'browser-tab-3' }))
    await user.keyboard('{Home}')
    await waitFor(() => expect(browser.selectTab).toHaveBeenLastCalledWith({ contextKey, context, tabId: 'browser-tab-1' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'First' })).toHaveFocus())
    await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(browser.selectTab).toHaveBeenLastCalledWith({ contextKey, context, tabId: 'browser-tab-3' }))
  })

  it('reorders tabs with drag and drop while preserving the active selection', async () => {
    const browser = installBrowserApi({}, [
      makeTab('browser-tab-1', { title: 'First', url: 'https://first.example/' }),
      makeTab('browser-tab-2', { title: 'Second', url: 'https://second.example/' })
    ])

    renderBrowserTool()

    const first = await screen.findByRole('tab', { name: /First/ })
    const second = screen.getByRole('tab', { name: /Second/ })
    fireEvent.dragStart(first, {
      dataTransfer: { effectAllowed: '', setData: vi.fn(), getData: vi.fn(() => 'browser-tab-1') }
    })
    fireEvent.drop(second, {
      dataTransfer: { getData: vi.fn(() => 'browser-tab-1') }
    })

    await waitFor(() =>
      expect(browser.reorderTabs).toHaveBeenCalledWith({
        contextKey,
        context,
        tabIds: ['browser-tab-2', 'browser-tab-1']
      })
    )
    expect(browser.selectTab).not.toHaveBeenCalled()
  })

  it('returns to a focused blank tab after closing the final tab', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })
    const user = userEvent.setup()

    renderBrowserTool()

    await user.click(await screen.findByRole('button', { name: /Close example.com/ }))

    expect(browser.closeTab).toHaveBeenCalledWith({ contextKey, context, tabId: 'browser-tab-1' })
    expect(await screen.findByText('Enter a URL or search terms to open a secure Browser page.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Browser URL')).toHaveFocus())
  })

  it('runs focus-scoped mod+t and mod+w through stable Browser command identities', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })
    const user = userEvent.setup()

    renderBrowserTool()

    await user.click(await screen.findByRole('tab', { name: /example.com/ }))
    await user.keyboard('{Control>}t{/Control}')
    await waitFor(() => expect(browser.createTab).toHaveBeenCalledWith({ contextKey, context }))

    await user.keyboard('{Control>}w{/Control}')
    await waitFor(() => expect(browser.closeTab).toHaveBeenCalledWith({ contextKey, context, tabId: 'browser-tab-2' }))
  })

  it('focuses the chrome address field from native Browser command events', async () => {
    const browser = installBrowserApi({ url: 'https://example.com/' })

    renderBrowserTool()

    const input = await screen.findByLabelText('Browser URL')
    input.blur()
    act(() => {
      browser.emitBrowserEvent({ type: 'command-requested', contextKey, commandId: 'browser.focusAddress' })
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
