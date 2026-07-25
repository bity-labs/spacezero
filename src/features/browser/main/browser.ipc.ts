import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import {
  browserCloseTabRequestSchema,
  browserContextRequestSchema,
  browserNavigateRequestSchema,
  browserPresentationRequestSchema
} from '../shared'
import { createKnowledgeBaseChatRepository } from '../../knowledge-base/main/knowledge-base-chat.repository'
import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { BrowserService } from './browser.service'
import { ElectronBrowserViewAdapter } from './browser.webcontents-adapter'

const sessionsRepository = createSessionsRepository()
const knowledgeBaseChatRepository = createKnowledgeBaseChatRepository()
const browserViewAdapter = new ElectronBrowserViewAdapter()
const browserService = new BrowserService(browserViewAdapter, {
  findSessionById: (sessionId) => sessionsRepository.findSessionById(sessionId),
  findProjectById: (projectId) => sessionsRepository.findProjectById(projectId),
  getCurrentKnowledgeBaseSessionId: () => knowledgeBaseChatRepository.getCurrentSessionId()
})
browserViewAdapter.setService(browserService)

export function getBrowserService(): BrowserService {
  return browserService
}

export function registerBrowserIpc(): void {
  ipcMain.handle(IPC_CHANNELS.browser.getState, (_event, request: unknown) =>
    browserService.getState(browserContextRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.navigate, (_event, request: unknown) =>
    browserService.navigate(browserNavigateRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.browser.show, (event, request: unknown) =>
    browserService.show(browserPresentationRequestSchema.parse(request), event.sender)
  )
  ipcMain.handle(IPC_CHANNELS.browser.hide, (_event, request: unknown) => {
    browserService.hide(browserContextRequestSchema.parse(request))
  })
  ipcMain.handle(IPC_CHANNELS.browser.closeTab, (_event, request: unknown) =>
    browserService.closeTab(browserCloseTabRequestSchema.parse(request))
  )
}

export function disposeBrowserIpcResources(): void {
  browserService.disposeAll()
}
