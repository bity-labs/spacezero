import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { getUpdateService } from './update.service'

export function registerUpdateIpc(): void {
  ipcMain.handle(IPC_CHANNELS.update.getStatus, () => getUpdateService().getStatus())
  ipcMain.handle(IPC_CHANNELS.update.checkForUpdates, () => getUpdateService().checkForUpdates())
}
