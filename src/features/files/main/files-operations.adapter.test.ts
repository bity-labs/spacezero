import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
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

  it('rechecks create containment at the mutation seam and refuses exclusive collisions', async () => {
    await createFilesEntry(rootPath, { relativePath: 'safe', kind: 'folder' })
    const outsidePath = await mkdtemp(join(tmpdir(), 'spacezero-files-ops-outside-'))

    await expect(
      createFilesEntry(
        rootPath,
        { relativePath: 'safe/new.txt', kind: 'file' },
        {
          beforeCreateMutation: async () => {
            await rm(join(rootPath, 'safe'), { recursive: true })
            await symlink(outsidePath, join(rootPath, 'safe'))
          }
        }
      )
    ).rejects.toThrow('files.symlinkTraversalDenied')

    await expect(readFile(join(outsidePath, 'new.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })

    await createFilesEntry(rootPath, { relativePath: 'collision-parent', kind: 'folder' })
    await expect(
      createFilesEntry(
        rootPath,
        { relativePath: 'collision-parent/new.txt', kind: 'file' },
        {
          beforeCreateMutation: async () => {
            await writeFile(join(rootPath, 'collision-parent/new.txt'), 'external')
          }
        }
      )
    ).rejects.toThrow('files.collision')
    await expect(readFile(join(rootPath, 'collision-parent/new.txt'), 'utf8')).resolves.toBe(
      'external'
    )
  })

  it('rechecks move containment, source symlinks, and collisions at mutation seams without overwriting', async () => {
    await createFilesEntry(rootPath, { relativePath: 'src', kind: 'folder' })
    await writeFile(join(rootPath, 'src/app.ts'), 'source')
    await createFilesEntry(rootPath, { relativePath: 'dest', kind: 'folder' })
    const outsidePath = await mkdtemp(join(tmpdir(), 'spacezero-files-ops-outside-'))

    await expect(
      moveFilesEntry(
        rootPath,
        { sourcePath: 'src/app.ts', destinationPath: 'dest/app.ts' },
        {
          beforeMoveMutation: async () => {
            await rm(join(rootPath, 'src/app.ts'))
            await symlink(join(rootPath, 'target.txt'), join(rootPath, 'src/app.ts'))
          }
        }
      )
    ).rejects.toThrow('files.symlinkOperationDenied')
    await expect(readFile(join(rootPath, 'target.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await rm(join(rootPath, 'src/app.ts'))
    await writeFile(join(rootPath, 'src/app.ts'), 'source')

    await expect(
      moveFilesEntry(
        rootPath,
        { sourcePath: 'src/app.ts', destinationPath: 'dest/app.ts' },
        {
          beforeMoveMutation: async () => {
            await rm(join(rootPath, 'dest'), { recursive: true })
            await symlink(outsidePath, join(rootPath, 'dest'))
          }
        }
      )
    ).rejects.toThrow('files.symlinkTraversalDenied')
    await expect(readFile(join(rootPath, 'src/app.ts'), 'utf8')).resolves.toBe('source')
    await expect(readFile(join(outsidePath, 'app.ts'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })

    await rm(join(rootPath, 'dest'))
    await mkdir(join(rootPath, 'dest'))
    await expect(
      moveFilesEntry(
        rootPath,
        { sourcePath: 'src/app.ts', destinationPath: 'dest/app.ts' },
        {
          beforeMoveMutation: async () => {
            await writeFile(join(rootPath, 'dest/app.ts'), 'external')
          }
        }
      )
    ).rejects.toThrow('files.collision')
    await expect(readFile(join(rootPath, 'src/app.ts'), 'utf8')).resolves.toBe('source')
    await expect(readFile(join(rootPath, 'dest/app.ts'), 'utf8')).resolves.toBe('external')

    await rm(join(rootPath, 'dest/app.ts'))
    await expect(
      moveFilesEntry(
        rootPath,
        { sourcePath: 'src/app.ts', destinationPath: 'dest/app.ts' },
        {
          beforeMoveFilesystemMutation: async () => {
            await writeFile(join(rootPath, 'dest/app.ts'), 'external')
          }
        }
      )
    ).rejects.toThrow('files.collision')
    await expect(readFile(join(rootPath, 'src/app.ts'), 'utf8')).resolves.toBe('source')
    await expect(readFile(join(rootPath, 'dest/app.ts'), 'utf8')).resolves.toBe('external')
  })

  it('rolls directory moves back when a child cannot move safely', async () => {
    await mkdir(join(rootPath, 'src'))
    await writeFile(join(rootPath, 'src/keep.txt'), 'keep')
    await symlink(join(rootPath, 'keep.txt'), join(rootPath, 'src/link.txt'))

    await expect(
      moveFilesEntry(rootPath, { sourcePath: 'src', destinationPath: 'renamed' })
    ).rejects.toThrow('files.symlinkOperationDenied')
    await expect(readFile(join(rootPath, 'src/keep.txt'), 'utf8')).resolves.toBe('keep')
    await expect(readFile(join(rootPath, 'renamed/keep.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('rejects Windows .git aliases and alternate stream path syntax before mutation', async () => {
    for (const relativePath of ['.git./config', '.git /config', 'folder/.git./config']) {
      await expect(createFilesEntry(rootPath, { relativePath, kind: 'file' })).rejects.toThrow(
        'files.gitProtected'
      )
    }
    await expect(
      createFilesEntry(rootPath, { relativePath: 'notes:ads.txt', kind: 'file' })
    ).rejects.toThrow('files.invalidPath')
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
