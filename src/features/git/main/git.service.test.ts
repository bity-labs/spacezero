import { execFile } from 'node:child_process'
import { watch } from 'node:fs'
import type { Stats } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ManagedWorktreeService } from '../../sessions/main/managed-worktree.service'
import type { SessionsRepository, StoredSession } from '../../sessions/main/sessions.service'
import { createGitService } from './git.service'

const execFileAsync = promisify(execFile)
const temporaryPaths: string[] = []

const now = new Date('2026-07-25T00:00:00.000Z')

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('GitService', () => {
  it('reads Project Home changes from the main-owned registered project root, never a prior worktree', async () => {
    const root = await createTempDir('spacezero-git-project-home-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await writeFile(join(base, 'README.md'), '# Base checkout change\n')
    await writeFile(join(worktree, 'worktree-only.md'), 'must not appear\n')
    const validate = vi.fn(async () => true)
    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(validate)
    })

    const review = await service.getReview({ kind: 'project-home', projectId: 'project-1' })

    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    expect(review.files.map((file) => file.path)).toEqual(['README.md'])
    expect(review.files.map((file) => file.path)).not.toContain('worktree-only.md')
    expect(validate).not.toHaveBeenCalled()
  })

  it('rejects an unavailable Project Home identity without running Git', async () => {
    const runGit = vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 }))
    const sessionsRepository = createSessionsRepository({
      projectPath: '/project',
      worktreePath: '/worktree'
    })
    sessionsRepository.findProjectById = vi.fn(async () => undefined)
    const service = createGitService({
      sessionsRepository,
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true),
      runGit
    })

    await expect(
      service.getReview({ kind: 'project-home', projectId: 'missing-project' })
    ).resolves.toEqual({
      status: 'inaccessible',
      message: 'Project Home is unavailable.'
    })
    expect(runGit).not.toHaveBeenCalled()
  })

  it('authenticates the Project Session managed worktree and returns branch state plus text diffs', async () => {
    const root = await createTempDir('spacezero-git-review-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await writeFile(join(worktree, 'README.md'), '# Test\n\nChanged\n')
    await writeFile(join(worktree, 'new-note.md'), 'hello\n')

    const validateCalls: unknown[] = []
    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async (request) => {
        validateCalls.push(request)
        return request.worktree.path === worktree && request.projectPath === base
      })
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(validateCalls).toHaveLength(1)
    expect(review).toMatchObject({ status: 'ok', branch: 'spacezero/session-session-1' })
    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    expect(review.upstream).toEqual({ kind: 'none' })
    expect(review.files.map((file) => file.path)).toEqual(['new-note.md', 'README.md'])
    expect(review.files.find((file) => file.path === 'README.md')).toMatchObject({
      kind: 'modified',
      binary: false,
      large: false
    })
    expect(review.files.find((file) => file.path === 'README.md')?.diff).toContain('+Changed')
    expect(review.files.find((file) => file.path === 'new-note.md')).toMatchObject({
      kind: 'untracked',
      diff: expect.stringContaining('+hello')
    })
  })

  it('reads review state without refreshing the Git index', async () => {
    const root = await createTempDir('spacezero-git-review-index-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await writeFile(join(worktree, 'README.md'), '# Test\n\nmodified\n')
    const indexPath = (await git(['-C', worktree, 'rev-parse', '--git-path', 'index'])).trim()
    const beforeIndexMtime = (await stat(indexPath, { bigint: true })).mtimeNs

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    await expect(service.getProjectSessionReview('session-1')).resolves.toMatchObject({
      status: 'ok'
    })
    await expect(stat(indexPath, { bigint: true })).resolves.toMatchObject({
      mtimeNs: beforeIndexMtime
    })
  })

  it('defaults to uncommitted and returns staged, unstaged, and untracked changes since HEAD', async () => {
    const root = await createTempDir('spacezero-git-uncommitted-filter-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await writeFile(join(worktree, 'README.md'), '# Test\n\nstaged\nunstaged\n')
    await writeFile(join(worktree, 'staged-only.md'), 'staged file\n')
    await writeFile(join(worktree, 'untracked.md'), 'untracked file\n')
    await git(['-C', worktree, 'add', 'staged-only.md'])

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    expect(review.files.map((file) => file.path)).toEqual([
      'README.md',
      'staged-only.md',
      'untracked.md'
    ])
    expect(review.files.find((file) => file.path === 'README.md')?.diff).toContain('+unstaged')
    expect(review.files.find((file) => file.path === 'staged-only.md')).toMatchObject({
      kind: 'added'
    })
    expect(review.files.find((file) => file.path === 'untracked.md')).toMatchObject({
      kind: 'untracked'
    })
  })

  it('separates staged and unstaged patches for a partially staged file', async () => {
    const root = await createTempDir('spacezero-git-partial-filter-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await writeFile(join(worktree, 'README.md'), '# Test\n\nstaged line\n')
    await git(['-C', worktree, 'add', 'README.md'])
    await writeFile(join(worktree, 'README.md'), '# Test\n\nstaged line\nunstaged line\n')

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    const staged = await service.getProjectSessionReview('session-1', 'staged')
    const unstaged = await service.getProjectSessionReview('session-1', 'unstaged')

    expect(staged.status).toBe('ok')
    expect(unstaged.status).toBe('ok')
    if (staged.status !== 'ok' || unstaged.status !== 'ok') return
    expect(staged.files.map((file) => file.path)).toEqual(['README.md'])
    expect(unstaged.files.map((file) => file.path)).toEqual(['README.md'])
    expect(staged.files[0]).toMatchObject({
      kind: 'modified',
      diff: expect.stringContaining('+staged line')
    })
    expect(staged.files[0].diff).not.toContain('+unstaged line')
    expect(unstaged.files[0]).toMatchObject({
      kind: 'modified',
      diff: expect.stringContaining('+unstaged line')
    })
    expect(unstaged.files[0].diff).not.toContain('+staged line')
  })

  it('limits staged and unstaged filters to their matching changed files', async () => {
    const root = await createTempDir('spacezero-git-staged-unstaged-filter-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await writeFile(join(worktree, 'README.md'), '# Test\n\nworking tree only\n')
    await writeFile(join(worktree, 'staged-only.md'), 'staged file\n')
    await writeFile(join(worktree, 'untracked.md'), 'untracked file\n')
    await git(['-C', worktree, 'add', 'staged-only.md'])

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    const staged = await service.getProjectSessionReview('session-1', 'staged')
    const unstaged = await service.getProjectSessionReview('session-1', 'unstaged')

    expect(staged.status).toBe('ok')
    expect(unstaged.status).toBe('ok')
    if (staged.status !== 'ok' || unstaged.status !== 'ok') return
    expect(staged.files.map((file) => file.path)).toEqual(['staged-only.md'])
    expect(unstaged.files.map((file) => file.path)).toEqual(['README.md', 'untracked.md'])
  })

  it('reports an oversized tracked edit above the Git runner buffer as a bounded file summary', async () => {
    const root = await createTempDir('spacezero-git-runner-bounded-large-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await writeFile(join(base, 'large.txt'), `${'a'.repeat(700 * 1024)}\n`)
    await git(['-C', base, 'add', 'large.txt'])
    await git(['-C', base, 'commit', '-m', 'large fixture'])
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await writeFile(join(worktree, 'large.txt'), `${'b'.repeat(700 * 1024)}\n`)

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(review.status).toBe('ok')
    expect(Buffer.byteLength(JSON.stringify(review), 'utf8')).toBeLessThan(16 * 1024)
    if (review.status !== 'ok') return
    expect(review.files).toHaveLength(1)
    expect(review.files[0]).toMatchObject({
      path: 'large.txt',
      kind: 'modified',
      binary: false,
      large: true,
      diff: null
    })
  })

  it('omits canceled index and worktree changes from uncommitted while preserving staged and unstaged views', async () => {
    const root = await createTempDir('spacezero-git-cancelled-uncommitted-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await writeFile(join(worktree, 'cancelled.txt'), 'staged addition\n')
    await git(['-C', worktree, 'add', 'cancelled.txt'])
    await rm(join(worktree, 'cancelled.txt'))

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    const uncommitted = await service.getProjectSessionReview('session-1', 'uncommitted')
    const staged = await service.getProjectSessionReview('session-1', 'staged')
    const unstaged = await service.getProjectSessionReview('session-1', 'unstaged')

    expect(uncommitted).toMatchObject({ status: 'clean', files: [] })
    expect(staged.status).toBe('ok')
    expect(unstaged.status).toBe('ok')
    if (staged.status !== 'ok' || unstaged.status !== 'ok') return
    expect(staged.files).toHaveLength(1)
    expect(staged.files[0]).toMatchObject({
      path: 'cancelled.txt',
      kind: 'added',
      diff: expect.stringContaining('+staged addition')
    })
    expect(unstaged.files).toHaveLength(1)
    expect(unstaged.files[0]).toMatchObject({
      path: 'cancelled.txt',
      kind: 'deleted',
      diff: expect.stringContaining('-staged addition')
    })
  })

  it('preserves unresolved conflicts in uncommitted when the worktree matches HEAD', async () => {
    const root = await createTempDir('spacezero-git-conflict-head-worktree-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await writeFile(join(base, 'f.txt'), 'base\n')
    await git(['-C', base, 'add', 'f.txt'])
    await git(['-C', base, 'commit', '-m', 'add conflict fixture'])
    await git(['-C', base, 'checkout', '-b', 'other'])
    await writeFile(join(base, 'f.txt'), 'other\n')
    await git(['-C', base, 'commit', '-am', 'other change'])
    await git(['-C', base, 'checkout', 'main'])
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await writeFile(join(worktree, 'f.txt'), 'session\n')
    await git(['-C', worktree, 'commit', '-am', 'session change'])
    await git(['-C', worktree, 'merge', 'other'], true)
    await writeFile(join(worktree, 'f.txt'), await git(['-C', worktree, 'show', 'HEAD:f.txt']))

    expect(await git(['-C', worktree, 'status', '--porcelain=v1'])).toBe('UU f.txt\n')
    expect(
      await git([
        '-C',
        worktree,
        'diff',
        '--no-ext-diff',
        '--find-renames=1%',
        '--binary',
        'HEAD',
        '--',
        'f.txt'
      ])
    ).toBe('')

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    const review = await service.getProjectSessionReview('session-1', 'uncommitted')

    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    expect(review.files).toHaveLength(1)
    expect(review.files[0]).toMatchObject({ path: 'f.txt', kind: 'conflicted' })
  })

  it('reports deleted, binary, and excessively large changes as bounded summaries', async () => {
    const root = await createTempDir('spacezero-git-bounded-states-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await writeFile(join(base, 'delete-me.txt'), 'delete me\n')
    await writeFile(join(base, 'binary.bin'), Buffer.from([0, 1, 2, 3]))
    await writeFile(join(base, 'large.txt'), `${'a'.repeat(140 * 1024)}\n`)
    await git(['-C', base, 'add', 'delete-me.txt', 'binary.bin', 'large.txt'])
    await git(['-C', base, 'commit', '-m', 'fixtures'])
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await rm(join(worktree, 'delete-me.txt'))
    await writeFile(join(worktree, 'binary.bin'), Buffer.from([0, 1, 2, 3, 4]))
    await writeFile(join(worktree, 'large.txt'), `${'b'.repeat(140 * 1024)}\n`)

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    expect(review.files.find((file) => file.path === 'delete-me.txt')).toMatchObject({
      kind: 'deleted'
    })
    expect(review.files.find((file) => file.path === 'binary.bin')).toMatchObject({
      binary: true,
      diff: null
    })
    expect(review.files.find((file) => file.path === 'large.txt')).toMatchObject({
      large: true,
      diff: null
    })
  })

  it('returns conflicted files first with conflict state', async () => {
    const root = await createTempDir('spacezero-git-conflicts-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'checkout', '-b', 'other'])
    await writeFile(join(base, 'README.md'), '# Other\n')
    await git(['-C', base, 'commit', '-am', 'other change'])
    await git(['-C', base, 'checkout', 'main'])
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await writeFile(join(worktree, 'README.md'), '# Session\n')
    await git(['-C', worktree, 'commit', '-am', 'session change'])
    await git(['-C', worktree, 'merge', 'other'], true)
    await writeFile(join(worktree, 'z-after.txt'), 'after conflict\n')

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    expect(review.files[0]).toMatchObject({ path: 'README.md', kind: 'conflicted' })
  })

  it('returns nested untracked files individually with eligible text content', async () => {
    const root = await createTempDir('spacezero-git-nested-untracked-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await mkdir(join(worktree, 'new-dir'), { recursive: true })
    await writeFile(join(worktree, 'new-dir', 'note.txt'), 'nested note\n')

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    expect(review.files.map((file) => file.path)).toContain('new-dir/note.txt')
    expect(review.files.map((file) => file.path)).not.toContain('new-dir/')
    expect(review.files.find((file) => file.path === 'new-dir/note.txt')).toMatchObject({
      kind: 'untracked',
      diff: expect.stringContaining('+nested note')
    })
  })

  it('represents untracked symlinks without dereferencing external file content', async () => {
    const root = await createTempDir('spacezero-git-symlink-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    const secret = join(root, 'external-secret.txt')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await writeFile(secret, 'outside-worktree-secret\n')
    await symlink(secret, join(worktree, 'secret-link'))

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    const link = review.files.find((file) => file.path === 'secret-link')
    expect(link).toMatchObject({ kind: 'untracked', diff: null })
    expect(JSON.stringify(link)).not.toContain('outside-worktree-secret')
  })

  it('fails closed when an untracked file is swapped to an external symlink before content read', async () => {
    const root = await createTempDir('spacezero-git-symlink-race-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    const secret = join(root, 'external-secret.txt')
    const racedPath = join(worktree, 'race.txt')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await writeFile(secret, 'outside-worktree-race-secret\n')
    await writeFile(racedPath, 'safe initial content\n')

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true),
      fileSystem: {
        lstat,
        async open(path, flags) {
          if (path === racedPath) {
            await rm(racedPath)
            await symlink(secret, racedPath)
          }
          return open(path, flags)
        },
        realpath,
        watch
      }
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    const raced = review.files.find((file) => file.path === 'race.txt')
    expect(raced).toMatchObject({ kind: 'untracked', diff: null })
    expect(JSON.stringify(raced)).not.toContain('outside-worktree-race-secret')
  })

  it('fails closed when an untracked file parent is swapped to an external symlink before open', async () => {
    const root = await createTempDir('spacezero-git-parent-symlink-race-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    const external = join(root, 'external')
    const racedParent = join(worktree, 'new-dir')
    const racedPath = join(racedParent, 'note.txt')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await mkdir(racedParent, { recursive: true })
    await mkdir(external, { recursive: true })
    await writeFile(racedPath, 'safe initial content\n')
    await writeFile(join(external, 'note.txt'), 'outside-worktree-parent-race-secret\n')

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true),
      fileSystem: {
        lstat,
        async open(path, flags) {
          if (path === racedPath) {
            await rm(racedParent, { recursive: true, force: true })
            await symlink(external, racedParent)
          }
          return open(path, flags)
        },
        realpath,
        watch
      }
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    const raced = review.files.find((file) => file.path === 'new-dir/note.txt')
    expect(raced).toMatchObject({ kind: 'untracked', diff: null })
    expect(JSON.stringify(raced)).not.toContain('outside-worktree-parent-race-secret')
  })

  it('fails closed when a Windows canonical untracked path resolves on a different drive', async () => {
    const worktree = 'C:\\worktree'
    const target = 'C:\\worktree\\new-dir\\note.txt'
    const outside = 'D:\\outside\\note.txt'
    const secret = 'different-drive-secret\n'
    const regularFileStats = createStatsStub({ dev: 1, ino: 1, file: true, symbolicLink: false })
    let readAttempted = false

    const service = createGitService({
      sessionsRepository: createSessionsRepository({
        projectPath: 'C:\\project',
        worktreePath: worktree
      }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true),
      runGit: async ({ args }) => {
        if (args[0] === 'branch') return { stdout: 'feature\n', stderr: '', exitCode: 0 }
        if (args[0] === 'rev-parse') return { stdout: '', stderr: 'no upstream\n', exitCode: 128 }
        if (args[0] === 'status')
          return { stdout: '?? new-dir/note.txt\0', stderr: '', exitCode: 0 }
        return { stdout: '', stderr: '', exitCode: 0 }
      },
      fileSystem: {
        async lstat(path) {
          expect(path).toBe(target)
          return regularFileStats
        },
        async open(path) {
          expect(path).toBe(target)
          return {
            async stat() {
              return regularFileStats
            },
            async readFile() {
              readAttempted = true
              return Buffer.from(secret)
            },
            async close() {}
          } as Awaited<ReturnType<typeof open>>
        },
        async realpath(path) {
          if (path === worktree) return worktree
          if (path === target) return outside
          return path
        },
        watch
      },
      pathFlavor: win32
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    const raced = review.files.find((file) => file.path === 'new-dir/note.txt')
    expect(raced).toMatchObject({ kind: 'untracked', diff: null })
    expect(readAttempted).toBe(false)
    expect(JSON.stringify(raced)).not.toContain(secret.trim())
  })

  it('preserves old and new paths for a pure rename diff', async () => {
    const root = await createTempDir('spacezero-git-pure-rename-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await git(['-C', worktree, 'mv', 'README.md', 'README-renamed.md'])

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    const renamed = review.files.find((file) => file.path === 'README-renamed.md')
    expect(renamed).toMatchObject({ kind: 'renamed', oldPath: 'README.md' })
    expect(renamed?.diff).toContain('rename from README.md')
    expect(renamed?.diff).toContain('rename to README-renamed.md')
    expect(renamed?.diff).not.toContain('--- /dev/null')
  })

  it('preserves rename metadata and only real content edits for a modified rename diff', async () => {
    const root = await createTempDir('spacezero-git-modified-rename-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    await git(['-C', worktree, 'mv', 'README.md', 'README-renamed.md'])
    await writeFile(join(worktree, 'README-renamed.md'), '# Test\n\nRenamed edit\n')

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    const renamed = review.files.find((file) => file.path === 'README-renamed.md')
    expect(renamed).toMatchObject({ kind: 'renamed', oldPath: 'README.md' })
    expect(renamed?.diff).toContain('rename from README.md')
    expect(renamed?.diff).toContain('rename to README-renamed.md')
    expect(renamed?.diff).toContain('+Renamed edit')
    expect(renamed?.diff).not.toContain('--- /dev/null')
  })

  it('returns an explicit Git error when upstream count query fails', async () => {
    const service = createGitService({
      sessionsRepository: createSessionsRepository({
        projectPath: '/project',
        worktreePath: '/worktree'
      }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true),
      runGit: async ({ args }) => {
        if (args[0] === 'branch') return { stdout: 'feature\n', stderr: '', exitCode: 0 }
        if (args[0] === 'rev-parse') return { stdout: 'origin/feature\n', stderr: '', exitCode: 0 }
        if (args[0] === 'rev-list')
          return { stdout: '', stderr: 'rev-list failed\n', exitCode: 128 }
        if (args[0] === 'status') return { stdout: '', stderr: '', exitCode: 0 }
        return { stdout: '', stderr: '', exitCode: 0 }
      }
    })

    await expect(service.getProjectSessionReview('session-1')).resolves.toEqual({
      status: 'git-error',
      message: 'rev-list failed'
    })
  })

  it('returns a bounded explicit Git error when a required file diff query fails', async () => {
    const service = createGitService({
      sessionsRepository: createSessionsRepository({
        projectPath: '/project',
        worktreePath: '/worktree'
      }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true),
      runGit: async ({ args }) => {
        if (args[0] === 'branch') return { stdout: 'feature\n', stderr: '', exitCode: 0 }
        if (args[0] === 'rev-parse') return { stdout: '', stderr: 'no upstream\n', exitCode: 128 }
        if (args[0] === 'status') return { stdout: ' M README.md\0', stderr: '', exitCode: 0 }
        if (args[0] === 'diff')
          return { stdout: '', stderr: `${'diff failed '.repeat(1024)}\n`, exitCode: 128 }
        return { stdout: '', stderr: '', exitCode: 0 }
      }
    })

    const review = await service.getProjectSessionReview('session-1')

    expect(review.status).toBe('git-error')
    if (review.status !== 'git-error') return
    expect(Buffer.byteLength(review.message, 'utf8')).toBeLessThanOrEqual(4 * 1024)
    expect(review.message).toContain('diff failed')
  })

  it('does not query Git when the persisted worktree fails authentication', async () => {
    const root = await createTempDir('spacezero-git-denied-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => false)
    })

    await expect(service.getProjectSessionReview('session-1')).resolves.toEqual({
      status: 'inaccessible',
      message: 'The managed worktree could not be authenticated.'
    })
  })

  it('returns a missing-worktree state instead of falling back to the registered Project checkout', async () => {
    const root = await createTempDir('spacezero-git-missing-')
    const base = join(root, 'base')
    await createRepository(base)
    await writeFile(join(base, 'README.md'), '# Base checkout change\n')

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: null }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true)
    })

    await expect(service.getProjectSessionReview('session-1')).resolves.toEqual({
      status: 'missing-worktree',
      message: 'This Project Session has no managed worktree.'
    })
  })

  it('observes dependency-injected worktree and Git index events without mutating repository state', async () => {
    const root = await createTempDir('spacezero-git-observe-events-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    type WatchCallback = (eventType: string, filename: string | null) => void
    const callbacks = new Map<string, WatchCallback>()
    const closed: string[] = []
    const watchStub = vi.fn(
      (path: Parameters<typeof watch>[0], _options: unknown, listener?: WatchCallback) => {
        if (listener) callbacks.set(path.toString(), listener)
        return {
          close() {
            closed.push(path.toString())
          },
          on() {
            return this
          }
        } as unknown as ReturnType<typeof watch>
      }
    ) as unknown as typeof watch

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true),
      fileSystem: {
        lstat,
        open,
        realpath,
        watch: watchStub
      }
    })
    const events: Array<{ kind: 'repository-changed' } | { kind: 'watch-error'; message: string }> =
      []

    const close = await service.observeProjectSession('session-1', (event) => events.push(event))
    const observedGitDir = Array.from(callbacks.keys()).find((path) => path !== worktree)
    callbacks.get(worktree)?.('change', 'README.md')
    if (observedGitDir) callbacks.get(observedGitDir)?.('change', 'index')
    close()

    expect(callbacks.has(worktree)).toBe(true)
    expect(observedGitDir).toBeTruthy()
    expect(events).toEqual([{ kind: 'repository-changed' }, { kind: 'repository-changed' }])
    expect(closed).toEqual([worktree, observedGitDir])
    expect(await git(['-C', worktree, 'status', '--porcelain=v1'])).toBe('')
  })

  it('resolves Knowledge Base reviews through the verified root provider without a renderer-supplied path or managed-worktree validation', async () => {
    const root = await createTempDir('spacezero-git-kb-review-')
    await createRepository(root)
    await writeFile(join(root, 'kb.md'), 'knowledge change\n')
    const validate = vi.fn(async () => true)
    const getVerifiedRoot = vi.fn(async () => root)
    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: root, worktreePath: null }),
      managedWorktreeService: createManagedWorktreeServiceStub(validate),
      knowledgeBaseRootProvider: {
        getStatus: async () => ({ setupState: 'configured' as const, rootPath: root }),
        getVerifiedRoot,
        invalidate: vi.fn()
      }
    })

    const review = await service.getReview(
      { kind: 'knowledge-base', contextKey: 'knowledge-base' },
      'unstaged'
    )

    expect(getVerifiedRoot).toHaveBeenCalledTimes(1)
    expect(validate).not.toHaveBeenCalled()
    expect(review.status).toBe('ok')
    if (review.status !== 'ok') return
    expect(review.files.map((file) => file.path)).toEqual(['kb.md'])
    expect(review.files[0]?.diff).toContain('+knowledge change')
  })

  it('reports unavailable Knowledge Base roots without fabricating a Git repository', async () => {
    const validate = vi.fn(async () => true)
    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: '/unused', worktreePath: null }),
      managedWorktreeService: createManagedWorktreeServiceStub(validate),
      knowledgeBaseRootProvider: {
        getStatus: async () => ({ setupState: 'unconfigured' as const }),
        getVerifiedRoot: async () => {
          throw new Error('Knowledge Base is not configured.')
        },
        invalidate: vi.fn()
      }
    })

    const review = await service.getReview({ kind: 'knowledge-base', contextKey: 'knowledge-base' })

    expect(review).toEqual({
      status: 'inaccessible',
      message: 'Knowledge Base is not configured.'
    })
    expect(validate).not.toHaveBeenCalled()
  })

  it('surfaces bounded observe setup errors and closes any started watchers', async () => {
    const root = await createTempDir('spacezero-git-observe-setup-error-')
    const base = join(root, 'base')
    const worktree = join(root, 'worktree')
    await createRepository(base)
    await git(['-C', base, 'worktree', 'add', '-b', 'spacezero/session-session-1', worktree])
    const closed: string[] = []
    const watchStub = vi.fn((path: Parameters<typeof watch>[0]) => {
      if (path.toString() !== worktree) throw new Error(`${'watch failed '.repeat(1000)}`)
      return {
        close() {
          closed.push(path.toString())
        },
        on() {
          return this
        }
      } as unknown as ReturnType<typeof watch>
    }) as unknown as typeof watch

    const service = createGitService({
      sessionsRepository: createSessionsRepository({ projectPath: base, worktreePath: worktree }),
      managedWorktreeService: createManagedWorktreeServiceStub(async () => true),
      fileSystem: {
        lstat,
        open,
        realpath,
        watch: watchStub
      }
    })
    const events: Array<{ kind: 'repository-changed' } | { kind: 'watch-error'; message: string }> =
      []

    const close = await service.observeProjectSession('session-1', (event) => events.push(event))
    close()

    expect(closed).toEqual([worktree])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'watch-error' })
    expect(events[0]?.kind === 'watch-error' ? events[0].message.length : 0).toBeLessThanOrEqual(
      4096
    )
  })
})

