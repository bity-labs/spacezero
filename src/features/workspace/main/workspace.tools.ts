import { z } from 'zod'

import { defineWorkspaceTool } from '../../agent-workspace/main/workspace-tool.model'
import { getWorkspaceStatus } from './workspace-status.service'

export function createWorkspaceTools() {
  return [
    defineWorkspaceTool({
      name: 'workspace.getStatus',
      description: 'Get structured status for the Space Zero workspace.',
      safetyLevel: 'read',
      kind: 'app-state',
      domain: 'workspace',
      inputSchema: z.object({}).strict(),
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      },
      handler: () => ({ ok: true, data: getWorkspaceStatus() })
    })
  ]
}
