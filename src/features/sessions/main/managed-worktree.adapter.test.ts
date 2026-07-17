import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createManagedWorktreeAdapter } from './managed-worktree.adapter'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('managed worktree adapter', () => {
  it('creates a branch-backed worktree from the base repository HEAD', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-worktree-test-'))
    temporaryPaths.push(root)
    const destination = join(root, 'managed', 'session-1')
    const requests: Array<{ args: string[] }> = []
    const runGit = vi.fn(async (request: { args: string[]; allowFailure?: boolean }) => {
      requests.push(request)
      if (request.args.includes('--is-inside-work-tree')) return { stdout: 'true\n', exitCode: 0 }
      if (request.args.at(-1) === 'HEAD') return { stdout: 'abc123\n', exitCode: 0 }
      return { stdout: '', exitCode: 0 }
    })
    const adapter = createManagedWorktreeAdapter({ runGit })

    await expect(
      adapter.create({
        projectPath: '/repos/spacezero',
        destination,
        branch: 'spacezero/session-session-1',
        startPoint: { kind: 'current-head' }
      })
    ).resolves.toEqual({ baseRevision: 'abc123' })

    expect(requests.map((request) => request.args)).toContainEqual([
      '-C',
      '/repos/spacezero',
      'worktree',
      'add',
      '--no-track',
      '-b',
      'spacezero/session-session-1',
      '--',
      destination,
      'abc123'
    ])
  })

  it('attempts reverse-order worktree and branch cleanup when creation fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-worktree-test-'))
    temporaryPaths.push(root)
    const destination = join(root, 'managed', 'session-1')
    const requests: Array<{ args: string[]; allowFailure?: boolean }> = []
    const runGit = vi.fn(async (request: { args: string[]; allowFailure?: boolean }) => {
      requests.push(request)
      if (request.args.includes('--is-inside-work-tree')) return { stdout: 'true\n', exitCode: 0 }
      if (request.args.at(-1) === 'HEAD') return { stdout: 'abc123\n', exitCode: 0 }
      if (request.args.includes('add')) throw new Error('session.gitCommandFailed')
      return { stdout: '', exitCode: 1 }
    })
    const adapter = createManagedWorktreeAdapter({ runGit })

    await expect(
      adapter.create({
        projectPath: '/repos/spacezero',
        destination,
        branch: 'spacezero/session-session-1',
        startPoint: { kind: 'current-head' }
      })
    ).rejects.toThrow('session.gitCommandFailed')

    expect(requests.map((request) => request.args)).toContainEqual([
      '-C',
      '/repos/spacezero',
      'worktree',
      'remove',
      '--force',
      '--',
      destination
    ])
    expect(requests.map((request) => request.args)).toContainEqual([
      '-C',
      '/repos/spacezero',
      'branch',
      '-D',
      '--',
      'spacezero/session-session-1'
    ])
  })
})
