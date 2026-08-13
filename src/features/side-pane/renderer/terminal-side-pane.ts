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

const diagnosticsByTerminalId = new Map<string, TerminalDiagnostic[]>()

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

  syncTerminalSidePaneState(contextKey, snapshot, true)
  return snapshot
}

export async function createTerminalSidePaneTab({
  contextKey,
  context
}: TerminalSidePaneContext): Promise<TerminalTabsSnapshot> {
  const result = await window.spacezero.terminal.create({ context, forceNew: true })
  rememberDiagnostics(result)
  const snapshot = snapshotFromCreateResult(result)
  syncTerminalSidePaneState(contextKey, snapshot, true)
  return snapshot
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
