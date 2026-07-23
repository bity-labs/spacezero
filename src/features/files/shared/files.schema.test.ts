import { describe, expect, it } from 'vitest'

import {
  listFilesDirectoryRequestSchema,
  openFilesDocumentRequestSchema,
  saveFilesDocumentRequestSchema
} from './files.schema'

describe('Files IPC schemas', () => {
  it('accepts only a Project Session id and a bounded context-relative directory path', () => {
    expect(
      listFilesDirectoryRequestSchema.parse({
        sessionId: 'session-1',
        relativePath: ' src/features '
      })
    ).toEqual({ sessionId: 'session-1', relativePath: ' src/features ' })
    expect(
      listFilesDirectoryRequestSchema.parse({ sessionId: 'session-1', relativePath: '' })
    ).toEqual({ sessionId: 'session-1', relativePath: '' })

    for (const input of [
      { sessionId: '', relativePath: '' },
      { sessionId: 'session-1', relativePath: '../outside' },
      { sessionId: 'session-1', relativePath: '/absolute' },
      { sessionId: 'session-1', relativePath: 'C:/absolute' },
      { sessionId: 'session-1', relativePath: 'src\\features' },
      { sessionId: 'session-1', relativePath: '.git/objects' },
      { sessionId: 'session-1', relativePath: '.GIT/objects' },
      { sessionId: 'session-1', relativePath: 'src//features' },
      { sessionId: 'session-1', relativePath: 'a'.repeat(4097) },
      { sessionId: 'session-1', relativePath: '', rootPath: '/arbitrary' }
    ]) {
      expect(() => listFilesDirectoryRequestSchema.parse(input)).toThrow()
    }
  })

  it('requires document reads and writes to use non-empty context-relative file paths', () => {
    expect(
      openFilesDocumentRequestSchema.parse({ sessionId: 'session-1', relativePath: ' README ' })
    ).toEqual({ sessionId: 'session-1', relativePath: ' README ' })
    expect(
      saveFilesDocumentRequestSchema.parse({
        sessionId: 'session-1',
        relativePath: ' README ',
        content: 'updated',
        expectedRevision: 'revision-1'
      })
    ).toEqual({
      sessionId: 'session-1',
      relativePath: ' README ',
      content: 'updated',
      expectedRevision: 'revision-1'
    })

    for (const input of [
      { sessionId: 'session-1', relativePath: '' },
      { sessionId: 'session-1', relativePath: '../outside' },
      { sessionId: 'session-1', relativePath: '.git/config' },
      { sessionId: 'session-1', relativePath: 'src/./file.txt' },
      { sessionId: 'session-1', relativePath: 'src//file.txt' },
      { sessionId: 'session-1', relativePath: 'src/file.txt', rootPath: '/arbitrary' }
    ]) {
      expect(() => openFilesDocumentRequestSchema.parse(input)).toThrow()
    }

    expect(() =>
      saveFilesDocumentRequestSchema.parse({
        sessionId: 'session-1',
        relativePath: 'README',
        content: 'x'.repeat(2 * 1024 * 1024 + 1),
        expectedRevision: 'revision-1'
      })
    ).toThrow()
  })
})
