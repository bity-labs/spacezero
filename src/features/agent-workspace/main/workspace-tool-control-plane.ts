import { createWorkspaceTools } from '../../workspace/main/workspace.tools'
import { InMemoryAgentActivityHistory } from './agent-activity-history'
import { WorkspaceToolExecutor } from './workspace-tool-executor'
import { composeWorkspaceToolRegistry } from './workspace-tool-registry'
import { DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY } from './workspace-tool-safety-policy'

const registry = composeWorkspaceToolRegistry(createWorkspaceTools())
const history = new InMemoryAgentActivityHistory()
const executor = new WorkspaceToolExecutor({
  registry,
  history,
  policy: DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY
})

export function getWorkspaceToolRegistry() {
  return registry
}

export function getAgentActivityHistory() {
  return history
}

export function getWorkspaceToolExecutor() {
  return executor
}
