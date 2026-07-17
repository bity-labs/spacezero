import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import { createKnowledgeBaseHost } from './knowledge-base-host.adapter'
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
    async save() {},
    async clear() {}
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
  handler: (args: readonly string[]) => { stdout?: string; stderr?: string } | Error,
  pathExists: (path: string) => Promise<boolean> = async () => false
): KnowledgeBaseGitHost & { calls: readonly string[][] } {
  const calls: string[][] = []
  return {
    calls,
    pathExists,
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
    ).resolves.toMatchObject({
      remoteState: 'configured',
      remoteUrl: 'example.com:builder/knowledge.git',
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

  it('does not stage files when retrying an interrupted conflict', async () => {
    const syncStateRepository = createSyncStateRepository()
    const host = createGitHost(
      (args) => {
        const command = args.join(' ')
        if (command === 'remote') return { stdout: 'origin\n' }
        if (command === 'remote get-url origin') {
          return { stdout: 'https://example.com/notes.git\n' }
        }
        if (command.startsWith('rev-parse --git-path ')) {
          return { stdout: `.git/${args.at(-1)}\n` }
        }
        throw new Error(`Unexpected Git command: ${command}`)
      },
      async (path) => path.endsWith('rebase-merge')
    )
    const service = createKnowledgeBaseSyncService({
      configurationRepository: configuredRepository(),
      syncStateRepository,
      host
    })

    await expect(service.syncNow()).rejects.toThrow(
      'Resolve or abort the interrupted Git operation before retrying.'
    )
    expect(host.calls.some((args) => args[0] === 'add')).toBe(false)
    expect(host.calls.some((args) => args[0] === 'commit')).toBe(false)
    expect(syncStateRepository.value).toMatchObject({ syncState: 'conflict' })
  })

  it('redacts credentials from remote status and persisted Git errors', async () => {
    const syncStateRepository = createSyncStateRepository()
    const credentialUrl = 'https://builder:secret-token@example.com/notes.git'
    const host = createGitHost((args) => {
      const command = args.join(' ')
      if (command === 'remote') return { stdout: 'origin\n' }
      if (command === 'remote get-url origin') return { stdout: `${credentialUrl}\n` }
      if (command.startsWith('rev-parse --git-path ')) return { stdout: `.git/${args.at(-1)}\n` }
      if (command === 'diff --name-only --diff-filter=U') return { stdout: '' }
      if (command === 'branch --show-current') return { stdout: 'main\n' }
      if (command === 'status --porcelain') return { stdout: '' }
      if (command === 'ls-remote --heads origin main') {
        return new Error(`fatal: unable to access '${credentialUrl}': authentication failed`)
      }
      throw new Error(`Unexpected Git command: ${command}`)
    })
    const service = createKnowledgeBaseSyncService({
      configurationRepository: configuredRepository(),
      syncStateRepository,
      host
    })

    await expect(service.getSyncStatus()).resolves.toMatchObject({
      remoteUrl: 'https://example.com/notes.git'
    })
    await expect(service.syncNow()).rejects.toThrow(
      "fatal: unable to access 'https://example.com/notes.git': authentication failed"
    )
    expect(JSON.stringify(syncStateRepository.value)).not.toContain('secret-token')
    expect(syncStateRepository.value?.lastSyncError).toBe(
      "fatal: unable to access 'https://example.com/notes.git': authentication failed"
    )
  })

  it('records conflicts without silently resolving or pushing them', async () => {
    const syncStateRepository = createSyncStateRepository()
    const host = createGitHost((args) => {
      const command = args.join(' ')
      if (command === 'remote') return { stdout: 'origin\n' }
      if (command === 'remote get-url origin') return { stdout: 'https://example.com/notes.git\n' }
      if (command.startsWith('rev-parse --git-path ')) return { stdout: `.git/${args.at(-1)}\n` }
      if (command === 'diff --name-only --diff-filter=U') return { stdout: '' }
      if (command === 'status --porcelain') return { stdout: '' }
      if (command === 'branch --show-current') return { stdout: 'main\n' }
      if (command === 'ls-remote --heads origin main') return { stdout: 'abc\trefs/heads/main\n' }
      if (command === 'pull --rebase origin main') {
        return new Error('CONFLICT (content): Merge conflict in note.md')
      }
      return {}
    })
    const service = createKnowledgeBaseSyncService({
      configurationRepository: configuredRepository(),
      syncStateRepository,
      host
    })

    await expect(service.syncNow()).rejects.toThrow('Merge conflict in note.md')
    expect(syncStateRepository.value).toMatchObject({
      syncState: 'conflict',
      lastSyncError: 'CONFLICT (content): Merge conflict in note.md'
    })
    expect(host.calls.some((args) => args[0] === 'push')).toBe(false)
  })

  it('commits local changes with a local timestamp before pulling and pushing origin', async () => {
    const syncStateRepository = createSyncStateRepository()
    const host = createGitHost((args) => {
      const command = args.join(' ')
      if (command === 'remote') return { stdout: 'origin\n' }
      if (command === 'remote get-url origin') return { stdout: 'https://example.com/notes.git\n' }
      if (command.startsWith('rev-parse --git-path ')) return { stdout: `.git/${args.at(-1)}\n` }
      if (command === 'diff --name-only --diff-filter=U') return { stdout: '' }
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

describe('real Git conflict recovery', () => {
  const temporaryDirectories: string[] = []
  const run = promisify(execFile)

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    )
  })

  it('leaves unresolved files and the interrupted rebase untouched on Retry', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'spacezero-kb-sync-'))
    temporaryDirectories.push(fixture)
    const originPath = join(fixture, 'origin.git')
    const seedPath = join(fixture, 'seed')
    const rootPath = join(fixture, 'knowledge-base')
    const otherPath = join(fixture, 'other')

    await git(fixture, ['init', '--bare', originPath])
    await git(fixture, ['init', '-b', 'main', seedPath])
    await configureGitUser(seedPath)
    await writeFile(join(seedPath, 'note.md'), 'original\n')
    await git(seedPath, ['add', 'note.md'])
    await git(seedPath, ['commit', '-m', 'Initial note'])
    await git(seedPath, ['remote', 'add', 'origin', originPath])
    await git(seedPath, ['push', '-u', 'origin', 'main'])
    await git(originPath, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
    await git(fixture, ['clone', originPath, rootPath])
    await git(fixture, ['clone', originPath, otherPath])
    await configureGitUser(rootPath)
    await configureGitUser(otherPath)

    await writeFile(join(otherPath, 'note.md'), 'remote change\n')
    await git(otherPath, ['add', 'note.md'])
    await git(otherPath, ['commit', '-m', 'Remote change'])
    await git(otherPath, ['push'])
    await writeFile(join(rootPath, 'note.md'), 'local change\n')

    const syncStateRepository = createSyncStateRepository()
    const service = createKnowledgeBaseSyncService({
      configurationRepository: configuredRepositoryAt(rootPath),
      syncStateRepository,
      host: createKnowledgeBaseHost()
    })

    await expect(service.syncNow()).rejects.toThrow(/conflict|could not apply/i)
    const conflictedHead = (await git(rootPath, ['rev-parse', 'HEAD'])).stdout.trim()
    expect(await readFile(join(rootPath, 'note.md'), 'utf8')).toContain('<<<<<<<')

    await expect(service.syncNow()).rejects.toThrow(
      'Resolve or abort the interrupted Git operation before retrying.'
    )

    expect((await git(rootPath, ['rev-parse', 'HEAD'])).stdout.trim()).toBe(conflictedHead)
    expect((await git(rootPath, ['diff', '--name-only', '--diff-filter=U'])).stdout.trim()).toBe(
      'note.md'
    )
    expect(await readFile(join(rootPath, 'note.md'), 'utf8')).toContain('<<<<<<<')
    expect(syncStateRepository.value).toMatchObject({ syncState: 'conflict' })
  }, 20_000)

  async function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return run('git', args, { cwd, encoding: 'utf8' })
  }

  async function configureGitUser(cwd: string): Promise<void> {
    await git(cwd, ['config', 'user.name', 'Space Zero Test'])
    await git(cwd, ['config', 'user.email', 'spacezero@example.com'])
  }
})

function configuredRepositoryAt(rootPath: string): KnowledgeBaseConfigurationRepository {
  return {
    async get() {
      return { rootPath, configuredAt: new Date(0).toISOString() }
    },
    async save() {},
    async clear() {}
  }
}

describe('formatKnowledgeBaseCommitMessage', () => {
  it('uses local date and time with zero padding', () => {
    expect(formatKnowledgeBaseCommitMessage(new Date(2026, 0, 2, 3, 4))).toBe(
      'Changes - 2026-01-02 03:04'
    )
  })
})
