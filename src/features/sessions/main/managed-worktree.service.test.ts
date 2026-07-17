import { describe, expect, it, vi } from 'vitest'

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
