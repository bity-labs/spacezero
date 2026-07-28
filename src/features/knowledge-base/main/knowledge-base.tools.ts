import { z } from 'zod'

import { defineWorkspaceTool } from '../../agent-workspace/main/workspace-tool.model'
import type { WorkspaceToolResult } from '../../agent-workspace/shared/workspace-tool.model'
import {
  createKnowledgeBaseDocumentRequestSchema,
  createKnowledgeBaseFolderRequestSchema,
  knowledgeBasePathRequestSchema,
  saveKnowledgeBaseDocumentRequestSchema
} from '../shared'
import {
  knowledgeBaseGitCommitSchema,
  knowledgeBaseGitConflictOperationSchema,
  knowledgeBaseGitOriginSchema,
  knowledgeBaseGitPathListSchema,
  knowledgeBaseGitPushSchema,
  type KnowledgeBaseGitAgentService
} from './knowledge-base-git-agent.service'
import { sanitizeGitRemoteUrl } from './knowledge-base-git-security'
import type { KnowledgeBaseFilesService } from './knowledge-base-files.service'
import { getKnowledgeBaseGitAgentService, getKnowledgeBaseService } from './index'

export type KnowledgeBaseToolService = Pick<
  KnowledgeBaseFilesService,
  'getTree' | 'openDocument' | 'saveDocument' | 'createDocument' | 'createFolder'
>

export function createKnowledgeBaseTools(
  service: KnowledgeBaseToolService = getKnowledgeBaseService(),
  gitService: KnowledgeBaseGitAgentService = getKnowledgeBaseGitAgentService()
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
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.createDocument',
      description:
        'Create a new Knowledge Base text or Markdown document at a relative @kb path. Does not overwrite existing files or folders.',
      safetyLevel: 'write',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: createKnowledgeBaseDocumentRequestSchema.strict(),
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          relativePath: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['relativePath', 'content']
      },
      confirmationSummary: (input) =>
        `Create Knowledge Base document ${input.relativePath}`,
      handler: async (input) => toKnowledgeBaseCreateToolResult(service.createDocument(input))
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.createFolder',
      description:
        'Create a new Knowledge Base folder at a relative @kb path. Does not overwrite existing files or folders.',
      safetyLevel: 'write',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: createKnowledgeBaseFolderRequestSchema.strict(),
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: { relativePath: { type: 'string' } },
        required: ['relativePath']
      },
      confirmationSummary: (input) => `Create Knowledge Base folder ${input.relativePath}`,
      handler: async (input) => toKnowledgeBaseCreateToolResult(service.createFolder(input))
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.git.inspect',
      description:
        'Inspect fresh Knowledge Base Git status, current branch, and sanitized origin information. This is scoped to the verified Knowledge Base repository.',
      safetyLevel: 'read',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: z.object({}).strict(),
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      },
      handler: async () => ({ ok: true, data: await gitService.inspectRepository() })
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.git.stageFiles',
      description:
        'Stage whole Knowledge Base files by repository-relative path. Does not accept arbitrary Git arguments or paths outside the verified Knowledge Base repository.',
      safetyLevel: 'write',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: knowledgeBaseGitPathListSchema,
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: { relativePaths: { type: 'array', items: { type: 'string' } } },
        required: ['relativePaths']
      },
      confirmationSummary: (input) =>
        `Stage Knowledge Base files: ${input.relativePaths.join(', ')}`,
      handler: async (input) => ({ ok: true, data: await gitService.stageFiles(input) })
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.git.unstageFiles',
      description:
        'Unstage whole Knowledge Base files by repository-relative path. Does not accept arbitrary Git arguments or paths outside the verified Knowledge Base repository.',
      safetyLevel: 'write',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: knowledgeBaseGitPathListSchema,
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: { relativePaths: { type: 'array', items: { type: 'string' } } },
        required: ['relativePaths']
      },
      confirmationSummary: (input) =>
        `Unstage Knowledge Base files: ${input.relativePaths.join(', ')}`,
      handler: async (input) => ({ ok: true, data: await gitService.unstageFiles(input) })
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.git.commit',
      description:
        'Create a Knowledge Base Git commit from currently staged changes using the supplied commit message. The repository root is resolved and verified by Space Zero.',
      safetyLevel: 'write',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: knowledgeBaseGitCommitSchema,
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: { message: { type: 'string' } },
        required: ['message']
      },
      confirmationSummary: (input) => `Commit Knowledge Base changes: ${input.message}`,
      handler: async (input) => ({ ok: true, data: await gitService.createCommit(input) })
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.git.getOrigin',
      description:
        'Inspect whether the verified Knowledge Base repository has an origin remote. Returned URLs are sanitized and never include credentials.',
      safetyLevel: 'read',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: z.object({}).strict(),
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      },
      handler: async () => ({ ok: true, data: await gitService.getOriginRemote() })
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.git.configureOrigin',
      description:
        'Add or update the origin remote for the verified Knowledge Base repository. Returned URLs are sanitized and credentials are not echoed back.',
      safetyLevel: 'dangerous',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: knowledgeBaseGitOriginSchema,
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: { gitUrl: { type: 'string' } },
        required: ['gitUrl']
      },
      confirmationSummary: (input) =>
        `Configure Knowledge Base origin: ${sanitizeGitRemoteUrl(input.gitUrl)}`,
      handler: async (input) => ({ ok: true, data: await gitService.configureOrigin(input) })
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.git.push',
      description:
        'Push the current Knowledge Base branch to origin with upstream tracking. This is scoped to the verified Knowledge Base repository and does not accept arbitrary remotes, branches, or Git arguments.',
      safetyLevel: 'dangerous',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: knowledgeBaseGitPushSchema,
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      },
      confirmationSummary: () => 'Push Knowledge Base Git branch to origin',
      handler: async () => ({ ok: true, data: await gitService.push() })
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.git.continueConflictResolution',
      description:
        'Continue the current supported Knowledge Base Git conflict operation after files have been resolved and staged. Supports merge, rebase, cherry-pick, and revert states only; does not accept arbitrary Git arguments.',
      safetyLevel: 'dangerous',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: knowledgeBaseGitConflictOperationSchema,
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      },
      confirmationSummary: () => 'Continue the current Knowledge Base Git conflict operation',
      handler: async (input) => ({
        ok: true,
        data: await gitService.continueConflictResolution(input)
      })
    }),
    defineWorkspaceTool({
      name: 'knowledgeBase.git.abortConflictResolution',
      description:
        'Abort the current supported Knowledge Base Git conflict operation. Supports merge, rebase, cherry-pick, and revert states only; does not accept arbitrary Git arguments.',
      safetyLevel: 'dangerous',
      kind: 'app-state',
      domain: 'knowledge-base',
      inputSchema: knowledgeBaseGitConflictOperationSchema,
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      },
      confirmationSummary: () => 'Abort the current Knowledge Base Git conflict operation',
      handler: async (input) => ({ ok: true, data: await gitService.abortConflictResolution(input) })
    })
  ]
}

async function toKnowledgeBaseCreateToolResult(
  result: Promise<unknown>
): Promise<WorkspaceToolResult> {
  try {
    return { ok: true, data: await result }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: {
        code: classifyKnowledgeBaseCreateError(message),
        message
      }
    }
  }
}

function classifyKnowledgeBaseCreateError(message: string): string {
  if (
    message.startsWith('Knowledge Base is unavailable') ||
    message === 'Knowledge Base is not configured.'
  ) {
    return 'unavailable-root'
  }
  if (message.startsWith('Knowledge Base ')) return 'validation-error'
  return 'create-failed'
}
