import { app, BrowserWindow, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import { join } from 'node:path'

import {
  stopAgentUtilityProcessHost,
  getAgentUtilityProcessHost
} from '../features/agent-workspace/main/agent-utility-process'
import { disposeBrowserIpcResources } from '../features/browser/main'
import { shouldProceedWithLiveTerminalTermination } from '../features/terminal/main/terminal-confirmation.service'
import { getTerminalService } from '../features/terminal/main/terminal.runtime'
import { closeDatabase, getDatabase } from './db'
import { isAllowedGitHubRepositoryUrl } from './external-url-policy'
import { registerIpcHandlers } from './ipc'
import { createLiveTerminalLastWindowCloseHandler } from './live-terminal-window-close'
import {
  createQuitLifecycleCoordinator,
  confirmFilesExitForWindow
} from './quit-lifecycle-coordinator'
import {
  findSpaceZeroOAuthUrl,
  registerSpaceZeroProtocol,
  routeSpaceZeroOAuthUrl
} from './protocol'

log.initialize()

let terminalQuitInProgress = false
const filesExitConfirmedWindows = new WeakSet<BrowserWindow>()
const quitLifecycleCoordinator = createQuitLifecycleCoordinator({
  getWindows: () => BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed()),
  getTerminalService,
  confirmTerminalQuit: (count) => shouldProceedWithLiveTerminalTermination({ count, purpose: 'quit' }),
  quit: () => app.quit(),
  finishQuit: () => {
    disposeBrowserIpcResources()
    stopAgentUtilityProcessHost()
    closeDatabase()
  },
  logError: (message, error) => log.error(message, error)
})

registerSpaceZeroProtocol()

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const oauthUrl = findSpaceZeroOAuthUrl(argv)
    if (oauthUrl) void routeSpaceZeroOAuthUrl(oauthUrl)

    const [window] = BrowserWindow.getAllWindows()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })
}

app.on('open-url', (event, url) => {
  if (!findSpaceZeroOAuthUrl([url])) return
  event.preventDefault()
  void routeSpaceZeroOAuthUrl(url)
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Space Zero',
    backgroundColor: '#020617',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', (event) => {
    if (quitLifecycleCoordinator.isFilesQuitConfirmed()) return
    if (quitLifecycleCoordinator.isFilesQuitInProgress()) return
    if (event.defaultPrevented) return
    if (filesExitConfirmedWindows.has(mainWindow)) {
      filesExitConfirmedWindows.delete(mainWindow)
      return
    }
    event.preventDefault()
    void (async () => {
      try {
        const confirmed = await confirmFilesExitForWindow(mainWindow)
        if (!confirmed || mainWindow.isDestroyed()) return
      } catch (error) {
        log.error('Files exit guard failed; blocking window close', error)
        return
      }
      filesExitConfirmedWindows.add(mainWindow)
      mainWindow.close()
    })()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isAllowedGitHubRepositoryUrl(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.spacezero.app')

  const handleLastWindowClose = createLiveTerminalLastWindowCloseHandler({
    getWindowCount: () => BrowserWindow.getAllWindows().length,
    getTerminalService,
    confirmQuit: (count) => shouldProceedWithLiveTerminalTermination({ count, purpose: 'quit' }),
    isQuitInProgress: () => terminalQuitInProgress,
    setQuitInProgress: (inProgress) => {
      terminalQuitInProgress = inProgress
    },
    setQuitConfirmed: () => undefined,
    resetQuitAttempt: (window) => {
      quitLifecycleCoordinator.resetFilesExitAttempt()
      filesExitConfirmedWindows.delete(window as BrowserWindow)
    },
    logError: (error) => log.error('Terminal shutdown before last window close failed', error)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    window.on('close', (event) => handleLastWindowClose(window, event))
  })

  registerIpcHandlers()
  getAgentUtilityProcessHost().start()
  getDatabase()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => quitLifecycleCoordinator.handleBeforeQuit(event))
