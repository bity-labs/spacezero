import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import { readFilesGitStatus } from './files-git-status.adapter'

const execFileAsync = promisify(execFile)
const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('Files Git status adapter', () => {
  it('collects read-only row signal statuses from Git porcelain without mutating repository state', async () => {
    const root = await createRepository('spacezero-files-git-status-')
    await writeFile(join(root, 'README.md'), '# Test\n\nmodified\n')
    await writeFile(join(root, 'staged.md'), 'staged\n')
    await git(root, ['add', 'staged.md'])
    await mkdir(join(root, 'notes'), { recursive: true })
    await writeFile(join(root, 'notes', 'today.md'), 'untracked\n')
    await git(root, ['mv', 'tracked.txt', 'renamed.txt'])
    await rm(join(root, 'delete-me.txt'))

    const before = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])

    await expect(readFilesGitStatus(root)).resolves.toEqual(
      expect.arrayContaining([
        { path: 'README.md', status: 'modified' },
        { path: 'delete-me.txt', status: 'deleted' },
        { path: 'renamed.txt', status: 'renamed' },
        { path: 'staged.md', status: 'added' },
        { path: 'notes/today.md', status: 'untracked' }
      ])
    )
    await expect(readFilesGitStatus(root)).resolves.toHaveLength(5)
    await expect(
      git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    ).resolves.toBe(before)
  })

  it('does not refresh the Git index or leave an index lock while collecting decorations', async () => {
    const root = await createRepository('spacezero-files-git-status-index-')
    await writeFile(join(root, 'README.md'), '# Test\n\nmodified\n')
    const indexPath = await resolveGitPath(root, 'index')
    const indexLockPath = await resolveGitPath(root, 'index.lock')
    const beforeIndexMtime = await fileMtimeNs(indexPath)

    await expect(readFilesGitStatus(root)).resolves.toEqual([
      { path: 'README.md', status: 'modified' }
    ])

    await expect(fileMtimeNs(indexPath)).resolves.toBe(beforeIndexMtime)
    await expectPathNotExists(indexLockPath)
  })

  it('returns no decorations when the active Files root is not a Git worktree', async () => {
    const root = await createTempDir('spacezero-files-no-git-status-')
    await writeFile(join(root, 'README.md'), '# Not git\n')

    await expect(readFilesGitStatus(root)).resolves.toEqual([])
  })
})

async function createRepository(prefix: string): Promise<string> {
  const root = await createTempDir(prefix)
  await git(root, ['init', '-b', 'main'])
  await git(root, ['config', 'user.name', 'Space Zero Test'])
  await git(root, ['config', 'user.email', 'test@spacezero.dev'])
  await writeFile(join(root, 'README.md'), '# Test\n')
  await writeFile(join(root, 'tracked.txt'), 'tracked\n')
  await writeFile(join(root, 'delete-me.txt'), 'delete me\n')
  await git(root, ['add', 'README.md', 'tracked.txt', 'delete-me.txt'])
  await git(root, ['commit', '-m', 'initial'])
  return root
}

async function createTempDir(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  temporaryPaths.push(path)
  return path
}

async function resolveGitPath(cwd: string, path: string): Promise<string> {
  const gitPath = (await git(cwd, ['rev-parse', '--git-path', path])).trim()
  return resolve(cwd, gitPath)
}

async function fileMtimeNs(path: string): Promise<bigint> {
  const stats = await stat(path, { bigint: true })
  return stats.mtimeNs
}

async function expectPathNotExists(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8' })
  return stdout
}
