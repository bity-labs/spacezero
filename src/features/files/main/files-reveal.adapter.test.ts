import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { revealFilesEntry } from './files-reveal.adapter'

describe('Files Reveal adapter', () => {
  let rootPath: string
  const nativeOperations = { revealInFolder: vi.fn() }

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'spacezero-files-reveal-'))
    nativeOperations.revealInFolder.mockReset()
  })

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true })
  })

  it('reveals regular files and symlink entries resolved from the context root and relative path', async () => {
    await mkdir(join(rootPath, 'folder'), { recursive: true })
    await writeFile(join(rootPath, 'folder', 'file.txt'), 'ok')
    await symlink(join(rootPath, 'folder', 'file.txt'), join(rootPath, 'link.txt'))

    await revealFilesEntry(rootPath, 'folder/file.txt', nativeOperations)
    await revealFilesEntry(rootPath, 'link.txt', nativeOperations)

    const canonicalRoot = await realpath(rootPath)
    expect(nativeOperations.revealInFolder).toHaveBeenCalledWith(
      join(canonicalRoot, 'folder', 'file.txt')
    )
    expect(nativeOperations.revealInFolder).toHaveBeenCalledWith(join(canonicalRoot, 'link.txt'))
  })

  it('denies arbitrary absolute paths, traversal, Git internals, missing entries, and symlink traversal', async () => {
    await mkdir(join(rootPath, 'folder'), { recursive: true })
    await writeFile(join(rootPath, 'folder', 'file.txt'), 'ok')
    await symlink(join(rootPath, 'folder'), join(rootPath, 'linked-folder'))

    for (const relativePath of [
      '/tmp/file.txt',
      '../outside.txt',
      '.git/config',
      'missing.txt',
      'linked-folder/file.txt'
    ]) {
      await expect(revealFilesEntry(rootPath, relativePath, nativeOperations)).rejects.toThrow(/^files\./)
    }
    expect(nativeOperations.revealInFolder).not.toHaveBeenCalled()
  })
})