async function createTempDir(prefix: string): Promise<string> {
  const path = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  temporaryPaths.push(path)
  return path
}

async function createRepository(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await git(['init', '-b', 'main', path])
  await git(['-C', path, 'config', 'user.name', 'Space Zero Test'])
  await git(['-C', path, 'config', 'user.email', 'test@spacezero.dev'])
  await writeFile(join(path, 'README.md'), '# Test\n')
  await git(['-C', path, 'add', 'README.md'])
  await git(['-C', path, 'commit', '-m', 'initial'])
}

async function git(args: string[], allowFailure = false): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { encoding: 'utf8' })
    return stdout
  } catch (error) {
    if (allowFailure) return ''
    throw error
  }
}

function createStatsStub({
  dev,
  ino,
  file,
  symbolicLink
}: {
  dev: number
  ino: number
  file: boolean
  symbolicLink: boolean
}) {
  return {
    dev,
    ino,
    isFile: () => file,
    isSymbolicLink: () => symbolicLink
  } as Stats
}

function createManagedWorktreeServiceStub(
  validate: ManagedWorktreeService['validate']
): ManagedWorktreeService {
  return {
    create: async () => {
      throw new Error('not implemented')
    },
    remove: async () => {},
    validate
  }
}

function createSessionsRepository({
  projectPath,
  worktreePath
}: {
  projectPath: string
  worktreePath: string | null
}): SessionsRepository {
  const session: StoredSession = {
    id: 'session-1',
    projectId: 'project-1',
    title: 'Issue Session',
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    worktreePath,
    worktreeBranch: worktreePath ? 'spacezero/session-session-1' : null,
    worktreeBaseRevision: worktreePath ? 'HEAD' : null
  }
  return {
    async listProjectSessions() {
      return [session]
    },
    async listWorkspaceSessions() {
      return []
    },
    async create(next) {
      return next
    },
    async countByProjectId() {
      return 1
    },
    async countWorkspaceSessions() {
      return 0
    },
    async projectExists() {
      return true
    },
    async findProjectById(projectId) {
      return projectId === 'project-1' ? { id: projectId, path: projectPath } : undefined
    },
    async updateProjectPath() {},
    async hasManagedSessions() {
      return true
    },
    async findSessionById(sessionId) {
      return sessionId === session.id ? session : undefined
    },
    async update(next) {
      return next
    },
    async deleteById() {},
    async listByProjectIdIncludingArchived() {
      return [session]
    },
    async updateMany(sessions) {
      return sessions
    },
    async deleteByProjectId() {}
  }
}
