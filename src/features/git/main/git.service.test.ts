import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

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

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { encoding: 'utf8' })
  return stdout
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
