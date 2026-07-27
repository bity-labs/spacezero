import { mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFilesEntry, moveFilesEntry, trashFilesEntry } from './files-operations.adapter'

let rootPath: string

beforeEach(async () => {
  rootPath = await mkdtemp(join(tmpdir(), 'spacezero-files-ops-'))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Files operations adapter', () => {
  it('creates files and folders at validated relative paths and refuses collisions', async () => {
    await createFilesEntry(rootPath, { relativePath: 'notes', kind: 'folder' })
    await createFilesEntry(rootPath, { relativePath: 'notes/today.md', kind: 'file' })

    await expect(readFile(join(rootPath, 'notes/today.md'), 'utf8')).resolves.toBe('')
    await expect(
      createFilesEntry(rootPath, { relativePath: 'notes/today.md', kind: 'file' })
    ).rejects.toThrow('files.collision')
  })

  it('moves entries without overwriting and refuses traversal, .git, and directory self moves', async () => {
    await createFilesEntry(rootPath, { relativePath: 'src', kind: 'folder' })
    await createFilesEntry(rootPath, { relativePath: 'src/app.ts', kind: 'file' })
    await createFilesEntry(rootPath, { relativePath: 'existing.ts', kind: 'file' })

    await expect(
      moveFilesEntry(rootPath, { sourcePath: 'src/app.ts', destinationPath: 'existing.ts' })
    ).rejects.toThrow('files.collision')
    await expect(
      moveFilesEntry(rootPath, { sourcePath: 'src/app.ts', destinationPath: '../outside.ts' })
    ).rejects.toThrow('files.invalidPath')
    await expect(
      moveFilesEntry(rootPath, { sourcePath: 'src/app.ts', destinationPath: '.git/config' })
    ).rejects.toThrow('files.gitProtected')
    await expect(
      moveFilesEntry(rootPath, { sourcePath: 'src', destinationPath: 'src/nested' })
    ).rejects.toThrow('files.directoryMoveIntoSelf')

    await moveFilesEntry(rootPath, { sourcePath: 'src/app.ts', destinationPath: 'src/main.ts' })
    await expect(readFile(join(rootPath, 'src/main.ts'), 'utf8')).resolves.toBe('')
  })

  it('refuses symlink create parents, move sources, and trash sources while reveal remains separate', async () => {
    await writeFile(join(rootPath, 'target.txt'), 'target')
    await symlink(join(rootPath, 'target.txt'), join(rootPath, 'link.txt'))
    await symlink(rootPath, join(rootPath, 'link-dir'))

    await expect(
      createFilesEntry(rootPath, { relativePath: 'link-dir/new.txt', kind: 'file' })
    ).rejects.toThrow('files.symlinkTraversalDenied')
    await expect(
      moveFilesEntry(rootPath, { sourcePath: 'link.txt', destinationPath: 'renamed-link.txt' })
    ).rejects.toThrow('files.symlinkOperationDenied')
    await expect(
      trashFilesEntry(rootPath, { relativePath: 'link.txt' }, { trashItem: vi.fn() })
    ).rejects.toThrow('files.symlinkOperationDenied')
  })

  it('uses operating-system Trash and does not delete permanently when Trash fails', async () => {
    await writeFile(join(rootPath, 'trash-me.txt'), 'keep')
    const trashItem = vi.fn(async () => {
      throw new Error('native trash failed')
    })

    await expect(
      trashFilesEntry(rootPath, { relativePath: 'trash-me.txt' }, { trashItem })
    ).rejects.toThrow('files.trashFailed')

    expect(trashItem).toHaveBeenCalledWith(await realpath(join(rootPath, 'trash-me.txt')))
    await expect(readFile(join(rootPath, 'trash-me.txt'), 'utf8')).resolves.toBe('keep')
  })
})
