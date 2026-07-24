import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TerminalTool } from './terminal-tool'
import type { TerminalEvent, TerminalSubscribeResult } from '../../shared'

let lastTerminal: FakeXTerm | null = null
let allTerminals: FakeXTerm[] = []
let terminalEventListener: ((event: TerminalEvent) => void) | null = null

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function Terminal() {
    lastTerminal = new FakeXTerm()
    allTerminals.push(lastTerminal)
    return lastTerminal
  })
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function FitAddon() {
    return {
      fit: vi.fn(),
      proposeDimensions: vi.fn(() => ({ cols: 100, rows: 30 }))
    }
  })
}))

const context = { kind: 'project-session' as const, sessionId: 'session-1' }
const terminalApiDefaults = {
  listTabs: vi.fn(async () => ({ tabs: [], activeTerminalId: null })),
  selectTab: vi.fn(async ({ terminalId }: { terminalId: string }) => ({
    tabs: [{ terminalId, title: 'Shell' }],
    activeTerminalId: terminalId
  })),
  reorderTabs: vi.fn(async () => ({ tabs: [], activeTerminalId: null }))
}

describe('TerminalTool', () => {
  beforeEach(() => {
    lastTerminal = null
    allTerminals = []
    terminalEventListener = null
  })

  it('lazily creates and subscribes to one Project Session terminal, replays output, and forwards keyboard input unchanged', async () => {
    const create = vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' }))
    const subscribe = vi.fn(async () => ({
      terminalId: 'terminal-1',
      events: [
        { type: 'output' as const, terminalId: 'terminal-1', sequence: 1, data: 'hello\r\n' }
      ],
      oldestSequence: 1,
      nextSequence: 2
    }))
    const writeInput = vi.fn(async () => undefined)
    const resize = vi.fn(async () => undefined)
    const unsubscribe = vi.fn(async () => undefined)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create,
      subscribe,
      unsubscribe,
      writeInput,
      resize,
      close: vi.fn(async () => undefined),
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    await waitFor(() => expect(screen.getByRole('region', { name: 'Terminal' })).toBeVisible())
    await waitFor(() => expect(subscribe).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith({ context, cols: undefined, rows: undefined, forceNew: false })
    expect(lastTerminal?.write).toHaveBeenCalledWith('hello\r\n')
    expect(resize).toHaveBeenCalledWith({
      terminalId: 'terminal-1',
      context,
      cols: 100,
      rows: 30
    })

    act(() => lastTerminal?.emitData('npm test\r'))
    expect(writeInput).toHaveBeenCalledWith({
      terminalId: 'terminal-1',
      context,
      data: 'npm test\r'
    })

    act(() =>
      terminalEventListener?.({
        type: 'output',
        terminalId: 'terminal-1',
        sequence: 2,
        data: 'done\r\n'
      })
    )
    expect(lastTerminal?.write).toHaveBeenCalledWith('done\r\n')
  })

  it('uses the owning workspace-session or knowledge-base context without rewriting it to a project session', async () => {
    const create = vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' }))
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create,
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    const workspaceContext = { kind: 'workspace-session' as const, sessionId: 'workspace-1' }
    const mounted = render(<TerminalTool context={workspaceContext} />)
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ context: workspaceContext }))
    )

    mounted.unmount()
    const knowledgeBaseContext = { kind: 'knowledge-base' as const }
    render(<TerminalTool context={knowledgeBaseContext} />)
    await waitFor(() =>
      expect(create).toHaveBeenLastCalledWith(
        expect.objectContaining({ context: knowledgeBaseContext })
      )
    )
  })

  it('does not recreate or resubscribe when rerendered with an equivalent terminal context', async () => {
    const removeEventListener = vi.fn()
    const unsubscribe = vi.fn(async () => undefined)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' })),
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe,
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => removeEventListener)
    }

    const mounted = render(
      <TerminalTool context={{ kind: 'project-session', sessionId: 'same' }} />
    )
    await waitFor(() => expect(window.spacezero.terminal.subscribe).toHaveBeenCalledTimes(1))
    const firstPresentation = lastTerminal

    mounted.rerender(<TerminalTool context={{ kind: 'project-session', sessionId: 'same' }} />)
    await Promise.resolve()

    expect(window.spacezero.terminal.create).toHaveBeenCalledTimes(1)
    expect(window.spacezero.terminal.subscribe).toHaveBeenCalledTimes(1)
    expect(window.spacezero.terminal.onEvent).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(removeEventListener).not.toHaveBeenCalled()
    expect(firstPresentation?.dispose).not.toHaveBeenCalled()
    expect(allTerminals).toHaveLength(1)
  })

  it('recreates presentation and subscription only when the semantic terminal context changes', async () => {
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async ({ context: requestedContext }) => ({
        status: 'running' as const,
        terminalId:
          requestedContext.kind === 'knowledge-base'
            ? 'terminal-knowledge-base'
            : `terminal-${requestedContext.kind}-${requestedContext.sessionId}`
      })),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    const mounted = render(
      <TerminalTool context={{ kind: 'workspace-session', sessionId: 'one' }} />
    )
    await waitFor(() => expect(window.spacezero.terminal.subscribe).toHaveBeenCalledTimes(1))
    const firstPresentation = lastTerminal

    mounted.rerender(<TerminalTool context={{ kind: 'workspace-session', sessionId: 'two' }} />)
    await waitFor(() => expect(window.spacezero.terminal.subscribe).toHaveBeenCalledTimes(2))

    expect(window.spacezero.terminal.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ context: { kind: 'workspace-session', sessionId: 'one' } })
    )
    expect(window.spacezero.terminal.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ context: { kind: 'workspace-session', sessionId: 'two' } })
    )
    expect(window.spacezero.terminal.unsubscribe).toHaveBeenCalledWith({
      terminalId: 'terminal-workspace-session-one',
      context: { kind: 'workspace-session', sessionId: 'one' }
    })
    expect(firstPresentation?.dispose).toHaveBeenCalled()
    expect(allTerminals).toHaveLength(2)
  })

  it('switches among two Project Sessions, two Workspace Sessions, and Knowledge Base without mixing presentations', async () => {
    const contexts = [
      { kind: 'project-session' as const, sessionId: 'project-1' },
      { kind: 'project-session' as const, sessionId: 'project-2' },
      { kind: 'workspace-session' as const, sessionId: 'workspace-1' },
      { kind: 'workspace-session' as const, sessionId: 'workspace-2' },
      { kind: 'knowledge-base' as const }
    ]
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async ({ context: requestedContext }) => ({
        status: 'running' as const,
        terminalId:
          requestedContext.kind === 'knowledge-base'
            ? 'terminal-knowledge-base'
            : `terminal-${requestedContext.kind}-${requestedContext.sessionId}`
      })),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [
          {
            type: 'output' as const,
            terminalId,
            sequence: 1,
            data: `${terminalId} output\r\n`
          }
        ],
        oldestSequence: 1,
        nextSequence: 2
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    const mounted = render(<TerminalTool context={contexts[0]} />)
    for (let index = 0; index < contexts.length; index += 1) {
      if (index > 0) mounted.rerender(<TerminalTool context={contexts[index]!} />)
      const expectedTerminalId =
        contexts[index]!.kind === 'knowledge-base'
          ? 'terminal-knowledge-base'
          : `terminal-${contexts[index]!.kind}-${contexts[index]!.sessionId}`
      await waitFor(() =>
        expect(lastTerminal?.write).toHaveBeenCalledWith(`${expectedTerminalId} output\r\n`)
      )
    }

    expect(window.spacezero.terminal.create).toHaveBeenCalledTimes(5)
    for (const terminalContext of contexts) {
      const expectedTerminalId =
        terminalContext.kind === 'knowledge-base'
          ? 'terminal-knowledge-base'
          : `terminal-${terminalContext.kind}-${terminalContext.sessionId}`
      expect(allTerminals.some((terminal) =>
        terminal.write.mock.calls.flat().includes(`${expectedTerminalId} output\r\n`)
      )).toBe(true)
    }
  })

  it('merges subscribe replay and live output in sequence order without gaps or duplicates', async () => {
    let resolveSubscribe:
      | ((value: {
          terminalId: string
          events: TerminalEvent[]
          oldestSequence: number
          nextSequence: number
        }) => void)
      | null = null
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' })),
      subscribe: vi.fn(
        () =>
          new Promise<TerminalSubscribeResult>((resolve) => {
            resolveSubscribe = resolve
          })
      ),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    await waitFor(() => expect(window.spacezero.terminal.subscribe).toHaveBeenCalled())
    act(() =>
      terminalEventListener?.({
        type: 'output',
        terminalId: 'terminal-1',
        sequence: 2,
        data: 'second\r\n'
      })
    )
    await act(async () => {
      resolveSubscribe?.({
        terminalId: 'terminal-1',
        events: [
          { type: 'output', terminalId: 'terminal-1', sequence: 1, data: 'first\r\n' },
          { type: 'output', terminalId: 'terminal-1', sequence: 2, data: 'second\r\n' }
        ],
        oldestSequence: 1,
        nextSequence: 3
      })
    })

    expect(lastTerminal?.write).toHaveBeenNthCalledWith(1, 'first\r\n')
    expect(lastTerminal?.write).toHaveBeenNthCalledWith(2, 'second\r\n')
    expect(lastTerminal?.write).toHaveBeenCalledTimes(2)
  })

  it('resets replay sequencing when a replacement terminal starts at sequence one', async () => {
    const user = userEvent.setup()
    let createCount = 0
    window.confirm = vi.fn(() => true)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => {
        createCount += 1
        return { status: 'running' as const, terminalId: `terminal-${createCount}` }
      }),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [
          {
            type: 'output' as const,
            terminalId,
            sequence: terminalId === 'terminal-1' ? 10 : 1,
            data: `${terminalId} output\r\n`
          }
        ],
        oldestSequence: 1,
        nextSequence: terminalId === 'terminal-1' ? 11 : 2
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    await screen.findByRole('button', { name: 'Close Terminal' })
    await waitFor(() => expect(lastTerminal?.write).toHaveBeenCalledWith('terminal-1 output\r\n'))
    await user.click(screen.getByRole('button', { name: 'Close Terminal' }))
    await user.click(await screen.findByRole('button', { name: 'New Terminal' }))
    await screen.findByRole('button', { name: 'Close Terminal' })

    expect(lastTerminal?.write).toHaveBeenCalledWith('terminal-2 output\r\n')
    expect(window.spacezero.terminal.create).toHaveBeenLastCalledWith({
      context,
      cols: undefined,
      rows: undefined,
      forceNew: true
    })
  })

  it('shows the durable empty state on remount without starting a replacement shell', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ status: 'running' as const, terminalId: 'terminal-1' })
      .mockResolvedValueOnce({ status: 'empty' as const, terminalId: null })
    const close = vi.fn(async () => undefined)
    window.confirm = vi.fn(() => true)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create,
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close,
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    const mounted = render(<TerminalTool context={context} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Close Terminal' }))
    expect(await screen.findByRole('button', { name: 'New Terminal' })).toBeVisible()
    mounted.unmount()
    render(<TerminalTool context={context} />)

    expect(await screen.findByRole('button', { name: 'New Terminal' })).toBeVisible()
    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenLastCalledWith({ context, cols: undefined, rows: undefined, forceNew: false })
  })

  it('asks before closing a live terminal and returns to the New Terminal state on close or exit', async () => {
    const user = userEvent.setup()
    const close = vi.fn(async () => undefined)
    window.confirm = vi.fn(() => true)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' })),
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close,
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    await user.click(await screen.findByRole('button', { name: 'Close Terminal' }))
    expect(window.confirm).toHaveBeenCalledWith('Close this live terminal and terminate its shell?')
    expect(close).toHaveBeenCalledWith({ terminalId: 'terminal-1', context })
    expect(await screen.findByRole('button', { name: 'New Terminal' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'New Terminal' }))
    await screen.findByRole('button', { name: 'Close Terminal' })
    act(() =>
      terminalEventListener?.({ type: 'exit', terminalId: 'terminal-1', exitCode: 0, signal: null })
    )
    expect(await screen.findByRole('button', { name: 'New Terminal' })).toBeVisible()
  })

  it('adds, selects, reorders, and closes accessible terminal tabs without stealing focus', async () => {
    const user = userEvent.setup()
    let activeTerminalId = 'terminal-1'
    const tabs = [
      { terminalId: 'terminal-1', title: 'zsh' },
      { terminalId: 'terminal-2', title: 'zsh' }
    ]
    window.confirm = vi.fn(() => true)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async ({ forceNew }) => {
        if (forceNew) activeTerminalId = 'terminal-2'
        return {
          status: 'running' as const,
          terminalId: activeTerminalId,
          tabs,
          activeTerminalId
        }
      }),
      selectTab: vi.fn(async ({ terminalId }) => {
        activeTerminalId = terminalId
        return { tabs, activeTerminalId }
      }),
      reorderTabs: vi.fn(async ({ terminalIds }) => ({
        tabs: terminalIds.map((terminalId) => tabs.find((tab) => tab.terminalId === terminalId)!),
        activeTerminalId
      })),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [{ type: 'output' as const, terminalId, sequence: 1, data: `${terminalId}\r\n` }],
        oldestSequence: 1,
        nextSequence: 2
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    render(<TerminalTool context={context} />)

    await screen.findByRole('tab', { name: 'Select terminal tab zsh', selected: true })
    expect(document.activeElement).not.toBe(screen.getByLabelText('Terminal output'))
    await user.click(screen.getByRole('button', { name: 'Add terminal tab' }))
    await waitFor(() => expect(window.spacezero.terminal.create).toHaveBeenLastCalledWith({
      context,
      cols: 100,
      rows: 30,
      forceNew: true
    }))
    expect(screen.getAllByRole('tab')).toHaveLength(2)

    await user.click(screen.getAllByRole('tab')[0]!)
    expect(window.spacezero.terminal.selectTab).toHaveBeenCalledWith({
      terminalId: 'terminal-1',
      context
    })

    const tabRows = screen.getAllByRole('tab').map((tab) => tab.parentElement!)
    act(() => {
      tabRows[1]?.dispatchEvent(new Event('dragstart', { bubbles: true }))
      tabRows[0]?.dispatchEvent(new Event('drop', { bubbles: true }))
    })
    await waitFor(() =>
      expect(window.spacezero.terminal.reorderTabs).toHaveBeenCalledWith({
        context,
        terminalIds: ['terminal-2', 'terminal-1']
      })
    )

    await user.click(screen.getByRole('button', { name: 'Close Terminal' }))
    expect(window.confirm).toHaveBeenCalledWith('Close this live terminal and terminate its shell?')
    expect(window.spacezero.terminal.close).toHaveBeenCalledWith({ terminalId: activeTerminalId, context })
  })

  it('shows an actionable launch failure instead of silently substituting another shell', async () => {
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => {
        throw new Error('terminal.shellLaunchFailed: ENOENT')
      }),
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    render(<TerminalTool context={context} />)

    expect(await screen.findByText('Terminal failed to start')).toBeVisible()
    expect(screen.getByText('terminal.shellLaunchFailed: ENOENT')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })
})

class FakeXTerm {
  readonly write = vi.fn()
  readonly open = vi.fn()
  readonly loadAddon = vi.fn()
  readonly dispose = vi.fn()
  private dataListener: ((data: string) => void) | null = null

  onData(listener: (data: string) => void): { dispose: () => void } {
    this.dataListener = listener
    return { dispose: vi.fn() }
  }

  emitData(data: string): void {
    this.dataListener?.(data)
  }
}
