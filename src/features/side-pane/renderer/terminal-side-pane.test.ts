import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TerminalTabsSnapshot } from '../../terminal/shared'
import {
  applyTerminalSidePaneEvent,
  closeTerminalSidePaneTab,
  confirmCloseTerminalSidePaneTab,
  createTerminalSidePaneTab,
  focusOrCreateTerminalSidePaneTab,
  selectTerminalSidePaneTab,
  syncTerminalSidePaneState
} from './terminal-side-pane'
import { resetSidePaneStore, useSidePaneStore } from './side-pane-store'

const contextKey = 'session:session-1'
const context = { kind: 'project-session' as const, sessionId: 'session-1' }

function snapshot(
  tabs: Array<{ terminalId: string; restorationId: string; title: string }>,
  activeTerminalId: string | null
): TerminalTabsSnapshot {
  return { tabs, activeTerminalId }
}

describe('Terminal Side Pane capability', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetSidePaneStore()
  })

  it('restores main-owned terminals as peer Side Pane tabs without creating duplicate PTYs', async () => {
    useSidePaneStore.setState({
      contexts: {
        [contextKey]: {
          isOpen: true,
          width: 520,
          activeTabId: 'terminal:legacy',
          tabs: [
            { id: 'files:readme', categoryId: 'files', resourceId: 'README.md' },
            { id: 'terminal:legacy', categoryId: 'terminal' },
            { id: 'browser:docs', categoryId: 'browser', resourceId: 'browser:docs' }
          ],
          categoryMru: { terminal: 'terminal:legacy' }
        }
      }
    })
    const restored = snapshot(
      [
        { terminalId: 'pty-a', restorationId: 'saved-a', title: 'api' },
        { terminalId: 'pty-b', restorationId: 'saved-b', title: 'web' }
      ],
      'pty-b'
    )
    const create = vi.fn(async () => ({
      status: 'running' as const,
      terminalId: 'pty-b',
      ...restored
    }))
    window.spacezero.terminal.create = create

    await focusOrCreateTerminalSidePaneTab({ contextKey, context })

    expect(create).toHaveBeenCalledWith({ context, forceNew: false })
    expect(useSidePaneStore.getState().contexts[contextKey]).toMatchObject({
      isOpen: true,
      activeTabId: 'terminal:saved-b',
      tabs: [
        { id: 'files:readme', categoryId: 'files' },
        {
          id: 'terminal:saved-a',
          categoryId: 'terminal',
          resourceId: 'pty-a',
          title: 'api'
        },
        {
          id: 'terminal:saved-b',
          categoryId: 'terminal',
          resourceId: 'pty-b',
          title: 'web'
        },
        { id: 'browser:docs', categoryId: 'browser' }
      ]
    })
  })

  it('creates a fresh shell when the launcher finds a deliberately empty terminal collection', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'empty' as const,
        terminalId: null,
        tabs: [],
        activeTerminalId: null
      })
      .mockResolvedValueOnce({
        status: 'running' as const,
        terminalId: 'pty-new',
        tabs: [{ terminalId: 'pty-new', restorationId: 'saved-new', title: 'Shell' }],
        activeTerminalId: 'pty-new'
      })
    window.spacezero.terminal.create = create

    await focusOrCreateTerminalSidePaneTab({ contextKey, context })

    expect(create).toHaveBeenNthCalledWith(1, { context, forceNew: false })
    expect(create).toHaveBeenNthCalledWith(2, { context, forceNew: true })
    expect(useSidePaneStore.getState().contexts[contextKey]?.activeTabId).toBe('terminal:saved-new')
  })

  it('always creates and activates another terminal from an explicit new-terminal action', async () => {
    syncTerminalSidePaneState(
      contextKey,
      snapshot([{ terminalId: 'pty-a', restorationId: 'saved-a', title: 'api' }], 'pty-a'),
      true
    )
    useSidePaneStore
      .getState()
      .synchronizeCategoryTabs(
        contextKey,
        'browser',
        [{ id: 'browser:docs', categoryId: 'browser', title: 'Docs' }],
        'browser:docs',
        true
      )
    const created = snapshot(
      [
        { terminalId: 'pty-a', restorationId: 'saved-a', title: 'api' },
        { terminalId: 'pty-b', restorationId: 'saved-b', title: 'web' }
      ],
      'pty-b'
    )
    const create = vi.fn(async () => ({
      status: 'running' as const,
      terminalId: 'pty-b',
      ...created
    }))
    window.spacezero.terminal.create = create

    await createTerminalSidePaneTab({ contextKey, context })

    expect(create).toHaveBeenCalledWith({ context, forceNew: true })
    expect(useSidePaneStore.getState().contexts[contextKey]).toMatchObject({
      activeTabId: 'terminal:saved-b',
      tabs: [{ id: 'terminal:saved-a' }, { id: 'terminal:saved-b' }, { id: 'browser:docs' }]
    })
  })

  it('selects and closes exactly the PTY referenced by the Side Pane tab', async () => {
    const initial = snapshot(
      [
        { terminalId: 'pty-a', restorationId: 'saved-a', title: 'api' },
        { terminalId: 'pty-b', restorationId: 'saved-b', title: 'web' }
      ],
      'pty-a'
    )
    syncTerminalSidePaneState(contextKey, initial, true)
    const selectTab = vi.fn(async () => ({ ...initial, activeTerminalId: 'pty-b' }))
    const close = vi.fn(async () =>
      snapshot([{ terminalId: 'pty-a', restorationId: 'saved-a', title: 'api' }], 'pty-a')
    )
    window.spacezero.terminal.selectTab = selectTab
    window.spacezero.terminal.close = close

    const selectedTab = useSidePaneStore
      .getState()
      .contexts[contextKey]!.tabs.find((tab) => tab.id === 'terminal:saved-b')!
    await selectTerminalSidePaneTab({ contextKey, context, tab: selectedTab })
    await closeTerminalSidePaneTab({ contextKey, context, tab: selectedTab })

    expect(selectTab).toHaveBeenCalledWith({ context, terminalId: 'pty-b' })
    expect(close).toHaveBeenCalledWith({ context, terminalId: 'pty-b' })
    expect(useSidePaneStore.getState().contexts[contextKey]).toMatchObject({
      activeTabId: 'terminal:saved-a',
      tabs: [{ id: 'terminal:saved-a', resourceId: 'pty-a' }]
    })
  })

  it('retains the live-terminal confirmation policy before close', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    window.spacezero.settings.getTerminalSettings = vi.fn(async () => ({
      confirmBeforeClosingLiveTerminals: true
    }))

    await expect(confirmCloseTerminalSidePaneTab()).resolves.toBe(false)
    expect(confirm).toHaveBeenCalledWith('Close this live terminal and terminate its shell?')

    window.spacezero.settings.getTerminalSettings = vi.fn(async () => ({
      confirmBeforeClosingLiveTerminals: false
    }))
    confirm.mockClear()
    await expect(confirmCloseTerminalSidePaneTab()).resolves.toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('removes naturally exited terminals and updates titles across inactive contexts', () => {
    syncTerminalSidePaneState(
      contextKey,
      snapshot([{ terminalId: 'pty-a', restorationId: 'saved-a', title: 'api' }], 'pty-a'),
      true
    )
    syncTerminalSidePaneState(
      'global-chat',
      snapshot(
        [{ terminalId: 'pty-global', restorationId: 'saved-global', title: 'home' }],
        'pty-global'
      ),
      true
    )

    applyTerminalSidePaneEvent({
      type: 'tab-updated',
      terminalId: 'pty-global',
      title: 'SpaceZero'
    })
    applyTerminalSidePaneEvent({
      type: 'exit',
      terminalId: 'pty-a',
      exitCode: 0,
      signal: null
    })

    expect(useSidePaneStore.getState().contexts[contextKey]).toMatchObject({
      isOpen: false,
      activeTabId: null,
      tabs: []
    })
    expect(useSidePaneStore.getState().contexts['global-chat']).toMatchObject({
      activeTabId: 'terminal:saved-global',
      tabs: [{ title: 'SpaceZero', resourceId: 'pty-global' }]
    })
  })
})
