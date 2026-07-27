import { describe, expect, it, vi } from 'vitest'

import { createQuitLifecycleCoordinator, type QuitLifecycleWindow } from './quit-lifecycle-coordinator'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('quit lifecycle coordinator', () => {
  it('fails closed while Files exit confirmation is pending and quits only after explicit approval', async () => {
    const filesConfirmation = deferred<boolean>()
    const window: QuitLifecycleWindow = {
      isDestroyed: () => false,
      webContents: {
        executeJavaScript: vi.fn(() => filesConfirmation.promise)
      }
    }
    const event = { preventDefault: vi.fn() }
    const quit = vi.fn()
    const coordinator = createQuitLifecycleCoordinator({
      getWindows: () => [window],
      getTerminalService: () => ({ countLiveTerminals: () => 0, closeAll: vi.fn() }),
      confirmTerminalQuit: vi.fn(async () => true),
      quit,
      finishQuit: vi.fn(),
      logError: vi.fn()
    })

    coordinator.handleBeforeQuit(event)
    await flushMicrotasks()
    await flushMicrotasks()

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(quit).not.toHaveBeenCalled()

    filesConfirmation.resolve(true)
    await flushMicrotasks()

    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('resets Files approval when a later terminal guard cancels the same quit attempt', async () => {
    const terminalConfirmations = [false, true]
    const executeJavaScript = vi.fn(async () => true)
    const quit = vi.fn()
    const closeAll = vi.fn(async () => undefined)
    const coordinator = createQuitLifecycleCoordinator({
      getWindows: () => [
        {
          isDestroyed: () => false,
          webContents: { executeJavaScript }
        }
      ],
      getTerminalService: () => ({ countLiveTerminals: () => 1, closeAll }),
      confirmTerminalQuit: vi.fn(async () => terminalConfirmations.shift() ?? true),
      quit,
      finishQuit: vi.fn(),
      logError: vi.fn()
    })

    coordinator.handleBeforeQuit({ preventDefault: vi.fn() })
    await flushMicrotasks()
    expect(quit).toHaveBeenCalledTimes(1)

    coordinator.handleBeforeQuit({ preventDefault: vi.fn() })
    await flushMicrotasks()
    expect(closeAll).not.toHaveBeenCalled()

    coordinator.handleBeforeQuit({ preventDefault: vi.fn() })
    await flushMicrotasks()
    expect(executeJavaScript).toHaveBeenCalledTimes(2)
  })
})
