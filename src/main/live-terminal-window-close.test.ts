import { describe, expect, it, vi } from 'vitest'

import { createLiveTerminalLastWindowCloseHandler } from './live-terminal-window-close'

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('live terminal last-window close coordination', () => {
  it('cancels last-window destruction when quit confirmation is denied', async () => {
    let inProgress = false
    let quitConfirmed = false
    const event = { preventDefault: vi.fn() }
    const window = { id: 7, close: vi.fn() }
    const terminalService = {
      countLiveTerminals: vi.fn(() => 2),
      closeAllForWindow: vi.fn(async () => undefined)
    }
    const resetQuitAttempt = vi.fn()
    const handler = createLiveTerminalLastWindowCloseHandler({
      platform: 'linux',
      getWindowCount: () => 1,
      getTerminalService: () => terminalService,
      confirmQuit: vi.fn(async () => false),
      isQuitInProgress: () => inProgress,
      setQuitInProgress: (next) => {
        inProgress = next
      },
      setQuitConfirmed: () => {
        quitConfirmed = true
      },
      resetQuitAttempt,
      logError: vi.fn()
    })

    handler(window, event)
    await flushMicrotasks()

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(terminalService.closeAllForWindow).not.toHaveBeenCalled()
    expect(window.close).not.toHaveBeenCalled()
    expect(quitConfirmed).toBe(false)
    expect(resetQuitAttempt).toHaveBeenCalledWith(window)
    expect(inProgress).toBe(false)
  })

  it('terminates live terminals before allowing accepted last-window close to continue', async () => {
    let inProgress = false
    let quitConfirmed = false
    const event = { preventDefault: vi.fn() }
    const window = { id: 9, close: vi.fn() }
    const terminalService = {
      countLiveTerminals: vi.fn(() => 1),
      closeAllForWindow: vi.fn(async () => undefined)
    }
    const handler = createLiveTerminalLastWindowCloseHandler({
      platform: 'win32',
      getWindowCount: () => 1,
      getTerminalService: () => terminalService,
      confirmQuit: vi.fn(async () => true),
      isQuitInProgress: () => inProgress,
      setQuitInProgress: (next) => {
        inProgress = next
      },
      setQuitConfirmed: () => {
        quitConfirmed = true
      },
      logError: vi.fn()
    })

    handler(window, event)
    await flushMicrotasks()

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(terminalService.closeAllForWindow).toHaveBeenCalledWith(9)
    expect(quitConfirmed).toBe(true)
    expect(window.close).toHaveBeenCalledTimes(1)

    handler(window, { preventDefault: vi.fn() })
    expect(terminalService.countLiveTerminals).toHaveBeenCalledTimes(1)
  })

  it('keeps the window alive and retryable when terminal cleanup fails', async () => {
    let inProgress = false
    let quitConfirmed = false
    const logError = vi.fn()
    const event = { preventDefault: vi.fn() }
    const window = { id: 10, close: vi.fn() }
    const terminalService = {
      countLiveTerminals: vi.fn(() => 1),
      closeAllForWindow: vi.fn(async () => {
        throw new Error('terminal.killFailed')
      })
    }
    const handler = createLiveTerminalLastWindowCloseHandler({
      platform: 'linux',
      getWindowCount: () => 1,
      getTerminalService: () => terminalService,
      confirmQuit: vi.fn(async () => true),
      isQuitInProgress: () => inProgress,
      setQuitInProgress: (next) => {
        inProgress = next
      },
      setQuitConfirmed: () => {
        quitConfirmed = true
      },
      logError
    })

    handler(window, event)
    await flushMicrotasks()

    expect(window.close).not.toHaveBeenCalled()
    expect(quitConfirmed).toBe(false)
    expect(inProgress).toBe(false)
    expect(logError).toHaveBeenCalledWith(expect.any(Error))
  })
})
