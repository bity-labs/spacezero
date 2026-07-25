import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BrowserTool } from './browser-tool'

const context = { kind: 'workspace-session' as const, sessionId: 'workspace-1' }
const contextKey = 'session:workspace-1'

function installBrowserApi() {
  const state = {
    contextKey,
    activeTabId: 'browser-tab-1',
    tabs: [{ id: 'browser-tab-1', url: null, title: null, isLoading: false, error: null }]
  }
  const api = {
    getState: vi.fn(async () => state),
    navigate: vi.fn(async (request: { input: string }) => ({
      ...state,
      tabs: [{ ...state.tabs[0], url: `http://${request.input}/` }]
    })),
    show: vi.fn(async () => state),
    hide: vi.fn(async () => undefined),
    closeTab: vi.fn(async () => state)
  }
  Object.defineProperty(window, 'spacezero', {
    configurable: true,
    value: { browser: api }
  })
  return api
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

    render(<BrowserTool context={context} contextKey={contextKey} />)

    const input = await screen.findByLabelText('Browser URL')
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.getByText('Enter a URL to open a secure Browser page.')).toBeInTheDocument()

    await user.type(input, 'localhost:4173')
    await user.click(screen.getByRole('button', { name: 'Go' }))

    await waitFor(() =>
      expect(browser.navigate).toHaveBeenCalledWith({
        contextKey,
        context,
        tabId: 'browser-tab-1',
        input: 'localhost:4173'
      })
    )
  })
})
