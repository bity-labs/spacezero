import type { KnowledgeBaseSyncStatus } from '../shared'
import type { KnowledgeBaseConfigurationRepository } from './knowledge-base.service'

export type StoredKnowledgeBaseSyncState = {
  syncState: 'idle' | 'syncing' | 'error' | 'conflict'
  lastSyncAt?: string
  lastSyncError?: string
}

export type KnowledgeBaseSyncStateRepository = {
  get: () => Promise<StoredKnowledgeBaseSyncState | undefined>
  save: (state: StoredKnowledgeBaseSyncState) => Promise<void>
}

export type KnowledgeBaseGitHost = {
  runGit: (
    cwd: string,
    args: readonly string[]
  ) => Promise<{ stdout: string; stderr: string }>
}

export type KnowledgeBaseSyncService = {
  getSyncStatus: () => Promise<KnowledgeBaseSyncStatus>
  addRemote: (request: { gitUrl: string }) => Promise<KnowledgeBaseSyncStatus>
  syncNow: () => Promise<KnowledgeBaseSyncStatus>
}

export function createKnowledgeBaseSyncService({
  configurationRepository,
  syncStateRepository,
  host,
  now = () => new Date()
}: {
  configurationRepository: KnowledgeBaseConfigurationRepository
  syncStateRepository: KnowledgeBaseSyncStateRepository
  host: KnowledgeBaseGitHost
  now?: () => Date
}): KnowledgeBaseSyncService {
  return {
    async getSyncStatus() {
      const rootPath = await getConfiguredRoot(configurationRepository)
      const remote = await getOrigin(host, rootPath)
      const storedState = await syncStateRepository.get()
      if (!remote) return { remoteState: 'local-only', syncState: 'idle' }
      return {
        remoteState: 'configured',
        remoteUrl: remote,
        syncState: storedState?.syncState ?? 'idle',
        lastSyncAt: storedState?.lastSyncAt,
        lastSyncError: storedState?.lastSyncError
      }
    },

    async addRemote(request) {
      const rootPath = await getConfiguredRoot(configurationRepository)
      const gitUrl = request.gitUrl.trim()
      if (!gitUrl) throw new Error('Origin Git URL is required.')
      if (await getOrigin(host, rootPath)) {
        throw new Error('The Knowledge Base already has an origin remote.')
      }

      await host.runGit(rootPath, ['remote', 'add', 'origin', gitUrl])
      const storedState = await syncStateRepository.get()
      return {
        remoteState: 'configured',
        remoteUrl: (await getOrigin(host, rootPath)) ?? gitUrl,
        syncState: storedState?.syncState ?? 'idle',
        lastSyncAt: storedState?.lastSyncAt,
        lastSyncError: storedState?.lastSyncError
      }
    },

    async syncNow() {
      const rootPath = await getConfiguredRoot(configurationRepository)
      const remoteUrl = await getOrigin(host, rootPath)
      if (!remoteUrl) throw new Error('Add an origin remote before syncing the Knowledge Base.')

      const previousState = await syncStateRepository.get()
      await syncStateRepository.save({
        syncState: 'syncing',
        lastSyncAt: previousState?.lastSyncAt
      })

      try {
        const changes = await host.runGit(rootPath, ['status', '--porcelain'])
        if (changes.stdout.trim()) {
          await host.runGit(rootPath, ['add', '-A'])
          await host.runGit(rootPath, [
            'commit',
            '-m',
            formatKnowledgeBaseCommitMessage(now())
          ])
        }

        const branch = (await host.runGit(rootPath, ['branch', '--show-current'])).stdout.trim()
        if (!branch) throw new Error('Knowledge Base sync requires an active Git branch.')

        const remoteBranch = await host.runGit(rootPath, [
          'ls-remote',
          '--heads',
          'origin',
          branch
        ])
        if (remoteBranch.stdout.trim()) {
          await host.runGit(rootPath, ['pull', '--rebase', 'origin', branch])
        }
        await host.runGit(rootPath, ['push', '--set-upstream', 'origin', branch])

        const lastSyncAt = now().toISOString()
        await syncStateRepository.save({ syncState: 'idle', lastSyncAt })
        return {
          remoteState: 'configured',
          remoteUrl,
          syncState: 'idle',
          lastSyncAt
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await syncStateRepository.save({
          syncState: isConflictError(message) ? 'conflict' : 'error',
          lastSyncAt: previousState?.lastSyncAt,
          lastSyncError: message
        })
        throw error
      }
    }
  }
}

export function formatKnowledgeBaseCommitMessage(date: Date): string {
  return `Changes - ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function getOrigin(
  host: KnowledgeBaseGitHost,
  rootPath: string
): Promise<string | undefined> {
  const remotes = (await host.runGit(rootPath, ['remote'])).stdout
    .split(/\r?\n/)
    .map((remote) => remote.trim())
  if (!remotes.includes('origin')) return undefined
  const url = (await host.runGit(rootPath, ['remote', 'get-url', 'origin'])).stdout.trim()
  return url || undefined
}

async function getConfiguredRoot(
  repository: KnowledgeBaseConfigurationRepository
): Promise<string> {
  const configuration = await repository.get()
  if (!configuration) throw new Error('Knowledge Base is not configured.')
  return configuration.rootPath
}

function isConflictError(message: string): boolean {
  return /conflict|non-fast-forward|fetch first|rejected/i.test(message)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
