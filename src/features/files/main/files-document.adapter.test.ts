import { readFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openFilesDocument, saveFilesDocument } from './files-document.adapter'

const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

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

  it.each([
    ['png', pngBytes, 'image/png'],
    ['jpg', Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'],
    ['gif', Buffer.from('GIF89a', 'ascii'), 'image/gif'],
    ['webp', Buffer.concat([Buffer.from('RIFFxxxxWEBP', 'ascii'), Buffer.from([0x00])]), 'image/webp']
  ] as const)('previews supported %s images by verified content signature', async (extension, bytes, mediaType) => {
    await writeFile(join(rootPath, `spoofed-${extension}.txt`), bytes)

    const image = await openFilesDocument(rootPath, `spoofed-${extension}.txt`)
    expect(image).toMatchObject({
      name: `spoofed-${extension}.txt`,
      relativePath: `spoofed-${extension}.txt`,
      contentKind: 'image',
      classification: 'image',
      mediaType,
      dataUrl: `data:${mediaType};base64,${bytes.toString('base64')}`
    })
    expect(image).not.toHaveProperty('content')
  })

  it('does not trust a supported image extension when the content signature is spoofed', async () => {
    await writeFile(join(rootPath, 'not-really.png'), 'plain text')

    await expect(openFilesDocument(rootPath, 'not-really.png')).resolves.toMatchObject({
      contentKind: 'text',
      content: 'plain text'
    })
  })

  it('keeps SVG routed as editable UTF-8 text instead of a trusted rendered image', async () => {
    await writeFile(join(rootPath, 'vector.svg'), '<svg><script>alert(1)</script></svg>')

    await expect(openFilesDocument(rootPath, 'vector.svg')).resolves.toMatchObject({
      name: 'vector.svg',
      contentKind: 'text',
      content: '<svg><script>alert(1)</script></svg>'
    })
  })

  it('returns bounded metadata for binary and oversized files without decoding them into text or images', async () => {
    await writeFile(join(rootPath, 'binary.dat'), Buffer.from([0x48, 0x00, 0x49]))
    await writeFile(join(rootPath, 'large.txt'), Buffer.alloc(MAX_TEXT_BYTES + 1, 0x61))
    await writeFile(
      join(rootPath, 'large-binary.dat'),
      Buffer.concat([Buffer.alloc(MAX_TEXT_BYTES + 1, 0x61), Buffer.from([0x00])])
    )
    await writeFile(
      join(rootPath, 'large.png'),
      Buffer.concat([pngBytes, Buffer.alloc(MAX_IMAGE_BYTES + 1 - pngBytes.byteLength, 0x00)])
    )

    const binary = await openFilesDocument(rootPath, 'binary.dat')
    expect(binary).toMatchObject({
      name: 'binary.dat',
      relativePath: 'binary.dat',
      contentKind: 'binary',
      classification: 'binary'
    })
    expect(binary).not.toHaveProperty('content')
    expect(binary).not.toHaveProperty('dataUrl')
    const oversized = await openFilesDocument(rootPath, 'large.txt')
    expect(oversized).toMatchObject({
      name: 'large.txt',
      relativePath: 'large.txt',
      contentKind: 'oversized',
      classification: 'oversized-text'
    })
    expect(oversized).not.toHaveProperty('content')
    expect(oversized).not.toHaveProperty('dataUrl')
    const largeBinary = await openFilesDocument(rootPath, 'large-binary.dat')
    expect(largeBinary).toMatchObject({
      name: 'large-binary.dat',
      relativePath: 'large-binary.dat',
      contentKind: 'binary',
      classification: 'binary'
    })
    expect(largeBinary).not.toHaveProperty('content')
    expect(largeBinary).not.toHaveProperty('dataUrl')
    const oversizedImage = await openFilesDocument(rootPath, 'large.png')
    expect(oversizedImage).toMatchObject({
      name: 'large.png',
      relativePath: 'large.png',
      contentKind: 'oversized',
      classification: 'oversized-image'
    })
    expect(oversizedImage).not.toHaveProperty('content')
    expect(oversizedImage).not.toHaveProperty('dataUrl')
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
