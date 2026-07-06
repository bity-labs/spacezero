import { registerSettingsIpc } from '../../features/settings/main/settings.ipc'
import { registerAppIpc } from './app'
import { registerDbIpc } from './db'

let registered = false

export function registerIpcHandlers(): void {
  if (registered) return

  registerAppIpc()
  registerDbIpc()
  registerSettingsIpc()

  registered = true
}
