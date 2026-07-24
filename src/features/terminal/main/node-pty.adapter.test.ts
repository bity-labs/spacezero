import { describe, expect, it, vi } from 'vitest'

import { createUnixProcessTreeTerminator } from './node-pty.adapter'

describe('node-pty process-tree termination', () => {
  it('does not send SIGKILL when the PTY exits and its process group is gone', async () => {
    vi.useFakeTimers()
    const exits: Array<() => void> = []
    const signals: Array<{ pid: number; signal: NodeJS.Signals | 0 }> = []
    let groupAlive = true
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
        if (signal === 0) return pid === -10 ? groupAlive : false
        return true
      },
      fallbackDelayMs: 2_000
    })

    const termination = terminator.terminate()
    exits[0]?.()
    groupAlive = false
    await vi.advanceTimersByTimeAsync(2_000)
    await termination
    vi.useRealTimers()

    expect(signals).toContainEqual({ pid: 20, signal: 'SIGTERM' })
    expect(signals).toContainEqual({ pid: -10, signal: 'SIGTERM' })
    expect(signals).not.toContainEqual({ pid: -10, signal: 'SIGKILL' })
    expect(signals).not.toContainEqual({ pid: 20, signal: 'SIGKILL' })
  })

  it('re-collects descendants for fallback signaling so reused child PIDs are not killed', async () => {
    vi.useFakeTimers()
    const signals: Array<{ pid: number; signal: NodeJS.Signals | 0 }> = []
    let groupAlive = true
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
        if (signal === 0) return pid === -10 && groupAlive
        if (pid === -10 && signal === 'SIGKILL') groupAlive = false
        return true
      },
      fallbackDelayMs: 2_000,
      pollIntervalMs: 1
    })

    const termination = terminator.terminate()
    await vi.advanceTimersByTimeAsync(2_001)
    await termination
    vi.useRealTimers()

    expect(collectDescendants).toHaveBeenCalledTimes(3)
    expect(signals).toContainEqual({ pid: 20, signal: 'SIGTERM' })
    expect(signals).not.toContainEqual({ pid: 20, signal: 'SIGKILL' })
    expect(signals).toContainEqual({ pid: 21, signal: 'SIGKILL' })
    expect(signals).toContainEqual({ pid: -10, signal: 'SIGKILL' })
  })

  it('waits for a TERM-resistant descendant after the root PTY exits', async () => {
    vi.useFakeTimers()
    const exits: Array<() => void> = []
    const signals: Array<{ pid: number; signal: NodeJS.Signals | 0 }> = []
    let groupAlive = true
    const terminator = createUnixProcessTreeTerminator({
      rootPid: 10,
      killPty: vi.fn(() => exits[0]?.()),
      onExit: (listener) => {
        exits.push(listener)
        return () => undefined
      },
      collectDescendants: () => [],
      signal: (pid, signal) => {
        signals.push({ pid, signal })
        if (signal === 0) return pid === -10 && groupAlive
        if (pid === -10 && signal === 'SIGKILL') groupAlive = false
        return true
      },
      fallbackDelayMs: 2_000,
      pollIntervalMs: 1
    })

    let resolved = false
    const termination = terminator.terminate().then(() => {
      resolved = true
    })
    await vi.advanceTimersByTimeAsync(1_999)
    expect(resolved).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    await termination
    vi.useRealTimers()

    expect(signals).toContainEqual({ pid: -10, signal: 'SIGKILL' })
    expect(resolved).toBe(true)
  })
})
