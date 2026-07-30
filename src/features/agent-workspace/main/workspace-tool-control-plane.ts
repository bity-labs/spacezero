import { createGitHubTools } from '../../github/main/github.tools'
import { createKnowledgeBaseTools } from '../../knowledge-base/main/knowledge-base.tools'
import { createWorkspaceTools } from '../../workspace/main/workspace.tools'
import { InMemoryAgentActivityHistory } from './agent-activity-history'
import { WorkspaceToolExecutor } from './workspace-tool-executor'
import { composeWorkspaceToolRegistry } from './workspace-tool-registry'
import { DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY } from './workspace-tool-safety-policy'

const registry = composeWorkspaceToolRegistry(
  createWorkspaceTools(),
  createKnowledgeBaseTools(),
  createGitHubTools()
)
const history = new InMemoryAgentActivityHistory()
const executor = new WorkspaceToolExecutor({
  registry,
  history,
  policy: DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY
})

export function getWorkspaceToolRegistry() {
  return registry
}

export function listWorkspaceToolDescriptorsForSession(context?: {
  kind?: 'project' | 'workspace'
  managedContext?: 'knowledge-base' | 'global-chat' | null
}) {
  const includeKnowledgeBaseGit = context?.managedContext === 'knowledge-base'
  const includeGitHubPullRequestCreation = context?.kind === 'project'
  return registry.listAgentDescriptors().filter((descriptor) => {
    if (!includeKnowledgeBaseGit && descriptor.name.startsWith('knowledgeBase.git.')) return false
    if (!includeGitHubPullRequestCreation && descriptor.name.startsWith('github.')) return false
    return true
  })
}

export function getAgentActivityHistory() {
  return history
}

export function getWorkspaceToolExecutor() {
  return executor
}
