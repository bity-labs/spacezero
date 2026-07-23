import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  createListFilesDirectoryHandler,
  createOpenFilesDocumentHandler,
  createSaveFilesDocumentHandler
} from './files.ipc'
import { openFilesDocument } from './files-document.adapter'

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

  it('does not expose absolute adapter paths in IPC-visible document errors', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'spacezero-files-ipc-'))
    try {
      const handle = createOpenFilesDocumentHandler({
        openDocument: ({ relativePath }) => openFilesDocument(rootPath, relativePath)
      })

      await expect(handle({ sessionId: 'session-1', relativePath: 'missing.txt' })).rejects.toThrow(
        'files.notFound'
      )
      await expect(
        handle({ sessionId: 'session-1', relativePath: 'missing.txt' })
      ).rejects.not.toThrow(rootPath)
    } finally {
      await rm(rootPath, { recursive: true, force: true })
    }
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
