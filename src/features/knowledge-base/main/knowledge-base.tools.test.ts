import { describe, expect, it, vi } from 'vitest'

import type { AnyWorkspaceTool } from '../../agent-workspace/main/workspace-tool.model'
import type { KnowledgeBaseGitAgentService } from './knowledge-base-git-agent.service'
import type { KnowledgeBaseFilesService } from './knowledge-base-files.service'
import { createKnowledgeBaseTools } from './knowledge-base.tools'

function createFilesService(): Pick<
  KnowledgeBaseFilesService,
  'getTree' | 'openDocument' | 'saveDocument'
> {
  const getTree: KnowledgeBaseFilesService['getTree'] = vi.fn(async () => [])
  const openDocument: KnowledgeBaseFilesService['openDocument'] = vi.fn(
    async ({ relativePath }) => ({
      name: 'note.md',
      relativePath,
      contentKind: 'markdown' as const,
      size: 6,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: '# Note'
    })
  )
  const saveDocument: KnowledgeBaseFilesService['saveDocument'] = vi.fn(
    async ({ relativePath, content }) => ({
      status: 'saved' as const,
      document: {
        name: 'note.md',
        relativePath,
        contentKind: 'markdown' as const,
        size: content.length,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content
      }
    })
  )
  return { getTree, openDocument, saveDocument }
}

function createGitService(): KnowledgeBaseGitAgentService {
  return {
    inspectRepository: vi.fn(async () => ({
      branch: 'main',
      origin: { configured: false as const },
      porcelainStatus: ' M note.md'
    })),
    stageFiles: vi.fn(async ({ relativePaths }) => ({ stagedPaths: relativePaths })),
    unstageFiles: vi.fn(async ({ relativePaths }) => ({ unstagedPaths: relativePaths })),
    createCommit: vi.fn(async () => ({ output: '[main abc123] Update notes' })),
    getOriginRemote: vi.fn(async () => ({
      configured: true as const,
      url: 'https://github.com/org/kb.git'
    })),
    configureOrigin: vi.fn(async () => ({
      configured: true as const,
      url: 'https://github.com/org/kb.git'
    })),
    push: vi.fn(async () => ({
      branch: 'main',
      origin: 'https://github.com/org/kb.git',
      output: 'Everything up-to-date'
    }))
  }
}

function createTools(
  service = createFilesService(),
  gitService = createGitService()
): AnyWorkspaceTool[] {
  return createKnowledgeBaseTools(service, gitService) as AnyWorkspaceTool[]
}

function findTool(tools: AnyWorkspaceTool[], name: string): AnyWorkspaceTool {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing Workspace Tool: ${name}`)
  return tool
}

describe('createKnowledgeBaseTools', () => {
  it('exposes structured Knowledge Base capabilities for Workspace Sessions', () => {
    const tools = createTools()

    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'knowledgeBase.getTree',
          domain: 'knowledge-base',
          safetyLevel: 'read'
        }),
        expect.objectContaining({
          name: 'knowledgeBase.readDocument',
          domain: 'knowledge-base',
          safetyLevel: 'read'
        }),
        expect.objectContaining({
          name: 'knowledgeBase.saveDocument',
          domain: 'knowledge-base',
          safetyLevel: 'write'
        })
      ])
    )
  })

  it('reads a mentioned document through the main-process files service', async () => {
    const service = createFilesService()
    const tool = findTool(createTools(service), 'knowledgeBase.readDocument')

    await expect(tool.handler({ relativePath: 'Design Notes/README.md' })).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        relativePath: 'Design Notes/README.md',
        content: '# Note',
        revision: 'revision-1'
      })
    })
    expect(service.openDocument).toHaveBeenCalledWith({
      relativePath: 'Design Notes/README.md'
    })
  })

  it('saves with optimistic revision protection through the main-process files service', async () => {
    const service = createFilesService()
    const tool = findTool(createTools(service), 'knowledgeBase.saveDocument')

    await expect(
      tool.handler({
        relativePath: 'note.md',
        content: '# Updated',
        expectedRevision: 'revision-1'
      })
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ status: 'saved' })
    })
    expect(service.saveDocument).toHaveBeenCalledWith({
      relativePath: 'note.md',
      content: '# Updated',
      expectedRevision: 'revision-1'
    })
  })

  it('exposes scoped Knowledge Base Git tools with safety metadata', () => {
    const tools = createTools()

    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'knowledgeBase.git.inspect',
          safetyLevel: 'read',
          domain: 'knowledge-base'
        }),
        expect.objectContaining({
          name: 'knowledgeBase.git.stageFiles',
          safetyLevel: 'write',
          domain: 'knowledge-base'
        }),
        expect.objectContaining({
          name: 'knowledgeBase.git.commit',
          safetyLevel: 'write',
          domain: 'knowledge-base'
        }),
        expect.objectContaining({
          name: 'knowledgeBase.git.configureOrigin',
          safetyLevel: 'dangerous',
          domain: 'knowledge-base'
        }),
        expect.objectContaining({
          name: 'knowledgeBase.git.push',
          safetyLevel: 'dangerous',
          domain: 'knowledge-base'
        })
      ])
    )
  })

  it('validates Knowledge Base-relative paths for Git staging tools', () => {
    const stage = findTool(createTools(), 'knowledgeBase.git.stageFiles')

    expect(stage.inputSchema.safeParse({ relativePaths: ['notes/today.md'] }).success).toBe(true)
    expect(stage.inputSchema.safeParse({ relativePaths: ['../outside.md'] }).success).toBe(false)
    expect(stage.inputSchema.safeParse({ relativePaths: ['/tmp/outside.md'] }).success).toBe(false)
    expect(stage.inputSchema.safeParse({ relativePaths: ['.git/config'] }).success).toBe(false)
  })

  it('routes Git tool handlers through the Knowledge Base Git service', async () => {
    const gitService = createGitService()
    const tools = createTools(createFilesService(), gitService)

    await expect(
      findTool(tools, 'knowledgeBase.git.stageFiles').handler({
        relativePaths: ['notes/today.md']
      })
    ).resolves.toEqual({ ok: true, data: { stagedPaths: ['notes/today.md'] } })
    expect(gitService.stageFiles).toHaveBeenCalledWith({ relativePaths: ['notes/today.md'] })

    await expect(
      findTool(tools, 'knowledgeBase.git.configureOrigin').handler({
        gitUrl: 'https://token@example.com/org/kb.git'
      })
    ).resolves.toEqual({
      ok: true,
      data: { configured: true, url: 'https://github.com/org/kb.git' }
    })
    expect(gitService.configureOrigin).toHaveBeenCalledWith({
      gitUrl: 'https://token@example.com/org/kb.git'
    })
  })
})
