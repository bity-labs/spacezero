import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readFilesDirectory } from './files-directory.adapter'

describe('Files directory adapter', () => {
  let rootPath: string

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'spacezero-files-'))
  })

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true })
  })

  it('lists one level with folders first, natural case-insensitive ordering, and Git internals hidden', async () => {
    await Promise.all([
      mkdir(join(rootPath, 'folder10')),
      mkdir(join(rootPath, 'Folder2')),
      mkdir(join(rootPath, '.git')),
      mkdir(join(rootPath, '.GIT')),
      writeFile(join(rootPath, 'file10.ts'), ''),
      writeFile(join(rootPath, 'File2.ts'), ''),
      writeFile(join(rootPath, '.env'), ''),
      writeFile(join(rootPath, '.gitignore'), 'ignored.txt\n'),
      writeFile(join(rootPath, 'ignored.txt'), '')
    ])

    await expect(readFilesDirectory(rootPath, '')).resolves.toEqual([
      { name: 'Folder2', relativePath: 'Folder2', kind: 'directory' },
      { name: 'folder10', relativePath: 'folder10', kind: 'directory' },
      { name: '.env', relativePath: '.env', kind: 'file' },
      { name: '.gitignore', relativePath: '.gitignore', kind: 'file' },
      { name: 'File2.ts', relativePath: 'File2.ts', kind: 'file' },
      { name: 'file10.ts', relativePath: 'file10.ts', kind: 'file' },
      { name: 'ignored.txt', relativePath: 'ignored.txt', kind: 'file' }
    ])
  })

  it('identifies symbolic links without following or expanding them', async () => {
    await mkdir(join(rootPath, 'target', 'nested'), { recursive: true })
    await writeFile(join(rootPath, 'target', 'inside.txt'), '')
    await writeFile(join(rootPath, 'target', 'nested', 'inside.txt'), '')
    await symlink(join(rootPath, 'target'), join(rootPath, 'linked-folder'))

    await expect(readFilesDirectory(rootPath, '')).resolves.toContainEqual({
      name: 'linked-folder',
      relativePath: 'linked-folder',
      kind: 'symlink'
    })
    await expect(readFilesDirectory(rootPath, 'linked-folder')).rejects.toThrow(
      'files.symlinkTraversalDenied'
    )
    await expect(readFilesDirectory(rootPath, 'linked-folder/nested')).rejects.toThrow(
      'files.symlinkTraversalDenied'
    )
  })

  it('rejects traversal, absolute paths, backslashes, and every .git path', async () => {
    for (const relativePath of [
      '../outside',
      '/tmp',
      'folder\\child',
      '.git',
      '.GIT',
      'folder/.git'
    ]) {
      await expect(readFilesDirectory(rootPath, relativePath)).rejects.toThrow(/^files\./)
    }
  })

  it('reports a missing directory without fabricating entries', async () => {
    await expect(readFilesDirectory(rootPath, 'missing')).rejects.toThrow('files.directoryNotFound')
  })
})
