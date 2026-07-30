import { describe, expect, it } from 'vitest'

import {
  cancelFilesSearchRequestSchema,
  createFilesEntryRequestSchema,
  listFilesDirectoryRequestSchema,
  listFilesTreeRequestSchema,
  moveFilesEntryRequestSchema,
  openFilesDocumentRequestSchema,
  revealFilesEntryRequestSchema,
  saveFilesDocumentRequestSchema,
  searchFilesRequestSchema,
  trashFilesEntryRequestSchema
} from './files.schema'

const projectHomeContext = { kind: 'project-home' as const, projectId: 'project-1' }
const projectContext = { kind: 'project-session' as const, sessionId: 'session-1' }
const knowledgeBaseContext = { kind: 'knowledge-base', contextKey: 'knowledge-base' } as const

describe('Files IPC schemas', () => {
  it('accepts Project Home, Project Session, and Knowledge Base contexts without arbitrary roots', () => {
    expect(listFilesTreeRequestSchema.parse({ context: projectHomeContext })).toEqual({
      context: projectHomeContext
    })
    expect(listFilesTreeRequestSchema.parse({ context: projectContext })).toEqual({
      context: projectContext
    })
    expect(listFilesTreeRequestSchema.parse({ context: knowledgeBaseContext })).toEqual({
      context: knowledgeBaseContext
    })

    for (const input of [
      { context: { kind: 'project-home', projectId: '' } },
      { context: { kind: 'project-home', projectId: 'project-1', rootPath: '/arbitrary' } },
      { context: { kind: 'project-session', sessionId: '' } },
      { context: { kind: 'knowledge-base', contextKey: 'kb-session-1' } },
      { context: knowledgeBaseContext, rootPath: '/arbitrary' },
      { context: projectContext, relativePath: 'src' }
    ]) {
      expect(() => listFilesTreeRequestSchema.parse(input)).toThrow()
    }
  })

  it('accepts project and Knowledge Base contexts with bounded context-relative directory paths', () => {
    expect(
      listFilesDirectoryRequestSchema.parse({
        context: projectContext,
        relativePath: ' src/features '
      })
    ).toEqual({ context: projectContext, relativePath: ' src/features ' })
    expect(
      listFilesDirectoryRequestSchema.parse({ context: projectContext, relativePath: '' })
    ).toEqual({ context: projectContext, relativePath: '' })
    expect(
      listFilesDirectoryRequestSchema.parse({ context: knowledgeBaseContext, relativePath: '' })
    ).toEqual({ context: knowledgeBaseContext, relativePath: '' })

    for (const input of [
      { context: { kind: 'project-session', sessionId: '' }, relativePath: '' },
      { context: { kind: 'knowledge-base', contextKey: 'kb-session-1' }, relativePath: '' },
      { context: knowledgeBaseContext, sessionId: 'kb-session-1', relativePath: '' },
      { context: projectContext, relativePath: '../outside' },
      { context: projectContext, relativePath: '/absolute' },
      { context: projectContext, relativePath: 'C:/absolute' },
      { context: projectContext, relativePath: 'src\\features' },
      { context: projectContext, relativePath: '.git/objects' },
      { context: projectContext, relativePath: '.GIT/objects' },
      { context: projectContext, relativePath: 'src//features' },
      { context: projectContext, relativePath: 'a'.repeat(4097) },
      { context: projectContext, relativePath: '', rootPath: '/arbitrary' }
    ]) {
      expect(() => listFilesDirectoryRequestSchema.parse(input)).toThrow()
    }
  })

  it('accepts bounded context search requests without arbitrary roots', () => {
    expect(
      searchFilesRequestSchema.parse({
        context: knowledgeBaseContext,
        query: ' readme ',
        includeIgnored: true,
        requestId: 'search-1',
        maxResults: 25
      })
    ).toEqual({
      context: knowledgeBaseContext,
      query: 'readme',
      includeIgnored: true,
      requestId: 'search-1',
      maxResults: 25
    })

    for (const input of [
      { context: knowledgeBaseContext, query: '', includeIgnored: false, requestId: 'search-1' },
      {
        context: knowledgeBaseContext,
        query: 'x'.repeat(201),
        includeIgnored: false,
        requestId: 'search-1'
      },
      {
        context: knowledgeBaseContext,
        query: 'readme',
        includeIgnored: 'yes',
        requestId: 'search-1'
      },
      { context: knowledgeBaseContext, query: 'readme', includeIgnored: false, requestId: '' },
      {
        context: knowledgeBaseContext,
        query: 'readme',
        includeIgnored: false,
        requestId: 'search-1',
        maxResults: 0
      },
      {
        context: knowledgeBaseContext,
        query: 'readme',
        includeIgnored: false,
        requestId: 'search-1',
        rootPath: '/tmp'
      }
    ]) {
      expect(() => searchFilesRequestSchema.parse(input)).toThrow()
    }
  })

  it('accepts bounded search cancellation requests without arbitrary roots', () => {
    expect(
      cancelFilesSearchRequestSchema.parse({ context: projectContext, requestId: 'search-1' })
    ).toEqual({ context: projectContext, requestId: 'search-1' })

    for (const input of [
      { context: projectContext, requestId: '' },
      { context: projectContext, requestId: 'search-1', rootPath: '/tmp' }
    ]) {
      expect(() => cancelFilesSearchRequestSchema.parse(input)).toThrow()
    }
  })

  it('requires document reads and writes to use non-empty context-relative file paths', () => {
    expect(
      openFilesDocumentRequestSchema.parse({ context: projectContext, relativePath: ' README ' })
    ).toEqual({ context: projectContext, relativePath: ' README ' })
    expect(
      saveFilesDocumentRequestSchema.parse({
        context: knowledgeBaseContext,
        relativePath: ' README ',
        content: 'updated',
        expectedRevision: 'revision-1'
      })
    ).toEqual({
      context: knowledgeBaseContext,
      relativePath: ' README ',
      content: 'updated',
      expectedRevision: 'revision-1'
    })

    for (const input of [
      { context: projectContext, relativePath: '' },
      { context: projectContext, relativePath: '../outside' },
      { context: projectContext, relativePath: '.git/config' },
      { context: projectContext, relativePath: 'src/./file.txt' },
      { context: projectContext, relativePath: 'src//file.txt' },
      { context: projectContext, relativePath: 'src/file.txt', rootPath: '/arbitrary' }
    ]) {
      expect(() => openFilesDocumentRequestSchema.parse(input)).toThrow()
    }

    expect(() =>
      saveFilesDocumentRequestSchema.parse({
        context: projectContext,
        relativePath: 'README',
        content: 'x'.repeat(2 * 1024 * 1024 + 1),
        expectedRevision: 'revision-1'
      })
    ).toThrow()
  })

  it('requires file operations to use authenticated context identity and relative entry paths', () => {
    expect(
      createFilesEntryRequestSchema.parse({
        context: projectContext,
        relativePath: 'src/new.ts',
        kind: 'file'
      })
    ).toEqual({ context: projectContext, relativePath: 'src/new.ts', kind: 'file' })
    expect(
      createFilesEntryRequestSchema.parse({
        context: knowledgeBaseContext,
        relativePath: 'notes',
        kind: 'folder'
      })
    ).toEqual({ context: knowledgeBaseContext, relativePath: 'notes', kind: 'folder' })
    expect(
      moveFilesEntryRequestSchema.parse({
        context: projectContext,
        sourcePath: 'src/old.ts',
        destinationPath: 'src/new.ts'
      })
    ).toEqual({ context: projectContext, sourcePath: 'src/old.ts', destinationPath: 'src/new.ts' })
    expect(
      trashFilesEntryRequestSchema.parse({ context: projectContext, relativePath: 'src/new.ts' })
    ).toEqual({ context: projectContext, relativePath: 'src/new.ts' })

    for (const input of [
      { context: projectContext, relativePath: '', kind: 'file' },
      { context: projectContext, relativePath: '../outside', kind: 'file' },
      { context: projectContext, relativePath: '.git/config', kind: 'file' },
      { context: projectContext, relativePath: 'src/new.ts', kind: 'symlink' },
      { context: projectContext, relativePath: 'src/new.ts', rootPath: '/tmp', kind: 'file' }
    ]) {
      expect(() => createFilesEntryRequestSchema.parse(input)).toThrow()
    }

    for (const input of [
      { context: projectContext, sourcePath: '', destinationPath: 'new.ts' },
      { context: projectContext, sourcePath: 'old.ts', destinationPath: '../new.ts' },
      { context: projectContext, sourcePath: '.git/config', destinationPath: 'config' },
      { context: projectContext, sourcePath: 'old.ts', destinationPath: 'new.ts', rootPath: '/tmp' }
    ]) {
      expect(() => moveFilesEntryRequestSchema.parse(input)).toThrow()
    }

    expect(() =>
      trashFilesEntryRequestSchema.parse({
        context: projectContext,
        relativePath: '/tmp/secret.txt'
      })
    ).toThrow()
  })

  it('requires Reveal requests to use authenticated context identity and a relative entry path', () => {
    expect(
      revealFilesEntryRequestSchema.parse({
        context: knowledgeBaseContext,
        relativePath: 'assets/image.png'
      })
    ).toEqual({ context: knowledgeBaseContext, relativePath: 'assets/image.png' })

    for (const input of [
      { context: projectContext, relativePath: '' },
      { context: projectContext, relativePath: '/tmp/secret.txt' },
      { context: projectContext, relativePath: '../secret.txt' },
      { context: projectContext, relativePath: '.git/config' },
      { context: projectContext, relativePath: 'safe.txt', absolutePath: '/tmp/safe.txt' }
    ]) {
      expect(() => revealFilesEntryRequestSchema.parse(input)).toThrow()
    }
  })
})
