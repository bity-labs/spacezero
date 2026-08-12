import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type SidePaneCategoryId = 'files' | 'git' | 'browser' | 'terminal'

export type SidePaneTab = {
  id: string
  categoryId: SidePaneCategoryId
  resourceId?: string
  label?: string
  preview?: boolean
  dirty?: boolean
}

export type SidePaneLayoutState = {
  isOpen: boolean
  width: number | null
  activeTabId: string | null
  tabs: SidePaneTab[]
  categoryMru: Partial<Record<SidePaneCategoryId, string>>
}

type SidePaneStore = {
  contexts: Record<string, SidePaneLayoutState>
  activateTab: (contextKey: string, tabId: string) => void
  closeTab: (contextKey: string, tabId: string) => void
  collapse: (contextKey: string) => void
  openCategory: (contextKey: string, categoryId: SidePaneCategoryId) => void
  reconcileCategories: (
    contextKey: string,
    availableCategoryIds: readonly SidePaneCategoryId[],
    fallbackCategoryId: SidePaneCategoryId
  ) => void
  reorderTab: (
    contextKey: string,
    sourceId: string,
    targetId: string,
    position: 'before' | 'after'
  ) => void
  setWidth: (contextKey: string, width: number) => void
  synchronizeCategoryTabs: (
    contextKey: string,
    categoryId: SidePaneCategoryId,
    tabs: SidePaneTab[],
    activeTabId: string | null,
    activate: boolean
  ) => void
}

const initialSidePaneState = { contexts: {} }

function emptyContext(): SidePaneLayoutState {
  return { isOpen: false, width: null, activeTabId: null, tabs: [], categoryMru: {} }
}

const sidePaneStorage = createJSONStorage(() => ({
  getItem: (name: string) =>
    localStorage.getItem(name) ?? localStorage.getItem('spacezero.toolPane'),
  removeItem: (name: string) => localStorage.removeItem(name),
  setItem: (name: string, value: string) => localStorage.setItem(name, value)
}))

function migratePersistedState(persistedState: unknown, version: number): unknown {
  if (version >= 1 || !persistedState || typeof persistedState !== 'object') return persistedState
  const legacyContexts = (persistedState as { contexts?: Record<string, unknown> }).contexts
  if (!legacyContexts) return persistedState
  const contexts: Record<string, SidePaneLayoutState> = {}
  for (const [contextKey, value] of Object.entries(legacyContexts)) {
    if (!value || typeof value !== 'object') continue
    const legacy = value as { isOpen?: boolean; width?: number | null; activeToolId?: unknown }
    const categoryId = isSidePaneCategoryId(legacy.activeToolId) ? legacy.activeToolId : null
    const tab = categoryId ? { id: `${categoryId}:1`, categoryId } : null
    contexts[contextKey] = {
      isOpen: Boolean(legacy.isOpen && tab),
      width: typeof legacy.width === 'number' ? legacy.width : null,
      activeTabId: tab?.id ?? null,
      tabs: tab ? [tab] : [],
      categoryMru: tab ? { [tab.categoryId]: tab.id } : {}
    }
  }
  return { contexts }
}

function toPersistedContext(context: SidePaneLayoutState): SidePaneLayoutState {
  const tabs = context.tabs
    .filter((tab) => !tab.preview)
    .map(({ dirty: _dirty, preview: _preview, ...tab }) => tab)
  const activeTab = tabs.find((tab) => tab.id === context.activeTabId) ?? tabs[0] ?? null
  const tabIds = new Set(tabs.map((tab) => tab.id))
  const categoryMru = Object.fromEntries(
    Object.entries(context.categoryMru).filter(
      ([, tabId]) => typeof tabId === 'string' && tabIds.has(tabId)
    )
  ) as Partial<Record<SidePaneCategoryId, string>>
  for (const tab of tabs) categoryMru[tab.categoryId] ??= tab.id
  if (activeTab) categoryMru[activeTab.categoryId] = activeTab.id
  return {
    ...context,
    isOpen: context.isOpen && activeTab !== null,
    activeTabId: activeTab?.id ?? null,
    tabs,
    categoryMru
  }
}

