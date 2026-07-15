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
    }),
    defineWorkspaceTool({
      name: 'workspace.setScratchNote',
      description: 'Set a temporary scratch note in the Space Zero workspace (stub write tool).',
      safetyLevel: 'write',
      kind: 'app-state',
      domain: 'workspace',
      inputSchema: z.object({ note: z.string().min(1).max(500) }).strict(),
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: { note: { type: 'string' } },
        required: ['note']
      },
      confirmationSummary: (input) => `Set workspace scratch note to: ${input.note}`,
      handler: (input) => ({ ok: true, data: { note: input.note } })
    })
  ]
}
