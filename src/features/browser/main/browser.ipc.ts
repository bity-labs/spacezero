import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import {
  browserCloseTabRequestSchema,
  browserContextRequestSchema,
  browserNavigateRequestSchema,
  browserPresentationRequestSchema
} from '../shared'
import { BrowserService } from './browser.service'
import { ElectronBrowserViewAdapter } from './browser.webcontents-adapter'

const browserViewAdapter = new ElectronBrowserViewAdapter()
const browserService = new BrowserService(browserViewAdapter)
browserViewAdapter.setService(browserService)

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
