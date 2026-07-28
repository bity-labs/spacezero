import { BrowserWindow, ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { getUpdateService } from './update.service'

export function registerUpdateIpc(): void {
  const updateService = getUpdateService()

  updateService.onStatusChange((status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.update.statusChanged, status)
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.update.getStatus, () => updateService.getStatus())
  ipcMain.handle(IPC_CHANNELS.update.checkForUpdates, () => updateService.checkForUpdates())
}
