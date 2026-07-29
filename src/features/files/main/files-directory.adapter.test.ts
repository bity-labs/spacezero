import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readFilesDirectory, readFilesTree } from './files-directory.adapter'

describe('Files directory adapter', () => {
  let rootPath: string

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'spacezero-files-'))
  })

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true })
  })

  it('lists one level with folders first, natural case-insensitive ordering, and Git internals hidden', async () => {
    await mkdir(join(rootPath, '.git'))
    try {
      await mkdir(join(rootPath, '.GIT'))
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error
    }
    await Promise.all([
      mkdir(join(rootPath, 'folder10')),
      mkdir(join(rootPath, 'Folder2')),
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

  it('lists a full presorted tree without following symbolic links or exposing Git internals', async () => {
    await mkdir(join(rootPath, '.git', 'objects'), { recursive: true })
    await mkdir(join(rootPath, 'src', 'components'), { recursive: true })
    await mkdir(join(rootPath, 'empty'))
    await writeFile(join(rootPath, 'README.md'), '')
    await writeFile(join(rootPath, 'src', 'index.ts'), '')
    await writeFile(join(rootPath, 'src', 'components', 'button.tsx'), '')
    await symlink(join(rootPath, 'src'), join(rootPath, 'linked-src'))

    await expect(readFilesTree(rootPath)).resolves.toEqual({
      entries: [
        { name: 'empty', relativePath: 'empty', kind: 'directory' },
        { name: 'src', relativePath: 'src', kind: 'directory' },
        { name: 'components', relativePath: 'src/components', kind: 'directory' },
        { name: 'button.tsx', relativePath: 'src/components/button.tsx', kind: 'file' },
        { name: 'index.ts', relativePath: 'src/index.ts', kind: 'file' },
        { name: 'linked-src', relativePath: 'linked-src', kind: 'symlink' },
        { name: 'README.md', relativePath: 'README.md', kind: 'file' }
      ],
      presortedPaths: [
        'empty/',
        'src/',
        'src/components/',
        'src/components/button.tsx',
        'src/index.ts',
        'linked-src',
        'README.md'
      ]
    })
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

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}
