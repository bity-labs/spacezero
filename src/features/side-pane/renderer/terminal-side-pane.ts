import { useEffect } from 'react'

import type {
  TerminalContext,
  TerminalCreateResult,
  TerminalDiagnostic,
  TerminalEvent,
  TerminalTab,
  TerminalTabsSnapshot
} from '../../terminal/shared'
import { useSidePaneStore, type SidePaneTab } from './side-pane-store'

type TerminalSidePaneContext = {
  contextKey: string
  context: TerminalContext
}

type TerminalCreateError = {
  message: string
  title: string
  forceNew: boolean
}

const diagnosticsByTerminalId = new Map<string, TerminalDiagnostic[]>()
const createErrorsByContextKey = new Map<string, TerminalCreateError>()
const CREATE_ERROR_TAB_ID = 'terminal:create-error'

export function syncTerminalSidePaneState(
  contextKey: string,
  snapshot: TerminalTabsSnapshot,
  activate = false
): void {
  const activeTabId = terminalSidePaneTabId(
    snapshot.tabs.find((tab) => tab.terminalId === snapshot.activeTerminalId)
  )
  useSidePaneStore
    .getState()
    .synchronizeCategoryTabs(
      contextKey,
      'terminal',
      snapshot.tabs.map(terminalTabToSidePaneTab),
      activeTabId,
      activate
    )
}

export async function focusOrCreateTerminalSidePaneTab({
  contextKey,
  context
}: TerminalSidePaneContext): Promise<TerminalTabsSnapshot> {
  try {
    let result = await window.spacezero.terminal.create({ context, forceNew: false })
    if (result.status === 'empty' || result.tabs?.length === 0) {
      result = await window.spacezero.terminal.create({ context, forceNew: true })
    }
    rememberDiagnostics(result)
    let snapshot = snapshotFromCreateResult(result)

    const layout = useSidePaneStore.getState().contexts[contextKey]
    const preferredTabId =
      layout?.tabs.find((tab) => tab.id === layout.activeTabId && tab.categoryId === 'terminal')
        ?.id ?? layout?.categoryMru.terminal
    const preferredTerminal = snapshot.tabs.find(
      (tab) => terminalSidePaneTabId(tab) === preferredTabId
    )
    if (preferredTerminal && snapshot.activeTerminalId !== preferredTerminal.terminalId) {
      snapshot = await window.spacezero.terminal.selectTab({
        context,
        terminalId: preferredTerminal.terminalId
      })
    }

    clearTerminalSidePaneCreateError(contextKey)
    syncTerminalSidePaneState(contextKey, snapshot, true)
    return snapshot
  } catch (caught) {
    const isRestore = Boolean(
      useSidePaneStore
        .getState()
        .contexts[contextKey]?.tabs.some(
          (tab) =>
            tab.categoryId === 'terminal' && !tab.resourceId && tab.id !== CREATE_ERROR_TAB_ID
        )
    )
    showTerminalSidePaneCreateError(
      contextKey,
      caught,
      false,
      isRestore ? 'Terminal failed to restore' : 'Terminal failed to start'
    )
    throw caught
  }
}

export async function createTerminalSidePaneTab({
  contextKey,
  context
}: TerminalSidePaneContext): Promise<TerminalTabsSnapshot> {
  try {
    const result = await window.spacezero.terminal.create({ context, forceNew: true })
    rememberDiagnostics(result)
    const snapshot = snapshotFromCreateResult(result)
    clearTerminalSidePaneCreateError(contextKey)
    syncTerminalSidePaneState(contextKey, snapshot, true)
    return snapshot
  } catch (caught) {
    showTerminalSidePaneCreateError(contextKey, caught, true, 'Terminal failed to start')
    throw caught
  }
}

export function getTerminalSidePaneCreateError(contextKey: string): TerminalCreateError | null {
  return createErrorsByContextKey.get(contextKey) ?? null
}

export function clearTerminalSidePaneCreateError(contextKey: string): void {
  createErrorsByContextKey.delete(contextKey)
}

export async function selectTerminalSidePaneTab({
  contextKey,
  context,
  tab
}: TerminalSidePaneContext & { tab: SidePaneTab }): Promise<TerminalTabsSnapshot> {
  const terminalId = requireTerminalResourceId(tab)
  const snapshot = await window.spacezero.terminal.selectTab({ context, terminalId })
  syncTerminalSidePaneState(contextKey, snapshot)
  return snapshot
}

export async function closeTerminalSidePaneTab({
  contextKey,
  context,
  tab
}: TerminalSidePaneContext & { tab: SidePaneTab }): Promise<TerminalTabsSnapshot> {
  const terminalId = requireTerminalResourceId(tab)
  const snapshot = await window.spacezero.terminal.close({ context, terminalId })
  diagnosticsByTerminalId.delete(terminalId)
  syncTerminalSidePaneState(contextKey, snapshot)
  return snapshot
}

