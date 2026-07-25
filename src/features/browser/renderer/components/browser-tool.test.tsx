import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppCommandProvider } from '../../../app-commands/renderer/app-command-context'
import { KeyboardShortcutsProvider } from '../../../keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import type { BrowserEvent } from '../../shared'
import { BrowserTool } from './browser-tool'

const context = { kind: 'workspace-session' as const, sessionId: 'workspace-1' }
const contextKey = 'session:workspace-1'

type BrowserApi = ReturnType<typeof installBrowserApi>

function installBrowserApi(
  initialTab: Partial<{
    url: string | null
    title: string | null
    isLoading: boolean
    canGoBack: boolean
    canGoForward: boolean
    error: string | null
  }> = {}
) {
  const state = {
    contextKey,
    activeTabId: 'browser-tab-1',
    tabs: [
      {
        id: 'browser-tab-1',
        url: null,
        title: null,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        error: null,
        ...initialTab
      }
    ]
  }
  const browserEventListeners: Array<(event: BrowserEvent) => void> = []
  const api = {
    getState: vi.fn(async () => state),
    navigate: vi.fn(async (request: { input: string }) => ({
      ...state,
      tabs: [{ ...state.tabs[0], url: request.input.startsWith('http') ? request.input : `http://${request.input}/`, isLoading: true, error: null }]
    })),
    goBack: vi.fn(async () => state),
    goForward: vi.fn(async () => state),
    reload: vi.fn(async () => ({
      ...state,
      tabs: [{ ...state.tabs[0], isLoading: true }]
    })),
    stop: vi.fn(async () => ({
      ...state,
      tabs: [{ ...state.tabs[0], isLoading: false }]
    })),
    openInDefaultBrowser: vi.fn(async () => undefined),
    show: vi.fn(async () => state),
    hide: vi.fn(async () => undefined),
    closeTab: vi.fn(async () => state),
    onEvent: vi.fn((listener: (event: BrowserEvent) => void) => {
      browserEventListeners.push(listener)
      return () => undefined
    }),
    emitBrowserEvent: (event: BrowserEvent) => {
      browserEventListeners[browserEventListeners.length - 1]?.(event)
    }
  }
  Object.defineProperty(window, 'spacezero', {
    configurable: true,
    value: { browser: api }
  })
  return api
}

function renderBrowserTool(): void {
  render(
    <AppCommandProvider>
      <KeyboardShortcutsProvider>
        <BrowserTool context={context} contextKey={contextKey} />
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
