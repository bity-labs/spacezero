import type { WorkspaceToolAgentDescriptor } from '../../../shared/workspace-tool-protocol'
import type { AnyWorkspaceTool } from './workspace-tool.model'

/**
 * The approved catalog of Workspace Tools available to agents.
 *
 * Feature-owned tool definitions are composed into a registry by the Agent
 * Workspace / Workspace Control Plane. The registry is the single place used to
 * expose approved capabilities, validate inputs, enforce safety policy, and
 * record activity history.
 */
export class WorkspaceToolRegistry {
  private readonly tools = new Map<string, AnyWorkspaceTool>()

  register(tool: AnyWorkspaceTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Workspace tool already registered: ${tool.name}`)
    }
    this.tools.set(tool.name, tool)
  }

  resolve(name: string): AnyWorkspaceTool | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  list(): AnyWorkspaceTool[] {
    return Array.from(this.tools.values())
  }

  listAgentDescriptors(): WorkspaceToolAgentDescriptor[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      safetyLevel: tool.safetyLevel,
      kind: tool.kind,
      domain: tool.domain,
      parameters: tool.agentParameters ?? {
        type: 'object',
        additionalProperties: false,
        properties: {}
      }
    }))
  }
}

/**
 * Compose feature-owned tool sets into a single registry in declaration order.
 *
 * Each feature owns its tool definitions near its main-process application
 * services and passes them to the composition layer as a set.
 */
export function composeWorkspaceToolRegistry(
  ...featureToolSets: AnyWorkspaceTool[][]
): WorkspaceToolRegistry {
  const registry = new WorkspaceToolRegistry()
  for (const toolSet of featureToolSets) {
    for (const tool of toolSet) {
      registry.register(tool)
    }
  }
  return registry
}
