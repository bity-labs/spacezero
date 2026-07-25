export type LiveTerminalWindowCloseEvent = {
  preventDefault: () => void
}

export type LiveTerminalWindow = {
  id: number
  close: () => void
}

export type LiveTerminalWindowCloseService = {
  countLiveTerminals: () => number
  closeAllForWindow: (windowId: number) => Promise<void>
}

export function createLiveTerminalLastWindowCloseHandler({
  platform = process.platform,
  getWindowCount,
  getTerminalService,
  confirmQuit,
  isQuitInProgress,
  setQuitInProgress,
  setQuitConfirmed,
  logError
}: {
  platform?: NodeJS.Platform
  getWindowCount: () => number
  getTerminalService: () => LiveTerminalWindowCloseService
  confirmQuit: (count: number) => Promise<boolean>
  isQuitInProgress: () => boolean
  setQuitInProgress: (inProgress: boolean) => void
  setQuitConfirmed: () => void
  logError: (error: unknown) => void
}): (window: LiveTerminalWindow, event: LiveTerminalWindowCloseEvent) => void {
  const confirmedWindows = new WeakSet<LiveTerminalWindow>()

  return (window, event) => {
    if (platform === 'darwin') return
    if (confirmedWindows.has(window)) return
    if (getWindowCount() !== 1) return

    const terminalService = getTerminalService()
    const liveCount = terminalService.countLiveTerminals()
    if (liveCount <= 0) return

    event.preventDefault()
    if (isQuitInProgress()) return
    setQuitInProgress(true)
    void (async () => {
      try {
        const confirmed = await confirmQuit(liveCount)
        if (!confirmed) return
        await terminalService.closeAllForWindow(window.id)
        setQuitConfirmed()
        confirmedWindows.add(window)
        window.close()
      } catch (error) {
        logError(error)
      } finally {
        setQuitInProgress(false)
      }
    })()
  }
}
