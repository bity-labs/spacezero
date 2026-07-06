import type { WorkspaceTool } from './workspace-tool.model'

/**
 * The approved catalog of Workspace Tools available to agents.
 *
 * Feature-owned tool definitions are composed into a registry by the Agent
 * Workspace / Workspace Control Plane. The registry is the single place used to
 * expose approved capabilities, validate inputs, enforce safety policy, and
 * record activity history.
 */
export class WorkspaceToolRegistry {
  private readonly tools = new Map<string, WorkspaceTool>()

  register(tool: WorkspaceTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Workspace tool already registered: ${tool.name}`)
    }
    this.tools.set(tool.name, tool)
  }

  resolve(name: string): WorkspaceTool | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  list(): WorkspaceTool[] {
    return Array.from(this.tools.values())
  }
}

/**
 * Compose feature-owned tool sets into a single registry in declaration order.
 *
 * Each feature owns its tool definitions near its main-process application
 * services and passes them to the composition layer as a set.
 */
export function composeWorkspaceToolRegistry(
  ...featureToolSets: WorkspaceTool[][]
): WorkspaceToolRegistry {
  const registry = new WorkspaceToolRegistry()
  for (const toolSet of featureToolSets) {
    for (const tool of toolSet) {
      registry.register(tool)
    }
  }
  return registry
}
