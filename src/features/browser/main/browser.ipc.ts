import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'

import { getDatabase } from '../../../main/db'
import { IPC_CHANNELS } from '../../../shared/ipc'
import {
  browserCloseTabRequestSchema,
  browserContextRequestSchema,
  browserCreateTabRequestSchema,
  browserDownloadActionRequestSchema,
  browserNavigateRequestSchema,
  browserOpenUrlInDefaultBrowserRequestSchema,
  browserPresentationRequestSchema,
  browserReorderTabsRequestSchema,
  browserSelectTabRequestSchema,
  browserTabRequestSchema
} from '../shared'
import { createKnowledgeBaseChatRepository } from '../../knowledge-base/main/knowledge-base-chat.repository'
import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { BrowserDownloadsService } from './browser-downloads.service'
import { createBrowserFaviconLoader } from './browser-favicon-loader'
import { BrowserService } from './browser.service'
import { createBrowserTabsRepository } from './browser-tabs.repository'
import { ElectronBrowserViewAdapter } from './browser.webcontents-adapter'

const sessionsRepository = createSessionsRepository()
const knowledgeBaseChatRepository = createKnowledgeBaseChatRepository()
const browserDownloadsService = new BrowserDownloadsService(
  {
    async showSaveDialog({ suggestedFilename, ownerWindow }) {
      const result = ownerWindow
        ? await dialog.showSaveDialog(ownerWindow as BrowserWindow, {
            title: 'Save Browser download',
            defaultPath: suggestedFilename,
            buttonLabel: 'Save'
          })
        : await dialog.showSaveDialog({
            title: 'Save Browser download',
            defaultPath: suggestedFilename,
            buttonLabel: 'Save'
          })
      return result.canceled || !result.filePath ? null : result.filePath
    }
  },
  {
    async openPath(path) {
      const message = await shell.openPath(path)
      if (message) throw new Error(message)
    },
    revealInFolder: (path) => shell.showItemInFolder(path)
  }
)
const browserViewAdapter = new ElectronBrowserViewAdapter(undefined, browserDownloadsService)
const browserService = new BrowserService(
  browserViewAdapter,
  {
    findSessionById: (sessionId) => sessionsRepository.findSessionById(sessionId),
    findProjectById: (projectId) => sessionsRepository.findProjectById(projectId),
    getCurrentKnowledgeBaseSessionId: () => knowledgeBaseChatRepository.getCurrentSessionId()
  },
  {
    openExternal: (url) => shell.openExternal(url)
  },
  createBrowserTabsRepository(getDatabase),
  createBrowserFaviconLoader()
)
browserViewAdapter.setService(browserService)

export function getBrowserService(): BrowserService {
  return browserService
}

export function registerBrowserIpc(): void {
  const forwardEvent = (event: unknown): void => {
    for (const window of browserViewAdapter.getOwnerWindows()) {
      if (!window.webContents.isDestroyed())
        window.webContents.send(IPC_CHANNELS.browser.event, event)
    }
  }
  browserService.onEvent(forwardEvent)
  browserDownloadsService.onEvent(forwardEvent)

  ipcMain.handle(IPC_CHANNELS.browser.getState, (_event, request: unknown) =>
    browserService.getState(browserContextRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.navigate, (_event, request: unknown) =>
    browserService.navigate(browserNavigateRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.goBack, (_event, request: unknown) =>
    browserService.goBack(browserTabRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.goForward, (_event, request: unknown) =>
    browserService.goForward(browserTabRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.reload, (_event, request: unknown) =>
    browserService.reload(browserTabRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.stop, (_event, request: unknown) =>
    browserService.stop(browserTabRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.openInDefaultBrowser, (_event, request: unknown) =>
    browserService.openInDefaultBrowser(browserTabRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.openUrlInDefaultBrowser, (_event, request: unknown) =>
    browserService.openUrlInDefaultBrowser(
      browserOpenUrlInDefaultBrowserRequestSchema.parse(request)
    )
  )
  ipcMain.handle(IPC_CHANNELS.browser.openDownload, (_event, request: unknown) =>
    browserDownloadsService.openCompletedDownload(browserDownloadActionRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.revealDownload, (_event, request: unknown) =>
    browserDownloadsService.revealCompletedDownload(browserDownloadActionRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.show, (event, request: unknown) =>
    browserService.show(browserPresentationRequestSchema.parse(request), event.sender)
  )
  ipcMain.handle(IPC_CHANNELS.browser.hide, (_event, request: unknown) => {
    return browserService.hide(browserContextRequestSchema.parse(request))
  })
  ipcMain.handle(IPC_CHANNELS.browser.createTab, (_event, request: unknown) =>
    browserService.createTab(browserCreateTabRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.selectTab, (_event, request: unknown) =>
    browserService.selectTab(browserSelectTabRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.closeTab, (_event, request: unknown) =>
    browserService.closeTab(browserCloseTabRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.reorderTabs, (_event, request: unknown) =>
    browserService.reorderTabs(browserReorderTabsRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.clearData, () => browserService.clearData())
}

export function disposeBrowserIpcResources(): void {
  browserService.disposeAll()
}
