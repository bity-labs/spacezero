import { readFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openFilesDocument, saveFilesDocument } from './files-document.adapter'

const MAX_TEXT_BYTES = 2 * 1024 * 1024

describe('Files document adapter', () => {
  let rootPath: string

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'spacezero-files-document-'))
  })

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true })
  })

  it('opens any valid UTF-8 regular file within the text size limit as editable text', async () => {
    await writeFile(join(rootPath, 'unknown.ext'), 'hello\nworld\n')

    await expect(openFilesDocument(rootPath, 'unknown.ext')).resolves.toMatchObject({
      name: 'unknown.ext',
      relativePath: 'unknown.ext',
      contentKind: 'text',
      content: 'hello\nworld\n',
      lineEnding: 'lf',
      hasBom: false
    })
  })

  it('returns bounded metadata for binary and oversized files without decoding them into text', async () => {
    await writeFile(join(rootPath, 'binary.dat'), Buffer.from([0x48, 0x00, 0x49]))
    await writeFile(join(rootPath, 'large.txt'), Buffer.alloc(MAX_TEXT_BYTES + 1, 0x61))

    const binary = await openFilesDocument(rootPath, 'binary.dat')
    expect(binary).toMatchObject({
      name: 'binary.dat',
      relativePath: 'binary.dat',
      contentKind: 'binary'
    })
    expect(binary).not.toHaveProperty('content')
    const oversized = await openFilesDocument(rootPath, 'large.txt')
    expect(oversized).toMatchObject({
      name: 'large.txt',
      relativePath: 'large.txt',
      contentKind: 'oversized'
    })
    expect(oversized).not.toHaveProperty('content')
  })

  it('preserves an existing UTF-8 BOM and CRLF convention on save', async () => {
    await writeFile(join(rootPath, 'note.txt'), Buffer.from('\uFEFFfirst\r\nsecond\r\n', 'utf8'))
    const opened = await openFilesDocument(rootPath, 'note.txt')
    expect(opened).toMatchObject({
      contentKind: 'text',
      content: 'first\r\nsecond\r\n',
      hasBom: true,
      lineEnding: 'crlf'
    })

    const result = await saveFilesDocument(rootPath, {
      relativePath: 'note.txt',
      content: 'changed\nagain\n',
      expectedRevision: opened.revision
    })

    expect(result.status).toBe('saved')
    await expect(readFile(join(rootPath, 'note.txt'))).resolves.toEqual(
      Buffer.from('\uFEFFchanged\r\nagain\r\n', 'utf8')
    )
  })

  it('rejects saves that would exceed the text size limit without overwriting the file', async () => {
    await writeFile(join(rootPath, 'limit.txt'), Buffer.from('\uFEFFsmall', 'utf8'))
    const opened = await openFilesDocument(rootPath, 'limit.txt')

    await expect(
      saveFilesDocument(rootPath, {
        relativePath: 'limit.txt',
        content: 'a'.repeat(MAX_TEXT_BYTES),
        expectedRevision: opened.revision
      })
    ).rejects.toThrow('files.contentTooLarge')
    await expect(readFile(join(rootPath, 'limit.txt'))).resolves.toEqual(
      Buffer.from('\uFEFFsmall', 'utf8')
    )
  })

  it('treats whitespace-bearing relative paths as distinct filenames', async () => {
    await writeFile(join(rootPath, 'note.txt'), 'plain')
    await writeFile(join(rootPath, ' note.txt '), 'spaced')

    await expect(openFilesDocument(rootPath, ' note.txt ')).resolves.toMatchObject({
      name: ' note.txt ',
      relativePath: ' note.txt ',
      contentKind: 'text',
      content: 'spaced'
    })
  })

  it('does not leak the absolute root path through filesystem errors', async () => {
    await expect(openFilesDocument(rootPath, 'missing.txt')).rejects.toThrow('files.notFound')
    await expect(openFilesDocument(rootPath, 'missing.txt')).rejects.not.toThrow(rootPath)
  })

  it('lets only one concurrent optimistic save with the same revision succeed', async () => {
    await writeFile(join(rootPath, 'race.txt'), 'original')
    const opened = await openFilesDocument(rootPath, 'race.txt')
    if (opened.contentKind !== 'text') throw new Error('expected text fixture')

    const results = await Promise.all([
      saveFilesDocument(rootPath, {
        relativePath: 'race.txt',
        content: 'first',
        expectedRevision: opened.revision
      }),
      saveFilesDocument(rootPath, {
        relativePath: 'race.txt',
        content: 'second',
        expectedRevision: opened.revision
      })
    ])

    expect(results.map((result) => result.status).sort()).toEqual(['conflict', 'saved'])
    const savedResult = results.find((result) => result.status === 'saved')
    await expect(readFile(join(rootPath, 'race.txt'), 'utf8')).resolves.toBe(
      savedResult?.status === 'saved' ? savedResult.document.content : undefined
    )
  })

  it('leaves a file unchanged when the expected revision is stale', async () => {
    await writeFile(join(rootPath, 'conflict.txt'), 'original\n')
    const opened = await openFilesDocument(rootPath, 'conflict.txt')
    await writeFile(join(rootPath, 'conflict.txt'), 'external\n')

    const result = await saveFilesDocument(rootPath, {
      relativePath: 'conflict.txt',
      content: 'draft\n',
      expectedRevision: opened.revision
    })

    expect(result).toMatchObject({ status: 'conflict' })
    await expect(readFile(join(rootPath, 'conflict.txt'), 'utf8')).resolves.toBe('external\n')
  })

  it('validates relative path shape, Git protection, regular-file type, and symlink components', async () => {
    await mkdir(join(rootPath, 'folder', 'nested'), { recursive: true })
    await writeFile(join(rootPath, 'folder', 'nested', 'file.txt'), 'ok')
    await symlink(join(rootPath, 'folder'), join(rootPath, 'linked-folder'))

    for (const relativePath of [
      '',
      '../outside.txt',
      '/tmp/file.txt',
      'folder\\file.txt',
      '.git/config',
      'folder',
      'linked-folder/nested/file.txt'
    ]) {
      await expect(openFilesDocument(rootPath, relativePath)).rejects.toThrow(/^files\./)
    }
  })
})
