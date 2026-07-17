import { registerAgentIpc } from '../../features/agent-workspace/main/agent.ipc'
import { registerGitHubIpc } from '../../features/github/main/github.ipc'
import { registerKnowledgeBaseIpc } from '../../features/knowledge-base/main/knowledge-base.ipc'
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
  registerGitHubIpc()
  registerKnowledgeBaseIpc()
  registerProjectsIpc()
  registerSessionsIpc()
  registerSettingsIpc()

  registered = true
}
