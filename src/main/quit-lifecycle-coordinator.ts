export type QuitLifecycleEvent = {
  preventDefault: () => void
}

export type QuitLifecycleWindow = {
  isDestroyed: () => boolean
  webContents: {
    executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>
  }
}

export type QuitLifecycleTerminalService = {
  countLiveTerminals: () => number
  closeAll: () => Promise<void>
}

export function createQuitLifecycleCoordinator({
  getWindows,
  getTerminalService,
  confirmTerminalQuit,
  quit,
  finishQuit,
  logError
}: {
  getWindows: () => QuitLifecycleWindow[]
  getTerminalService: () => QuitLifecycleTerminalService
  confirmTerminalQuit: (count: number) => Promise<boolean>
  quit: () => void
  finishQuit: () => void
  logError: (message: string, error: unknown) => void
}): {
  handleBeforeQuit: (event: QuitLifecycleEvent) => void
  isFilesQuitConfirmed: () => boolean
  isFilesQuitInProgress: () => boolean
  resetFilesExitAttempt: () => void
} {
  let filesQuitInProgress = false
  let filesQuitConfirmed = false
  let terminalQuitInProgress = false
  let terminalQuitConfirmed = false

  const resetFilesExitAttempt = (): void => {
    filesQuitConfirmed = false
  }

  const handleBeforeQuit = (event: QuitLifecycleEvent): void => {
    if (!filesQuitConfirmed) {
      event.preventDefault()
      if (filesQuitInProgress) return
      filesQuitInProgress = true
      void (async () => {
        try {
          const confirmed = await confirmFilesExitForAllWindows(getWindows)
          if (!confirmed) return
          filesQuitConfirmed = true
          quit()
        } catch (error) {
          logError('Files shutdown before quit failed', error)
        } finally {
          filesQuitInProgress = false
        }
      })()
      return
    }

    if (!terminalQuitConfirmed) {
      const terminalService = getTerminalService()
      const liveCount = terminalService.countLiveTerminals()
      if (liveCount > 0) {
        event.preventDefault()
        if (terminalQuitInProgress) return
        terminalQuitInProgress = true
        void (async () => {
          try {
            const confirmed = await confirmTerminalQuit(liveCount)
            if (!confirmed) {
              resetFilesExitAttempt()
              return
            }
            await terminalService.closeAll()
            terminalQuitConfirmed = true
            quit()
          } catch (error) {
            resetFilesExitAttempt()
            logError('Terminal shutdown before quit failed', error)
          } finally {
            terminalQuitInProgress = false
          }
        })()
        return
      }
    }

    finishQuit()
  }

  return {
    handleBeforeQuit,
    isFilesQuitConfirmed: () => filesQuitConfirmed,
    isFilesQuitInProgress: () => filesQuitInProgress,
    resetFilesExitAttempt
  }
}

export async function confirmFilesExitForAllWindows(
  getWindows: () => QuitLifecycleWindow[]
): Promise<boolean> {
  const windows = getWindows().filter((window) => !window.isDestroyed())
  for (const window of windows) {
    const confirmed = await confirmFilesExitForWindow(window)
    if (!confirmed) return false
  }
  return true
}

export async function confirmFilesExitForWindow(window: QuitLifecycleWindow): Promise<boolean> {
  const confirmed = await window.webContents.executeJavaScript(
    'window.spacezeroConfirmFilesExit ? window.spacezeroConfirmFilesExit() : true',
    true
  )
  return confirmed === true
}
