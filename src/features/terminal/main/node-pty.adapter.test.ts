import { describe, expect, it, vi } from 'vitest'

import { createUnixProcessTreeTerminator } from './node-pty.adapter'

describe('node-pty process-tree termination', () => {
  it('cancels the SIGKILL fallback when the PTY exits before the fallback fires', async () => {
    vi.useFakeTimers()
    const exits: Array<() => void> = []
    const signals: Array<{ pid: number; signal: NodeJS.Signals }> = []
    const terminator = createUnixProcessTreeTerminator({
      rootPid: 10,
      killPty: vi.fn(),
      onExit: (listener) => {
        exits.push(listener)
        return () => undefined
      },
      collectDescendants: () => [20],
      signal: (pid, signal) => {
        signals.push({ pid, signal })
        return true
      },
      fallbackDelayMs: 2_000
    })

    void terminator.terminate()
    exits[0]?.()
    await vi.advanceTimersByTimeAsync(2_000)
    vi.useRealTimers()

    expect(signals).toEqual([
      { pid: 20, signal: 'SIGTERM' },
      { pid: -10, signal: 'SIGTERM' }
    ])
  })

  it('re-collects descendants for fallback signaling so reused child PIDs are not killed', async () => {
    vi.useFakeTimers()
    const signals: Array<{ pid: number; signal: NodeJS.Signals }> = []
    const collectDescendants = vi.fn((pid: number) => {
      expect(pid).toBe(10)
      return collectDescendants.mock.calls.length === 1 ? [20] : [21]
    })
    const terminator = createUnixProcessTreeTerminator({
      rootPid: 10,
      killPty: vi.fn(),
      onExit: () => () => undefined,
      collectDescendants,
      signal: (pid, signal) => {
        signals.push({ pid, signal })
        return true
      },
      fallbackDelayMs: 2_000
    })

    void terminator.terminate()
    await vi.advanceTimersByTimeAsync(2_000)
    vi.useRealTimers()

    expect(collectDescendants).toHaveBeenCalledTimes(2)
    expect(signals).toEqual([
      { pid: 20, signal: 'SIGTERM' },
      { pid: -10, signal: 'SIGTERM' },
      { pid: 21, signal: 'SIGKILL' },
      { pid: -10, signal: 'SIGKILL' }
    ])
  })
})
