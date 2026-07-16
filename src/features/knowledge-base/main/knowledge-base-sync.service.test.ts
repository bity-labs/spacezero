import { describe, expect, it } from 'vitest'

import type { KnowledgeBaseConfigurationRepository } from './knowledge-base.service'
import {
  createKnowledgeBaseSyncService,
  formatKnowledgeBaseCommitMessage,
  type KnowledgeBaseGitHost,
  type KnowledgeBaseSyncStateRepository
} from './knowledge-base-sync.service'

function configuredRepository(): KnowledgeBaseConfigurationRepository {
  return {
    async get() {
      return {
        rootPath: '/home/builder/SpaceZero/knowledge-base',
        configuredAt: new Date(0).toISOString()
      }
    },
    async save() {}
  }
}

function createSyncStateRepository(): KnowledgeBaseSyncStateRepository & {
  value?: Awaited<ReturnType<KnowledgeBaseSyncStateRepository['get']>>
} {
  return {
    value: undefined,
    async get() {
      return this.value
    },
    async save(state) {
      this.value = state
    }
  }
}

function createGitHost(
  handler: (args: readonly string[]) => { stdout?: string; stderr?: string } | Error
): KnowledgeBaseGitHost & { calls: readonly string[][] } {
  const calls: string[][] = []
  return {
    calls,
    async runGit(_cwd, args) {
      calls.push([...args])
      const result = handler(args)
      if (result instanceof Error) throw result
      return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
    }
  }
}

describe('createKnowledgeBaseSyncService', () => {
  it('reports a local-only Knowledge Base without committing local changes', async () => {
    const host = createGitHost((args) => {
      if (args[0] === 'remote') return { stdout: '' }
      throw new Error(`Unexpected Git command: ${args.join(' ')}`)
    })
    const service = createKnowledgeBaseSyncService({
      configurationRepository: configuredRepository(),
      syncStateRepository: createSyncStateRepository(),
      host
    })

    await expect(service.getSyncStatus()).resolves.toEqual({
      remoteState: 'local-only',
      syncState: 'idle'
    })
    await expect(service.syncNow()).rejects.toThrow(
      'Add an origin remote before syncing the Knowledge Base.'
    )
    expect(host.calls).toEqual([['remote'], ['remote']])
    expect(host.calls.flat()).not.toContain('commit')
  })

  it('adds a fixed origin remote using a safe Git argument list', async () => {
    let hasOrigin = false
    const host = createGitHost((args) => {
      if (args.join(' ') === 'remote') return { stdout: hasOrigin ? 'origin\n' : '' }
      if (args[0] === 'remote' && args[1] === 'add') {
        hasOrigin = true
        return {}
      }
      if (args.join(' ') === 'remote get-url origin') {
        return { stdout: 'git@example.com:builder/knowledge.git\n' }
      }
      throw new Error(`Unexpected Git command: ${args.join(' ')}`)
    })
    const service = createKnowledgeBaseSyncService({
      configurationRepository: configuredRepository(),
      syncStateRepository: createSyncStateRepository(),
      host
    })

    await expect(
      service.addRemote({ gitUrl: 'git@example.com:builder/knowledge.git' })
    ).resolves.toEqual({
      remoteState: 'configured',
      remoteUrl: 'git@example.com:builder/knowledge.git',
      syncState: 'idle'
    })
    expect(host.calls).toContainEqual([
      'remote',
      'add',
      'origin',
      'git@example.com:builder/knowledge.git'
    ])
  })

  it('surfaces add-remote Git failures', async () => {
    const host = createGitHost((args) => {
      if (args.join(' ') === 'remote') return { stdout: '' }
      if (args[0] === 'remote' && args[1] === 'add') return new Error('invalid remote URL')
      return {}
    })
    const service = createKnowledgeBaseSyncService({
      configurationRepository: configuredRepository(),
      syncStateRepository: createSyncStateRepository(),
      host
    })

    await expect(service.addRemote({ gitUrl: 'bad url' })).rejects.toThrow('invalid remote URL')
  })

  it('commits local changes with a local timestamp before pulling and pushing origin', async () => {
    const syncStateRepository = createSyncStateRepository()
    const host = createGitHost((args) => {
      const command = args.join(' ')
      if (command === 'remote') return { stdout: 'origin\n' }
      if (command === 'remote get-url origin') return { stdout: 'https://example.com/notes.git\n' }
      if (command === 'status --porcelain') return { stdout: ' M note.md\n' }
      if (command === 'branch --show-current') return { stdout: 'main\n' }
      if (command === 'ls-remote --heads origin main') return { stdout: 'abc\trefs/heads/main\n' }
      return {}
    })
    const now = new Date(2026, 6, 16, 14, 5)
    const service = createKnowledgeBaseSyncService({
      configurationRepository: configuredRepository(),
      syncStateRepository,
      host,
      now: () => now
    })

    await expect(service.syncNow()).resolves.toMatchObject({
      remoteState: 'configured',
      syncState: 'idle',
      lastSyncAt: now.toISOString()
    })
    expect(host.calls).toContainEqual(['add', '-A'])
    expect(host.calls).toContainEqual(['commit', '-m', 'Changes - 2026-07-16 14:05'])
    expect(host.calls).toContainEqual(['pull', '--rebase', 'origin', 'main'])
    expect(host.calls).toContainEqual(['push', '--set-upstream', 'origin', 'main'])
    expect(syncStateRepository.value).toEqual({
      syncState: 'idle',
      lastSyncAt: now.toISOString()
    })
  })
})

describe('formatKnowledgeBaseCommitMessage', () => {
  it('uses local date and time with zero padding', () => {
    expect(formatKnowledgeBaseCommitMessage(new Date(2026, 0, 2, 3, 4))).toBe(
      'Changes - 2026-01-02 03:04'
    )
  })
})
