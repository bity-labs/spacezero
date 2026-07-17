import { isAbsolute, resolve } from 'node:path'

import type { KnowledgeBaseSyncStatus } from '../shared'
import {
  redactGitSecrets,
  sanitizeGitRemoteUrl,
  toRedactedGitError
} from './knowledge-base-git-security'
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
  pathExists: (path: string) => Promise<boolean>
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

      try {
        const remote = await getOrigin(host, rootPath)
        const storedState = await syncStateRepository.get()
        if (!remote) return { remoteState: 'local-only', syncState: 'idle' }
        return {
          remoteState: 'configured',
          remoteUrl: sanitizeGitRemoteUrl(remote),
          syncState: storedState?.syncState ?? 'idle',
          lastSyncAt: storedState?.lastSyncAt,
          lastSyncError: storedState?.lastSyncError
            ? redactGitSecrets(storedState.lastSyncError)
            : undefined
        }
      } catch (error) {
        throw toRedactedGitError(error)
      }
    },

    async addRemote(request) {
      const rootPath = await getConfiguredRoot(configurationRepository)
      const gitUrl = request.gitUrl.trim()
      if (!gitUrl) throw new Error('Origin Git URL is required.')

      try {
        if (await getOrigin(host, rootPath)) {
          throw new Error('The Knowledge Base already has an origin remote.')
        }

        await host.runGit(rootPath, ['remote', 'add', 'origin', gitUrl])
        const storedState = await syncStateRepository.get()
        return {
          remoteState: 'configured',
          remoteUrl: sanitizeGitRemoteUrl((await getOrigin(host, rootPath)) ?? gitUrl),
          syncState: storedState?.syncState ?? 'idle',
          lastSyncAt: storedState?.lastSyncAt,
          lastSyncError: storedState?.lastSyncError
            ? redactGitSecrets(storedState.lastSyncError)
            : undefined
        }
      } catch (error) {
        throw toRedactedGitError(error)
      }
    },

    async syncNow() {
      const rootPath = await getConfiguredRoot(configurationRepository)
      let remoteUrl: string | undefined
      try {
        remoteUrl = await getOrigin(host, rootPath)
      } catch (error) {
        throw toRedactedGitError(error)
      }
      if (!remoteUrl) throw new Error('Add an origin remote before syncing the Knowledge Base.')

      const previousState = await syncStateRepository.get()
      await syncStateRepository.save({
        syncState: 'syncing',
        lastSyncAt: previousState?.lastSyncAt
      })

      try {
        await assertRepositoryReadyForSync(host, rootPath)

        const branch = (await host.runGit(rootPath, ['branch', '--show-current'])).stdout.trim()
        if (!branch) throw new Error('Knowledge Base sync requires an active Git branch.')

        const changes = await host.runGit(rootPath, ['status', '--porcelain'])
        if (changes.stdout.trim()) {
          await host.runGit(rootPath, ['add', '-A'])
          await host.runGit(rootPath, [
            'commit',
            '-m',
            formatKnowledgeBaseCommitMessage(now())
          ])
        }

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
          remoteUrl: sanitizeGitRemoteUrl(remoteUrl),
          syncState: 'idle',
          lastSyncAt
        }
      } catch (error) {
        const redactedError = toRedactedGitError(error)
        await syncStateRepository.save({
          syncState: isConflictError(redactedError.message) ? 'conflict' : 'error',
          lastSyncAt: previousState?.lastSyncAt,
          lastSyncError: redactedError.message
        })
        throw redactedError
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

const GIT_OPERATION_MARKERS = [
  'rebase-merge',
  'rebase-apply',
  'MERGE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD'
] as const

async function assertRepositoryReadyForSync(
  host: KnowledgeBaseGitHost,
  rootPath: string
): Promise<void> {
  for (const marker of GIT_OPERATION_MARKERS) {
    const markerPath = (
      await host.runGit(rootPath, ['rev-parse', '--git-path', marker])
    ).stdout.trim()
    const absoluteMarkerPath = isAbsolute(markerPath)
      ? markerPath
      : resolve(rootPath, markerPath)
    if (markerPath && (await host.pathExists(absoluteMarkerPath))) {
      throw new Error(
        'Knowledge Base sync found a conflict or interrupted Git operation. Resolve or abort the interrupted Git operation before retrying.'
      )
    }
  }

  const unmergedPaths = await host.runGit(rootPath, [
    'diff',
    '--name-only',
    '--diff-filter=U'
  ])
  if (unmergedPaths.stdout.trim()) {
    throw new Error(
      'Knowledge Base sync found unresolved conflicts. Resolve or abort the interrupted Git operation before retrying.'
    )
  }
}

function isConflictError(message: string): boolean {
  return /conflict|interrupted git operation|non-fast-forward|fetch first|rejected/i.test(message)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
