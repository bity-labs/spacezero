import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TerminalTool } from './terminal-tool'
import type { TerminalEvent } from '../../shared'

let lastTerminal: FakeXTerm | null = null
let terminalEventListener: ((event: TerminalEvent) => void) | null = null

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function Terminal() {
    lastTerminal = new FakeXTerm()
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

describe('TerminalTool', () => {
  beforeEach(() => {
    lastTerminal = null
    terminalEventListener = null
  })

  it('lazily creates and subscribes to one Project Session terminal, replays output, and forwards keyboard input unchanged', async () => {
    const create = vi.fn(async () => ({ terminalId: 'terminal-1' }))
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
    expect(create).toHaveBeenCalledWith({ context, cols: 100, rows: 30 })
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

  it('asks before closing a live terminal and returns to the New Terminal state on close or exit', async () => {
    const user = userEvent.setup()
    const close = vi.fn(async () => undefined)
    window.confirm = vi.fn(() => true)
    window.spacezero.terminal = {
      create: vi.fn(async () => ({ terminalId: 'terminal-1' })),
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

  it('shows an actionable launch failure instead of silently substituting another shell', async () => {
    window.spacezero.terminal = {
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
