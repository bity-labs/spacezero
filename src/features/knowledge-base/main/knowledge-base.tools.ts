import { z } from 'zod'

import { defineWorkspaceTool } from '../../agent-workspace/main/workspace-tool.model'
import {
  knowledgeBasePathRequestSchema,
  saveKnowledgeBaseDocumentRequestSchema
} from '../shared'
import type { KnowledgeBaseFilesService } from './knowledge-base-files.service'
import { getKnowledgeBaseService } from './index'

export type KnowledgeBaseToolService = Pick<
  KnowledgeBaseFilesService,
  'getTree' | 'openDocument' | 'saveDocument'
>

export function createKnowledgeBaseTools(
  service: KnowledgeBaseToolService = getKnowledgeBaseService()
) {
  return [
    defineWorkspaceTool({
      name: 'knowledgeBase.getTree',
      description:
        'List the Knowledge Base file tree. Paths are relative to the Knowledge Base root; file contents are not included.',
      safetyLevel: 'read',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: z.object({}).strict(),
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      },
      handler: async () => ({ ok: true, data: await service.getTree() })
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.readDocument',
      description:
        'Read one Knowledge Base document by its relative @kb path. Use getTree before reading a folder; do not bulk-read folders.',
      safetyLevel: 'read',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: knowledgeBasePathRequestSchema.strict(),
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: { relativePath: { type: 'string' } },
        required: ['relativePath']
      },
      handler: async (input) => ({
        ok: true,
        data: await service.openDocument(input)
      })
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.saveDocument',
      description:
        'Save an existing Knowledge Base text document using the revision returned by readDocument. A changed revision returns a conflict instead of overwriting.',
      safetyLevel: 'write',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: saveKnowledgeBaseDocumentRequestSchema.strict(),
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          relativePath: { type: 'string' },
          content: { type: 'string' },
          expectedRevision: { type: 'string' }
        },
        required: ['relativePath', 'content', 'expectedRevision']
      },
      confirmationSummary: (input) =>
        `Save Knowledge Base document ${input.relativePath}`,
      handler: async (input) => ({
        ok: true,
        data: await service.saveDocument(input)
      })
    })
  ]
}
