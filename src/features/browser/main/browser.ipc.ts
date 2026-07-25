import { ipcMain, shell } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import {
  browserCloseTabRequestSchema,
  browserContextRequestSchema,
  browserCreateTabRequestSchema,
  browserNavigateRequestSchema,
  browserOpenUrlInDefaultBrowserRequestSchema,
  browserPresentationRequestSchema,
  browserReorderTabsRequestSchema,
  browserSelectTabRequestSchema,
  browserTabRequestSchema
} from '../shared'
import { createKnowledgeBaseChatRepository } from '../../knowledge-base/main/knowledge-base-chat.repository'
import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { BrowserService } from './browser.service'
import { ElectronBrowserViewAdapter } from './browser.webcontents-adapter'

const sessionsRepository = createSessionsRepository()
const knowledgeBaseChatRepository = createKnowledgeBaseChatRepository()
const browserViewAdapter = new ElectronBrowserViewAdapter()
const browserService = new BrowserService(
  browserViewAdapter,
  {
    findSessionById: (sessionId) => sessionsRepository.findSessionById(sessionId),
    findProjectById: (projectId) => sessionsRepository.findProjectById(projectId),
    getCurrentKnowledgeBaseSessionId: () => knowledgeBaseChatRepository.getCurrentSessionId()
  },
  {
    openExternal: (url) => shell.openExternal(url)
  }
)
browserViewAdapter.setService(browserService)

export function getBrowserService(): BrowserService {
  return browserService
}

export function registerBrowserIpc(): void {
  browserService.onEvent((event) => {
    for (const window of browserViewAdapter.getOwnerWindows()) {
      if (!window.webContents.isDestroyed())
        window.webContents.send(IPC_CHANNELS.browser.event, event)
    }
  })

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
  ipcMain.handle(IPC_CHANNELS.browser.show, (event, request: unknown) =>
    browserService.show(browserPresentationRequestSchema.parse(request), event.sender)
  )
  ipcMain.handle(IPC_CHANNELS.browser.hide, (_event, request: unknown) => {
    browserService.hide(browserContextRequestSchema.parse(request))
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
}

export function disposeBrowserIpcResources(): void {
  browserService.disposeAll()
}
