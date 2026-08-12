import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BrowserState, BrowserTab } from '../../browser/shared'
import {
  closeBrowserSidePaneTab,
  createBrowserSidePaneTab,
  focusOrCreateBrowserSidePaneTab
} from './browser-side-pane'
import { resetSidePaneStore, useSidePaneStore } from './side-pane-store'

const contextKey = 'global-chat'
const context = { kind: 'global-chat' as const }

function tab(id: string, title: string): BrowserTab {
  return {
    id,
    url: `https://${title.toLowerCase()}.example/`,
    title,
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    error: null
  }
}

function state(tabs: BrowserTab[], activeTabId: string): BrowserState {
  return { contextKey, activeTabId, tabs }
}

describe('Browser Side Pane capability', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetSidePaneStore()
  })

  it('creates an explicit page and activates its matching peer Side Pane tab', async () => {
    const nextState = state([tab('browser-tab-1', 'Docs')], 'browser-tab-1')
    const createTab = vi.fn(async () => nextState)
    window.spacezero.browser.createTab = createTab

    await createBrowserSidePaneTab({ contextKey, context, input: 'https://docs.example/' })

    expect(createTab).toHaveBeenCalledWith({
      contextKey,
      context,
      input: 'https://docs.example/'
    })
    expect(useSidePaneStore.getState().contexts[contextKey]).toMatchObject({
      isOpen: true,
      activeTabId: 'browser-tab-1',
      tabs: [{ id: 'browser-tab-1', categoryId: 'browser', title: 'Docs' }]
    })
  })

  it('focuses the most recent existing page and creates only when the collection is empty', async () => {
    const existing = state([tab('browser-tab-existing', 'Existing')], 'browser-tab-existing')
    const getState = vi.fn(async () => existing)
    const createTab = vi.fn(async () => state([tab('browser-tab-new', 'New')], 'browser-tab-new'))
    window.spacezero.browser.getState = getState
    window.spacezero.browser.createTab = createTab

    await focusOrCreateBrowserSidePaneTab({ contextKey, context })

    expect(createTab).not.toHaveBeenCalled()
    expect(useSidePaneStore.getState().contexts[contextKey]?.activeTabId).toBe(
      'browser-tab-existing'
    )

    getState.mockResolvedValueOnce(state([], ''))
    await focusOrCreateBrowserSidePaneTab({ contextKey, context })

    expect(createTab).toHaveBeenCalledTimes(1)
    expect(useSidePaneStore.getState().contexts[contextKey]?.activeTabId).toBe('browser-tab-new')
  })

  it('uses the Side Pane Browser MRU when main persisted a different active page', async () => {
    const pages = [tab('browser-tab-main', 'Main'), tab('browser-tab-mru', 'Recent')]
    useSidePaneStore.getState().syncCategoryTabs(
      contextKey,
      'browser',
      pages.map((page) => ({ id: page.id, categoryId: 'browser' })),
      'browser-tab-mru',
      true
    )
    window.spacezero.browser.getState = vi.fn(async () => state(pages, 'browser-tab-main'))
    const selectTab = vi.fn(async () => state(pages, 'browser-tab-mru'))
    window.spacezero.browser.selectTab = selectTab

    await focusOrCreateBrowserSidePaneTab({ contextKey, context })

    expect(selectTab).toHaveBeenCalledWith({
      contextKey,
      context,
      tabId: 'browser-tab-mru'
    })
    expect(useSidePaneStore.getState().contexts[contextKey]?.activeTabId).toBe('browser-tab-mru')
  })

  it('closes exactly one native page and collapses after the final peer tab closes', async () => {
    useSidePaneStore
      .getState()
      .syncCategoryTabs(
        contextKey,
        'browser',
        [{ id: 'browser-tab-1', categoryId: 'browser', title: 'Docs' }],
        'browser-tab-1',
        true
      )
    const closeTab = vi.fn(async () => state([], ''))
    window.spacezero.browser.closeTab = closeTab

    await closeBrowserSidePaneTab({ contextKey, context, tabId: 'browser-tab-1' })

    expect(closeTab).toHaveBeenCalledWith({ contextKey, context, tabId: 'browser-tab-1' })
    expect(useSidePaneStore.getState().contexts[contextKey]).toMatchObject({
      isOpen: false,
      activeTabId: null,
      tabs: []
    })
  })
})
