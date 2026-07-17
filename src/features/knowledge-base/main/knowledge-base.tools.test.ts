import { describe, expect, it, vi } from 'vitest'

import type { AnyWorkspaceTool } from '../../agent-workspace/main/workspace-tool.model'
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

function findTool(tools: AnyWorkspaceTool[], name: string): AnyWorkspaceTool {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing Workspace Tool: ${name}`)
  return tool
}

describe('createKnowledgeBaseTools', () => {
  it('exposes structured Knowledge Base capabilities for Workspace Sessions', () => {
    const tools = createKnowledgeBaseTools(createFilesService())

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
    const tool = findTool(
      createKnowledgeBaseTools(service) as AnyWorkspaceTool[],
      'knowledgeBase.readDocument'
    )

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
    const tool = findTool(
      createKnowledgeBaseTools(service) as AnyWorkspaceTool[],
      'knowledgeBase.saveDocument'
    )

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
})
