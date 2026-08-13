import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppCommandProvider } from '../../app-commands/renderer/app-command-context'
import { AppCommandRegistry } from '../../app-commands/renderer/app-command-registry'
import { TERMINAL_COMMAND_IDS } from '../../terminal/shared'
import {
  createProjectSessionSidePaneConfiguration,
  useRegisterTerminalSidePaneCommands
} from './side-pane-configurations'
import { resetSidePaneStore, useSidePaneStore } from './side-pane-store'

const configuration = createProjectSessionSidePaneConfiguration({
  id: 'session-1',
  projectId: 'project-1'
})
const context = { kind: 'project-session' as const, sessionId: 'session-1' }

function TerminalCommandRegistration(): null {
  useRegisterTerminalSidePaneCommands(configuration)
  return null
}

describe('Terminal Side Pane App Commands', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetSidePaneStore()
  })

  it('force-creates from a non-Terminal active tab and again while the Side Pane is collapsed', async () => {
    useSidePaneStore.setState({
      contexts: {
        [configuration.contextKey]: {
          isOpen: true,
          width: 520,
          activeTabId: 'files:readme',
          tabs: [
            { id: 'terminal:saved-a', categoryId: 'terminal', resourceId: 'pty-a', title: 'api' },
            { id: 'files:readme', categoryId: 'files', resourceId: 'README.md' }
          ],
          categoryMru: { files: 'files:readme', terminal: 'terminal:saved-a' }
        }
      }
    })
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'running' as const,
        terminalId: 'pty-b',
        tabs: [
          { terminalId: 'pty-a', restorationId: 'saved-a', title: 'api' },
          { terminalId: 'pty-b', restorationId: 'saved-b', title: 'web' }
        ],
        activeTerminalId: 'pty-b'
      })
      .mockResolvedValueOnce({
        status: 'running' as const,
        terminalId: 'pty-c',
        tabs: [
          { terminalId: 'pty-a', restorationId: 'saved-a', title: 'api' },
          { terminalId: 'pty-b', restorationId: 'saved-b', title: 'web' },
          { terminalId: 'pty-c', restorationId: 'saved-c', title: 'worker' }
        ],
        activeTerminalId: 'pty-c'
      })
    window.spacezero.terminal.create = create
    const registry = new AppCommandRegistry()

    render(
      <AppCommandProvider registry={registry}>
        <TerminalCommandRegistration />
      </AppCommandProvider>
    )
    await waitFor(() =>
      expect(registry.list().map((command) => command.id)).toContain(TERMINAL_COMMAND_IDS.newTab)
    )

    await act(() => registry.invoke(TERMINAL_COMMAND_IDS.newTab, { spacezero: window.spacezero }))

    expect(create).toHaveBeenNthCalledWith(1, { context, forceNew: true })
    expect(useSidePaneStore.getState().contexts[configuration.contextKey]).toMatchObject({
      isOpen: true,
      activeTabId: 'terminal:saved-b'
    })

    act(() => useSidePaneStore.getState().collapse(configuration.contextKey))
    expect(useSidePaneStore.getState().contexts[configuration.contextKey]).toMatchObject({
      isOpen: false,
      activeTabId: 'terminal:saved-b'
    })
    expect(registry.list().map((command) => command.id)).toContain(TERMINAL_COMMAND_IDS.newTab)

    await act(() => registry.invoke(TERMINAL_COMMAND_IDS.newTab, { spacezero: window.spacezero }))

    expect(create).toHaveBeenNthCalledWith(2, { context, forceNew: true })
    expect(useSidePaneStore.getState().contexts[configuration.contextKey]).toMatchObject({
      isOpen: true,
      activeTabId: 'terminal:saved-c',
      tabs: [
        { id: 'terminal:saved-a', resourceId: 'pty-a' },
        { id: 'terminal:saved-b', resourceId: 'pty-b' },
        { id: 'terminal:saved-c', resourceId: 'pty-c' },
        { id: 'files:readme' }
      ]
    })
  })
})
