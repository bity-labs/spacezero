import { registerAgentIpc } from '../../features/agent-workspace/main/agent.ipc'
import { registerAgentsIpc } from '../../features/agents/main/agents.ipc'
import { registerBrowserIpc } from '../../features/browser/main/browser.ipc'
import { registerFilesIpc } from '../../features/files/main/files.ipc'
import { registerGitIpc } from '../../features/git/main/git.ipc'
import { registerGitHubIpc } from '../../features/github/main/github.ipc'
import { registerKnowledgeBaseIpc } from '../../features/knowledge-base/main/knowledge-base.ipc'
import { registerLicenseActivationIpc } from '../../features/license-activation/main/license-activation.ipc'
import { registerOnboardingIpc } from '../../features/onboarding/main/onboarding.ipc'
import { registerProjectsIpc } from '../../features/projects/main/projects.ipc'
import { registerSessionsIpc } from '../../features/sessions/main/sessions.ipc'
import { registerSettingsIpc } from '../../features/settings/main/settings.ipc'
import { registerTerminalIpc } from '../../features/terminal/main/terminal.ipc'
import { registerUpdateIpc } from '../../features/updates/main'
import { registerAppIpc } from './app'
import { registerDbIpc } from './db'

let registered = false

export function registerIpcHandlers(): void {
  if (registered) return

  registerAppIpc()
  registerAgentIpc()
  registerBrowserIpc()
  registerAgentsIpc()
  registerDbIpc()
  registerFilesIpc()
  registerGitIpc()
  registerGitHubIpc()
  registerKnowledgeBaseIpc()
  registerLicenseActivationIpc()
  registerOnboardingIpc()
  registerProjectsIpc()
  registerSessionsIpc()
  registerSettingsIpc()
  registerTerminalIpc()
  registerUpdateIpc()

  registered = true
}
