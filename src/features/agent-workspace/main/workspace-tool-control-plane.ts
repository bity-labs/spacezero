import { createKnowledgeBaseTools } from '../../knowledge-base/main/knowledge-base.tools'
import { createWorkspaceTools } from '../../workspace/main/workspace.tools'
import { InMemoryAgentActivityHistory } from './agent-activity-history'
import { WorkspaceToolExecutor } from './workspace-tool-executor'
import { composeWorkspaceToolRegistry } from './workspace-tool-registry'
import { DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY } from './workspace-tool-safety-policy'

const registry = composeWorkspaceToolRegistry(
  createWorkspaceTools(),
  createKnowledgeBaseTools()
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
  managedContext?: 'knowledge-base' | 'global-chat' | null
}) {
  const includeKnowledgeBaseGit = context?.managedContext === 'knowledge-base'
  return registry
    .listAgentDescriptors()
    .filter(
      (descriptor) =>
        includeKnowledgeBaseGit || !descriptor.name.startsWith('knowledgeBase.git.')
    )
}

export function getAgentActivityHistory() {
  return history
}

export function getWorkspaceToolExecutor() {
  return executor
}
