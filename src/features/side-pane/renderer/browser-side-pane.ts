import type { BrowserContext, BrowserState, BrowserTab } from '../../browser/shared'
import { useSidePaneStore, type SidePaneTab } from './side-pane-store'

type BrowserSidePaneContext = {
  contextKey: string
  context: BrowserContext
}

export function syncBrowserSidePaneState(
  contextKey: string,
  state: BrowserState,
  activate = false
): void {
  useSidePaneStore
    .getState()
    .syncCategoryTabs(
      contextKey,
      'browser',
      state.tabs.map(browserTabToSidePaneTab),
      state.activeTabId,
      activate
    )
}

export async function focusOrCreateBrowserSidePaneTab({
  contextKey,
  context
}: BrowserSidePaneContext): Promise<BrowserState> {
  let state = await window.spacezero.browser.getState({ contextKey, context })
  const layout = useSidePaneStore.getState().contexts[contextKey]
  const preferredTabId =
    layout?.tabs.find((tab) => tab.id === layout.activeTabId && tab.categoryId === 'browser')?.id ??
    layout?.categoryMru.browser
  if (preferredTabId && state.tabs.some((tab) => tab.id === preferredTabId)) {
    if (state.activeTabId !== preferredTabId) {
      state = await window.spacezero.browser.selectTab({
        contextKey,
        context,
        tabId: preferredTabId
      })
    }
  } else if (state.tabs.length === 0) {
    state = await window.spacezero.browser.createTab({ contextKey, context })
  }
  syncBrowserSidePaneState(contextKey, state, true)
  return state
}

export async function createBrowserSidePaneTab({
  contextKey,
  context,
  input
}: BrowserSidePaneContext & { input?: string }): Promise<BrowserState> {
  const state = await window.spacezero.browser.createTab({ contextKey, context, input })
  syncBrowserSidePaneState(contextKey, state, true)
  return state
}

export async function closeBrowserSidePaneTab({
  contextKey,
  context,
  tabId
}: BrowserSidePaneContext & { tabId: string }): Promise<BrowserState> {
  const state = await window.spacezero.browser.closeTab({ contextKey, context, tabId })
  syncBrowserSidePaneState(contextKey, state)
  return state
}

function browserTabToSidePaneTab(tab: BrowserTab): SidePaneTab {
  return {
    id: tab.id,
    categoryId: 'browser',
    title: browserTabLabel(tab),
    faviconUrl: tab.faviconUrl
  }
}

function browserTabLabel(tab: BrowserTab): string {
  if (tab.title?.trim()) return tab.title
  if (!tab.url) return 'New tab'
  try {
    const url = new URL(tab.url)
    return url.hostname || url.toString()
  } catch {
    return tab.url
  }
}
