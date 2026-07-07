import { z } from 'zod'

import type { AnyWorkspaceTool } from './workspace-tool.model'
import { WorkspaceToolRegistry, composeWorkspaceToolRegistry } from './workspace-tool-registry'

function tool(overrides: Partial<AnyWorkspaceTool> & Pick<AnyWorkspaceTool, 'name'>): AnyWorkspaceTool {
  return {
    description: `${overrides.name} tool`,
    safetyLevel: 'read',
    kind: 'app-state',
    domain: 'workspace',
    inputSchema: z.object({}).strict(),
    handler: async () => ({ ok: true, data: { done: true } }),
    ...overrides
  }
}

describe('WorkspaceToolRegistry', () => {
  it('registers and resolves tools by name', () => {
    const registry = new WorkspaceToolRegistry()
    const projectsList = tool({ name: 'projects.list' })

    registry.register(projectsList)

    expect(registry.resolve('projects.list')).toBe(projectsList)
    expect(registry.has('projects.list')).toBe(true)
    expect(registry.has('unknown.tool')).toBe(false)
  })

  it('lists registered tools in registration order', () => {
    const registry = new WorkspaceToolRegistry()
    const a = tool({ name: 'projects.list' })
    const b = tool({ name: 'settings.get' })

    registry.register(a)
    registry.register(b)

    expect(registry.list()).toEqual([a, b])
  })

  it('rejects duplicate tool names while the original is registered', () => {
    const registry = new WorkspaceToolRegistry()
    registry.register(tool({ name: 'projects.list' }))

    expect(() => registry.register(tool({ name: 'projects.list' }))).toThrow(
      'Workspace tool already registered: projects.list'
    )
  })

  it('composes feature-owned tool sets into a single registry', () => {
    const projectsTools = [tool({ name: 'projects.list' }), tool({ name: 'projects.create' })]
    const settingsTools = [tool({ name: 'settings.get' })]

    const registry = composeWorkspaceToolRegistry(projectsTools, settingsTools)

    expect(registry.list().map((t) => t.name)).toEqual([
      'projects.list',
      'projects.create',
      'settings.get'
    ])
  })
})
