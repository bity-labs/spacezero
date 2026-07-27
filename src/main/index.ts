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
  findSpaceZeroOAuthUrl,
  registerSpaceZeroProtocol,
  routeSpaceZeroOAuthUrl
} from './protocol'

log.initialize()

let terminalQuitInProgress = false
let terminalQuitConfirmed = false
let filesQuitInProgress = false
let filesQuitConfirmed = false
const filesExitConfirmedWindows = new WeakSet<BrowserWindow>()

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

async function confirmFilesExitForAllWindows(): Promise<boolean> {
  const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed())
  for (const window of windows) {
    const confirmed = await Promise.race([
      window.webContents.executeJavaScript(
        'window.spacezeroConfirmFilesExit ? window.spacezeroConfirmFilesExit() : true',
        true
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 2000))
    ])
    if (!confirmed) return false
  }
  return true
}

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
    if (filesQuitConfirmed || filesQuitInProgress) return
    if (filesExitConfirmedWindows.has(mainWindow)) {
      filesExitConfirmedWindows.delete(mainWindow)
      return
    }
    event.preventDefault()
    void (async () => {
      try {
        const confirmed = await Promise.race([
          mainWindow.webContents.executeJavaScript(
            'window.spacezeroConfirmFilesExit ? window.spacezeroConfirmFilesExit() : true',
            true
          ),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 2000))
        ])
        if (!confirmed || mainWindow.isDestroyed()) return
      } catch (error) {
        log.error('Files exit guard failed; allowing window close', error)
        if (mainWindow.isDestroyed()) return
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
    setQuitConfirmed: () => {
      terminalQuitConfirmed = true
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

app.on('before-quit', (event) => {
  if (!filesQuitConfirmed) {
    event.preventDefault()
    if (filesQuitInProgress) return
    filesQuitInProgress = true
    void (async () => {
      try {
        const confirmed = await confirmFilesExitForAllWindows()
        if (!confirmed) return
        filesQuitConfirmed = true
        app.quit()
      } catch (error) {
        log.error('Files shutdown before quit failed', error)
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
          const confirmed = await shouldProceedWithLiveTerminalTermination({
            count: liveCount,
            purpose: 'quit'
          })
          if (!confirmed) return
          await terminalService.closeAll()
          terminalQuitConfirmed = true
          app.quit()
        } catch (error) {
          log.error('Terminal shutdown before quit failed', error)
        } finally {
          terminalQuitInProgress = false
        }
      })()
      return
    }
  }

  disposeBrowserIpcResources()
  stopAgentUtilityProcessHost()
  closeDatabase()
})
