import { describe, expect, it, vi } from 'vitest'

import type { AnyWorkspaceTool } from '../../agent-workspace/main/workspace-tool.model'
import type { KnowledgeBaseGitAgentService } from './knowledge-base-git-agent.service'
import type { KnowledgeBaseFilesService } from './knowledge-base-files.service'
import { createKnowledgeBaseTools } from './knowledge-base.tools'

function createFilesService(): Pick<
  KnowledgeBaseFilesService,
  'getTree' | 'openDocument' | 'saveDocument' | 'createDocument' | 'createFolder'
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
  const createDocument: KnowledgeBaseFilesService['createDocument'] = vi.fn(
    async ({ relativePath, content }) => ({
      status: 'created' as const,
      document: {
        name: relativePath.split('/').at(-1) ?? relativePath,
        relativePath,
        contentKind: relativePath.endsWith('.md') ? ('markdown' as const) : ('text' as const),
        size: content.length,
        modifiedAt: new Date(2).toISOString(),
        revision: 'revision-created',
        content
      }
    })
  )
  const createFolder: KnowledgeBaseFilesService['createFolder'] = vi.fn(
    async ({ relativePath }) => ({ status: 'created' as const, relativePath, kind: 'folder' as const })
  )
  return { getTree, openDocument, saveDocument, createDocument, createFolder }
}

function createGitService(): KnowledgeBaseGitAgentService {
  return {
    inspectRepository: vi.fn(async () => ({
      branch: 'main',
      origin: { configured: false as const },
      porcelainStatus: ' M note.md',
      interruptedOperation: null,
      conflictedFiles: [],
      hasConflicts: false
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
    })),
    continueConflictResolution: vi.fn(async () => ({
      operation: 'rebase' as const,
      output: 'Successfully rebased and updated refs/heads/main.'
    })),
    abortConflictResolution: vi.fn(async () => ({
      operation: 'rebase' as const,
      output: ''
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
        }),
        expect.objectContaining({
          name: 'knowledgeBase.createDocument',
          domain: 'knowledge-base',
          safetyLevel: 'write'
        }),
        expect.objectContaining({
          name: 'knowledgeBase.createFolder',
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

  it('creates documents and folders through write-safe Knowledge Base tools', async () => {
    const service = createFilesService()
    const tools = createTools(service)
    const createDocument = findTool(tools, 'knowledgeBase.createDocument')
    const createFolder = findTool(tools, 'knowledgeBase.createFolder')

    expect(createDocument.confirmationSummary?.({
      relativePath: 'docs/new.md',
      content: '# New\n'
    })).toBe('Create Knowledge Base document docs/new.md')
    expect(createFolder.confirmationSummary?.({ relativePath: 'docs/research' })).toBe(
      'Create Knowledge Base folder docs/research'
    )

    await expect(
      createDocument.handler({ relativePath: 'docs/new.md', content: '# New\n' })
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        status: 'created',
        document: expect.objectContaining({ relativePath: 'docs/new.md', content: '# New\n' })
      })
    })
    expect(service.createDocument).toHaveBeenCalledWith({
      relativePath: 'docs/new.md',
      content: '# New\n'
    })

    await expect(createFolder.handler({ relativePath: 'docs/research' })).resolves.toEqual({
      ok: true,
      data: { status: 'created', relativePath: 'docs/research', kind: 'folder' }
    })
    expect(service.createFolder).toHaveBeenCalledWith({ relativePath: 'docs/research' })
  })

  it('returns structured create outcomes for collisions, unavailable roots, and validation failures', async () => {
    const service = createFilesService()
    vi.mocked(service.createDocument).mockResolvedValueOnce({
      status: 'collision',
      relativePath: 'docs/existing.md'
    })
    const createDocument = findTool(createTools(service), 'knowledgeBase.createDocument')

    await expect(
      createDocument.handler({ relativePath: 'docs/existing.md', content: '# Existing\n' })
    ).resolves.toEqual({
      ok: true,
      data: { status: 'collision', relativePath: 'docs/existing.md' }
    })

    vi.mocked(service.createDocument).mockRejectedValueOnce(
      new Error('Knowledge Base is unavailable at /missing.')
    )
    await expect(
      createDocument.handler({ relativePath: 'docs/new.md', content: '# New\n' })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'unavailable-root',
        message: 'Knowledge Base is unavailable at /missing.'
      }
    })

    vi.mocked(service.createDocument).mockRejectedValueOnce(
      new Error('Knowledge Base path is outside the configured root.')
    )
    await expect(
      createDocument.handler({ relativePath: '../outside.md', content: '# Outside\n' })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'validation-error',
        message: 'Knowledge Base path is outside the configured root.'
      }
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
        }),
        expect.objectContaining({
          name: 'knowledgeBase.git.continueConflictResolution',
          safetyLevel: 'dangerous',
          domain: 'knowledge-base'
        }),
        expect.objectContaining({
          name: 'knowledgeBase.git.abortConflictResolution',
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

  it('validates and sanitizes Knowledge Base origin configuration input', () => {
    const configureOrigin = findTool(createTools(), 'knowledgeBase.git.configureOrigin')

    expect(configureOrigin.inputSchema.safeParse({ gitUrl: 'https://github.com/org/kb.git' }).success).toBe(true)
    expect(configureOrigin.inputSchema.safeParse({ gitUrl: 'git@github.com:org/kb.git' }).success).toBe(true)
    for (const gitUrl of [
      '/tmp/target.git',
      'file:///tmp/target.git',
      'ext::sh -c whoami',
      'https://token@github.com/org/kb.git',
      'https://github.com/org/kb.git?secret=yes'
    ]) {
      expect(configureOrigin.inputSchema.safeParse({ gitUrl }).success).toBe(false)
    }

    const parsed = configureOrigin.inputSchema.parse({
      gitUrl: 'ssh://git@github.com/org/kb.git'
    })
    expect(configureOrigin.confirmationSummary?.(parsed)).toBe(
      'Configure Knowledge Base origin: ssh://github.com/org/kb.git'
    )
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
        gitUrl: 'https://example.com/org/kb.git'
      })
    ).resolves.toEqual({
      ok: true,
      data: { configured: true, url: 'https://github.com/org/kb.git' }
    })
    expect(gitService.configureOrigin).toHaveBeenCalledWith({
      gitUrl: 'https://example.com/org/kb.git'
    })

    await expect(
      findTool(tools, 'knowledgeBase.git.continueConflictResolution').handler({})
    ).resolves.toEqual({
      ok: true,
      data: { operation: 'rebase', output: 'Successfully rebased and updated refs/heads/main.' }
    })
    expect(gitService.continueConflictResolution).toHaveBeenCalledWith({})

    await expect(
      findTool(tools, 'knowledgeBase.git.abortConflictResolution').handler({})
    ).resolves.toEqual({ ok: true, data: { operation: 'rebase', output: '' } })
    expect(gitService.abortConflictResolution).toHaveBeenCalledWith({})
  })
})
