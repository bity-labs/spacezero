import { app, ipcMain } from 'electron'

import { IPC_CHANNELS, type AppInfo } from '../../shared/ipc'

export function registerAppIpc(): void {
  ipcMain.handle(IPC_CHANNELS.app.getInfo, (): AppInfo => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform
    }
  })

  ipcMain.handle(IPC_CHANNELS.app.ping, () => 'pong')
}
