import { describe, expect, it, vi } from 'vitest'

import { createManagedWorktreeAdapter } from './managed-worktree.adapter'
import {
  createManagedWorktreeService,
  type ManagedWorktreeAdapter
} from './managed-worktree.service'

function createAdapter(): ManagedWorktreeAdapter {
  return {
    create: vi.fn(async () => ({ baseRevision: 'abc123' })),
    remove: vi.fn(async () => undefined),
    validate: vi.fn(async () => true)
  }
}

describe('managed worktree service', () => {
  it('derives a collision-resistant Issue branch and managed destination', async () => {
    const adapter = createAdapter()
    const service = createManagedWorktreeService({
      adapter,
      getWorktreesPath: async () => '/SpaceZero/worktrees'
    })

    await expect(
      service.create({
        projectPath: '/repos/spacezero',
        projectId: 'project-1',
        sessionId: 'session_abc-123',
        source: { type: 'issue', number: 83 }
      })
    ).resolves.toEqual({
      path: '/SpaceZero/worktrees/project-1/session_abc-123',
      branch: 'spacezero/issue-83-session_abc-123',
      baseRevision: 'abc123'
    })
    expect(adapter.create).toHaveBeenCalledWith({
      projectPath: '/repos/spacezero',
      destination: '/SpaceZero/worktrees/project-1/session_abc-123',
      branch: 'spacezero/issue-83-session_abc-123',
      startPoint: { kind: 'current-head' }
    })
  })

  it('derives a Pull Request branch and forwards its authenticated start point only to Git', async () => {
    const adapter = createAdapter()
    const service = createManagedWorktreeService({
      adapter,
      getWorktreesPath: async () => '/SpaceZero/worktrees'
    })

    await service.create({
      projectPath: '/repos/spacezero',
      projectId: 'project-1',
      sessionId: 'session-pr-1',
      source: { type: 'pull-request', number: 79 },
      startPoint: {
        kind: 'github-ref',
        remoteUrl: 'https://github.com/bity-labs/spacezero.git',
        ref: 'refs/pull/79/head',
        accessToken: 'access-secret'
      }
    })

    expect(adapter.create).toHaveBeenCalledWith({
      projectPath: '/repos/spacezero',
      destination: '/SpaceZero/worktrees/project-1/session-pr-1',
      branch: 'spacezero/pull-request-79-session-pr-1',
      startPoint: {
        kind: 'github-ref',
        remoteUrl: 'https://github.com/bity-labs/spacezero.git',
        ref: 'refs/pull/79/head',
        accessToken: 'access-secret'
      }
    })
  })

  it('validates the persisted Session identity only at its derived managed destination', async () => {
    const adapter = createAdapter()
    const service = createManagedWorktreeService({
      adapter,
      getWorktreesPath: async () => '/SpaceZero/worktrees'
    })
    const worktree = {
      path: '/SpaceZero/worktrees/project-1/session-1',
      branch: 'spacezero/session-session-1',
      baseRevision: 'a'.repeat(40)
    }

    await expect(
      service.validate({
        projectPath: '/repos/spacezero',
        projectId: 'project-1',
        sessionId: 'session-1',
        worktree
      })
    ).resolves.toBe(true)
    expect(adapter.validate).toHaveBeenCalledWith({
      projectPath: '/repos/spacezero',
      destination: worktree.path,
      branch: worktree.branch,
      baseRevision: worktree.baseRevision
    })

    await expect(
      service.validate({
        projectPath: '/repos/spacezero',
        projectId: 'project-1',
        sessionId: 'session-1',
        worktree: { ...worktree, path: '/OldSpaceZero/worktrees/project-1/session-1' }
      })
    ).resolves.toBe(true)

    await expect(
      service.validate({
        projectPath: '/repos/spacezero',
        projectId: 'project-1',
        sessionId: 'session-1',
        worktree: { ...worktree, branch: 'main' }
      })
    ).resolves.toBe(false)
    await expect(
      service.validate({
        projectPath: '/repos/spacezero',
        projectId: 'project-1',
        sessionId: 'session-1',
        worktree: { ...worktree, path: '/tmp/outside/session-1' }
      })
    ).resolves.toBe(false)
    await expect(
      service.remove({
        projectPath: '/repos/spacezero',
        projectId: 'project-1',
        sessionId: 'session-1',
        worktree: { ...worktree, path: '/tmp/outside/session-1' }
      })
    ).rejects.toThrow('session.worktreeOutsideManagedRoot')
    expect(adapter.validate).toHaveBeenCalledTimes(2)
    expect(adapter.remove).not.toHaveBeenCalled()
  })

  it('rejects a persisted path outside the managed root before real adapter validation', async () => {
    const service = createManagedWorktreeService({
      adapter: createManagedWorktreeAdapter(),
      getWorktreesPath: async () => '/SpaceZero/worktrees'
    })
    const request = {
      projectPath: '/repos/spacezero',
      projectId: 'project-1',
      sessionId: 'session-1',
      worktree: {
        path: '/tmp/outside/session-1',
        branch: 'spacezero/session-session-1',
        baseRevision: 'a'.repeat(40)
      }
    }

    await expect(service.validate(request)).resolves.toBe(false)
    await expect(service.remove(request)).rejects.toThrow('session.worktreeOutsideManagedRoot')
  })

  it('rejects identifiers that could escape the managed root', async () => {
    const adapter = createAdapter()
    const service = createManagedWorktreeService({
      adapter,
      getWorktreesPath: async () => '/SpaceZero/worktrees'
    })

    await expect(
      service.create({
        projectPath: '/repos/spacezero',
        projectId: '../outside',
        sessionId: 'session-1'
      })
    ).rejects.toThrow('session.invalidWorktreeIdentifier')
    expect(adapter.create).not.toHaveBeenCalled()
  })
})
