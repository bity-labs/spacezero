import { registerAgentIpc } from '../../features/agent-workspace/main/agent.ipc'
import { registerProjectsIpc } from '../../features/projects/main/projects.ipc'
import { registerSessionsIpc } from '../../features/sessions/main/sessions.ipc'
import { registerSettingsIpc } from '../../features/settings/main/settings.ipc'
import { registerAppIpc } from './app'
import { registerDbIpc } from './db'

let registered = false

export function registerIpcHandlers(): void {
  if (registered) return

  registerAppIpc()
  registerAgentIpc()
  registerDbIpc()
  registerProjectsIpc()
  registerSessionsIpc()
  registerSettingsIpc()

  registered = true
}