function isSidePaneCategoryId(value: unknown): value is SidePaneCategoryId {
  return value === 'files' || value === 'git' || value === 'browser' || value === 'terminal'
}

const useSidePaneStore = create<SidePaneStore>()(
  persist(
    (set) => ({
      ...initialSidePaneState,
      activateTab: (contextKey, tabId) =>
        set((state) => {
          const context = state.contexts[contextKey]
          const tab = context?.tabs.find((candidate) => candidate.id === tabId)
          if (!context || !tab) return state
          return {
            contexts: {
              ...state.contexts,
              [contextKey]: {
                ...context,
                isOpen: true,
                activeTabId: tab.id,
                categoryMru: { ...context.categoryMru, [tab.categoryId]: tab.id }
              }
            }
          }
        }),
      closeTab: (contextKey, tabId) =>
        set((state) => {
          const context = state.contexts[contextKey]
          if (!context) return state
          const closedIndex = context.tabs.findIndex((tab) => tab.id === tabId)
          if (closedIndex < 0) return state
          const closedTab = context.tabs[closedIndex]
          const tabs = context.tabs.filter((tab) => tab.id !== tabId)
          const activeTabId =
            context.activeTabId === tabId
              ? (tabs[Math.min(closedIndex, tabs.length - 1)]?.id ?? null)
              : context.activeTabId
          const categoryMru = { ...context.categoryMru }
          if (closedTab && categoryMru[closedTab.categoryId] === tabId) {
            const prior = [...tabs].reverse().find((tab) => tab.categoryId === closedTab.categoryId)
            if (prior) categoryMru[closedTab.categoryId] = prior.id
            else delete categoryMru[closedTab.categoryId]
          }
          return {
            contexts: {
              ...state.contexts,
              [contextKey]: {
                ...context,
                isOpen: tabs.length > 0 && context.isOpen,
                activeTabId,
                tabs,
                categoryMru
              }
            }
          }
        }),
      collapse: (contextKey) =>
        set((state) => {
          const context = state.contexts[contextKey] ?? emptyContext()
          return {
            contexts: {
              ...state.contexts,
              [contextKey]: { ...context, isOpen: false }
            }
          }
        }),
      openCategory: (contextKey, categoryId) =>
        set((state) => {
          const context = state.contexts[contextKey] ?? emptyContext()
          const existingTab =
            context.tabs.find((tab) => tab.id === context.categoryMru[categoryId]) ??
            context.tabs.find((tab) => tab.categoryId === categoryId)
          const tab = existingTab ?? { id: `${categoryId}:1`, categoryId }
          const tabs = existingTab ? context.tabs : [...context.tabs, tab]
          return {
            contexts: {
              ...state.contexts,
              [contextKey]: {
                ...context,
                isOpen: true,
                activeTabId: tab.id,
                tabs,
                categoryMru: { ...context.categoryMru, [categoryId]: tab.id }
              }
            }
          }
        }),
      reconcileCategories: (contextKey, availableCategoryIds, fallbackCategoryId) =>
        set((state) => {
          const context = state.contexts[contextKey]
          if (!context) return state
          const availableCategories = new Set(availableCategoryIds)
          const tabs = context.tabs.filter((tab) => availableCategories.has(tab.categoryId))
          let activeTab = tabs.find((tab) => tab.id === context.activeTabId) ?? null
          if (!activeTab) {
            activeTab = tabs.find((tab) => tab.categoryId === fallbackCategoryId) ?? tabs[0] ?? null
          }
          if (!activeTab && context.isOpen && availableCategories.has(fallbackCategoryId)) {
            activeTab = { id: `${fallbackCategoryId}:1`, categoryId: fallbackCategoryId }
            tabs.push(activeTab)
          }
          const tabIds = new Set(tabs.map((tab) => tab.id))
          const categoryMru = Object.fromEntries(
            Object.entries(context.categoryMru).filter(
              ([categoryId, tabId]) =>
                availableCategories.has(categoryId as SidePaneCategoryId) &&
                typeof tabId === 'string' &&
                tabIds.has(tabId)
            )
          ) as Partial<Record<SidePaneCategoryId, string>>
          if (activeTab) categoryMru[activeTab.categoryId] = activeTab.id
          return {
            contexts: {
              ...state.contexts,
              [contextKey]: {
                ...context,
                isOpen: context.isOpen && activeTab !== null,
                activeTabId: activeTab?.id ?? null,
                tabs,
                categoryMru
              }
            }
          }
        }),
      reorderTab: (contextKey, sourceId, targetId, position) =>
        set((state) => {
          const context = state.contexts[contextKey]
          if (!context || sourceId === targetId) return state
          const source = context.tabs.find((tab) => tab.id === sourceId)
          if (!source) return state
          const tabs = context.tabs.filter((tab) => tab.id !== sourceId)
          const targetIndex = tabs.findIndex((tab) => tab.id === targetId)
          if (targetIndex < 0) return state
          const insertionIndex = position === 'before' ? targetIndex : targetIndex + 1
          tabs.splice(insertionIndex, 0, source)
          return {
            contexts: {
              ...state.contexts,
              [contextKey]: { ...context, tabs }
            }
          }
        }),
      setWidth: (contextKey, width) =>
        set((state) => {
          const context = state.contexts[contextKey] ?? emptyContext()
          return {
            contexts: {
              ...state.contexts,
              [contextKey]: { ...context, width }
            }
          }
        }),
      synchronizeCategoryTabs: (contextKey, categoryId, synchronizedTabs, activeTabId, activate) =>
        set((state) => {
          const context = state.contexts[contextKey] ?? emptyContext()
          const remainingTabs = [...synchronizedTabs]
          const tabs = context.tabs.flatMap((tab) => {
            if (tab.categoryId !== categoryId) return [tab]
            const matchingIndex = remainingTabs.findIndex((candidate) => candidate.id === tab.id)
            if (matchingIndex >= 0) {
              const [matchingTab] = remainingTabs.splice(matchingIndex, 1)
              return matchingTab ? [matchingTab] : []
            }
            const replacement = remainingTabs.shift()
            return replacement ? [replacement] : []
          })
          tabs.push(...remainingTabs)
          const synchronizedTabIds = new Set(tabs.map((tab) => tab.id))
          const currentActiveTab = tabs.find((tab) => tab.id === context.activeTabId)
          const requestedActiveTab = tabs.find((tab) => tab.id === activeTabId)
          const shouldFollowCategoryActive =
            context.tabs.find((tab) => tab.id === context.activeTabId)?.categoryId === categoryId
          const nextActiveTab =
            activate || shouldFollowCategoryActive
              ? (requestedActiveTab ?? currentActiveTab ?? tabs[0] ?? null)
              : (currentActiveTab ?? null)
          const categoryMru = Object.fromEntries(
            Object.entries(context.categoryMru).filter(
              ([, tabId]) => typeof tabId === 'string' && synchronizedTabIds.has(tabId)
            )
          ) as Partial<Record<SidePaneCategoryId, string>>
          if (requestedActiveTab) categoryMru[categoryId] = requestedActiveTab.id
          if (nextActiveTab) categoryMru[nextActiveTab.categoryId] = nextActiveTab.id
          return {
            contexts: {
              ...state.contexts,
              [contextKey]: {
                ...context,
                isOpen: activate ? nextActiveTab !== null : context.isOpen && tabs.length > 0,
                activeTabId: nextActiveTab?.id ?? null,
                tabs,
                categoryMru
              }
            }
          }
        })
    }),
    {
      name: 'spacezero.sidePane',
      storage: sidePaneStorage,
      partialize: (state) => ({
        contexts: Object.fromEntries(
          Object.entries(state.contexts).map(([contextKey, context]) => [
            contextKey,
            toPersistedContext(context)
          ])
        )
      }),
      version: 1,
      migrate: migratePersistedState
    }
  )
)

function resetSidePaneStore(): void {
  useSidePaneStore.setState(initialSidePaneState)
}

export { resetSidePaneStore, useSidePaneStore }
