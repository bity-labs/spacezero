import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../shared/ipc'
import { getDatabaseHealth } from '../db'

export function registerDbIpc(): void {
  ipcMain.handle(IPC_CHANNELS.db.health, () => getDatabaseHealth())
}
