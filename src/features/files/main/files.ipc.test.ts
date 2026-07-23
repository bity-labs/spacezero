import { describe, expect, it, vi } from 'vitest'

import {
  createListFilesDirectoryHandler,
  createOpenFilesDocumentHandler,
  createSaveFilesDocumentHandler
} from './files.ipc'

describe('Files IPC', () => {
  it('validates renderer input before listing a Session directory', async () => {
    const listDirectory = vi.fn(async () => [])
    const handle = createListFilesDirectoryHandler({ listDirectory })

    await expect(handle({ sessionId: 'session-1', relativePath: 'src' })).resolves.toEqual([])
    expect(listDirectory).toHaveBeenCalledWith({ sessionId: 'session-1', relativePath: 'src' })

    await expect(
      handle({ sessionId: 'session-1', relativePath: '../outside', rootPath: '/tmp' })
    ).rejects.toThrow()
    expect(listDirectory).toHaveBeenCalledTimes(1)
  })

  it('validates renderer input before opening or saving a Session document', async () => {
    const document = {
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text' as const,
      size: 5,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: 'hello',
      hasBom: false,
      lineEnding: 'lf' as const
    }
    const openDocument = vi.fn(async () => document)
    const saveDocument = vi.fn(async () => ({ status: 'saved' as const, document }))

    await expect(
      createOpenFilesDocumentHandler({ openDocument })({
        sessionId: 'session-1',
        relativePath: 'README.md'
      })
    ).resolves.toEqual(document)
    await expect(
      createSaveFilesDocumentHandler({ saveDocument })({
        sessionId: 'session-1',
        relativePath: 'README.md',
        content: 'hello again',
        expectedRevision: 'revision-1'
      })
    ).resolves.toMatchObject({ status: 'saved' })

    await expect(
      createOpenFilesDocumentHandler({ openDocument })({
        sessionId: 'session-1',
        relativePath: '.git/config',
        rootPath: '/tmp'
      })
    ).rejects.toThrow()
    await expect(
      createSaveFilesDocumentHandler({ saveDocument })({
        sessionId: 'session-1',
        relativePath: 'README.md',
        content: 'hello',
        expectedRevision: ''
      })
    ).rejects.toThrow()
    expect(openDocument).toHaveBeenCalledTimes(1)
    expect(saveDocument).toHaveBeenCalledTimes(1)
  })
})
