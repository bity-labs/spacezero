import { app, BrowserWindow, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import { join } from 'node:path'

import { stopAgentUtilityProcessHost, getAgentUtilityProcessHost } from '../features/agent-workspace/main/agent-utility-process'
import { getKnowledgeBaseSyncScheduler } from '../features/knowledge-base/main'
import { closeDatabase, getDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { findSpaceZeroOAuthUrl, registerSpaceZeroProtocol, routeSpaceZeroOAuthUrl } from './protocol'

log.initialize()

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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
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

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  getAgentUtilityProcessHost().start()
  getDatabase()
  getKnowledgeBaseSyncScheduler().start()
  createWindow()

  app.on('browser-window-focus', () => {
    getKnowledgeBaseSyncScheduler().onAppFocus()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  getKnowledgeBaseSyncScheduler().stop()
  stopAgentUtilityProcessHost()
  closeDatabase()
})