export async function confirmCloseTerminalSidePaneTab(): Promise<boolean> {
  const settings = await window.spacezero.settings.getTerminalSettings()
  return (
    !settings.confirmBeforeClosingLiveTerminals ||
    window.confirm('Close this live terminal and terminate its shell?')
  )
}

export function applyTerminalSidePaneEvent(event: TerminalEvent): void {
  if (event.type === 'output') return
  if (event.type === 'exit') diagnosticsByTerminalId.delete(event.terminalId)
  useSidePaneStore.setState((state) => {
    let changed = false
    const contexts = Object.fromEntries(
      Object.entries(state.contexts).map(([contextKey, context]) => {
        const matchingTab = context.tabs.find((tab) => tab.resourceId === event.terminalId)
        if (!matchingTab) return [contextKey, context]
        changed = true
        if (event.type === 'tab-updated') {
          return [
            contextKey,
            {
              ...context,
              tabs: context.tabs.map((tab) =>
                tab.id === matchingTab.id ? { ...tab, title: event.title } : tab
              )
            }
          ]
        }

        const closedIndex = context.tabs.findIndex((tab) => tab.id === matchingTab.id)
        const tabs = context.tabs.filter((tab) => tab.id !== matchingTab.id)
        const activeTabId =
          context.activeTabId === matchingTab.id
            ? (tabs[Math.min(closedIndex, tabs.length - 1)]?.id ?? null)
            : context.activeTabId
        const categoryMru = { ...context.categoryMru }
        if (categoryMru.terminal === matchingTab.id) {
          const fallback = [...tabs].reverse().find((tab) => tab.categoryId === 'terminal')
          if (fallback) categoryMru.terminal = fallback.id
          else delete categoryMru.terminal
        }
        return [
          contextKey,
          {
            ...context,
            isOpen: tabs.length > 0 && context.isOpen,
            activeTabId,
            tabs,
            categoryMru
          }
        ]
      })
    )
    return changed ? { contexts } : state
  })
}

export function getTerminalDiagnostics(terminalId: string): TerminalDiagnostic[] {
  return diagnosticsByTerminalId.get(terminalId) ?? []
}

export function TerminalSidePaneLifecycle(): null {
  useEffect(
    () => window.spacezero.terminal.onEvent((event) => applyTerminalSidePaneEvent(event)),
    []
  )
  return null
}

function snapshotFromCreateResult(result: TerminalCreateResult): TerminalTabsSnapshot {
  const tabs =
    result.tabs ??
    (result.terminalId
      ? [{ terminalId: result.terminalId, restorationId: result.terminalId, title: 'Shell' }]
      : [])
  return {
    tabs,
    activeTerminalId: result.activeTerminalId ?? result.terminalId
  }
}

function showTerminalSidePaneCreateError(
  contextKey: string,
  caught: unknown,
  forceNew: boolean,
  title: string
): void {
  createErrorsByContextKey.set(contextKey, {
    message: caught instanceof Error ? caught.message : title,
    title,
    forceNew
  })
  const existingTerminalTabs =
    useSidePaneStore
      .getState()
      .contexts[contextKey]?.tabs.filter(
        (tab) => tab.categoryId === 'terminal' && Boolean(tab.resourceId)
      ) ?? []
  useSidePaneStore.getState().synchronizeCategoryTabs(
    contextKey,
    'terminal',
    [
      ...existingTerminalTabs,
      {
        id: CREATE_ERROR_TAB_ID,
        categoryId: 'terminal',
        title: 'Terminal failed',
        transient: true
      }
    ],
    CREATE_ERROR_TAB_ID,
    true
  )
}

function rememberDiagnostics(result: TerminalCreateResult): void {
  for (const diagnostic of result.diagnostics ?? []) {
    const existing = diagnosticsByTerminalId.get(diagnostic.terminalId) ?? []
    diagnosticsByTerminalId.set(diagnostic.terminalId, [...existing, diagnostic])
  }
}

function terminalTabToSidePaneTab(tab: TerminalTab): SidePaneTab {
  return {
    id: terminalSidePaneTabId(tab) ?? `terminal:${tab.terminalId}`,
    categoryId: 'terminal',
    resourceId: tab.terminalId,
    title: tab.title
  }
}

function terminalSidePaneTabId(tab: TerminalTab | undefined): string | null {
  if (!tab) return null
  return `terminal:${tab.restorationId ?? tab.terminalId}`
}

function requireTerminalResourceId(tab: SidePaneTab): string {
  if (tab.categoryId !== 'terminal' || !tab.resourceId) throw new Error('terminal.notReady')
  return tab.resourceId
}
