import type {
  GitHubConnection,
  GitHubInstallation,
  GitHubInstallationOwner,
  GitHubInstallationStatus,
  GitHubRepository
} from '../shared'
import {
  GitHubIntegrationError,
  type GitHubAuthService,
  type StoredGitHubCredential
} from './github-auth.service'

export type GitHubInstallationAccess = {
  id: string
  owner: GitHubInstallationOwner
  repositorySelection: 'all' | 'selected'
  status: Extract<
    GitHubInstallationStatus,
    'usable' | 'suspended' | 'organization-authorization-required'
  >
}

export type GitHubRepositoryAccess = Omit<GitHubRepository, 'installationId'>

export type GitHubInstallationsAdapter = {
  listInstallations: (accessToken: string) => Promise<GitHubInstallationAccess[]>
  listInstallationRepositories: (
    accessToken: string,
    installationId: string
  ) => Promise<GitHubRepositoryAccess[]>
}

type AuthBoundary = Pick<GitHubAuthService, 'getAuthorizedCredential'> &
  Partial<Pick<GitHubAuthService, 'getConnection'>>

type RepositoryAccessSnapshot = {
  installations: GitHubInstallation[]
  repositories: GitHubRepository[]
}

const CONNECTION_SNAPSHOT_TTL_MS = 30_000

export function createGitHubConnectionService({
  auth,
  adapter,
  appSlug,
  now = Date.now,
  openExternal
}: {
  auth: AuthBoundary
  adapter: GitHubInstallationsAdapter
  appSlug: string | undefined
  now?: () => number
  openExternal: (url: string) => Promise<void>
}) {
  let connectionSnapshotCache:
    | {
        identityId: string
        expiresAt: number
        snapshot: RepositoryAccessSnapshot
      }
    | undefined
  let connectionSnapshotInFlight:
    | {
        identityId: string
        generation: number
        promise: Promise<RepositoryAccessSnapshot>
      }
    | undefined
  let connectionSnapshotGeneration = 0

  async function getConnection(forceRefresh = false): Promise<GitHubConnection> {
    let credential: StoredGitHubCredential
    try {
      credential = await auth.getAuthorizedCredential()
    } catch (error) {
      if (isGitHubError(error, 'authorization-required')) return { status: 'disconnected' }
      if (isGitHubError(error, 'reconnect-required')) {
        const state = await auth.getConnection?.()
        if (state && state.status === 'reconnect-required') return state
        return { status: 'disconnected' }
      }
      throw error
    }

    let snapshot: RepositoryAccessSnapshot
    try {
      snapshot = await loadConnectionRepositoryAccess(credential, forceRefresh)
    } catch (error) {
      if (isGitHubError(error, 'reconnect-required')) {
        return { status: 'reconnect-required', identity: credential.identity }
      }
      if (isGitHubError(error, 'authorization-failed')) {
        return {
          status: 'repository-access-required',
          identity: credential.identity,
          installations: []
        }
      }
      throw error
    }
    if (snapshot.repositories.length > 0) {
      return {
        status: 'connected',
        identity: credential.identity,
        installations: snapshot.installations,
        repositories: snapshot.repositories
      }
    }

    return {
      status: 'repository-access-required',
      identity: credential.identity,
      installations: snapshot.installations
    }
  }

  async function refreshConnection(): Promise<GitHubConnection> {
    return getConnection(true)
  }

  async function listAuthorizedRepositories(): Promise<GitHubRepository[]> {
    const credential = await auth.getAuthorizedCredential()
    return (await loadRepositoryAccess(credential.accessToken)).repositories
  }

  async function openManageAccess(): Promise<void> {
    invalidateConnectionSnapshot()
    await openExternal('https://github.com/settings/installations')
  }

  async function openInstallation(): Promise<void> {
    const slug = appSlug?.trim()
    if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
      throw new GitHubIntegrationError('configuration-missing')
    }
    invalidateConnectionSnapshot()
    await openExternal(`https://github.com/apps/${slug}/installations/new`)
  }

  function invalidateConnectionSnapshot(): void {
    connectionSnapshotGeneration += 1
    connectionSnapshotCache = undefined
  }

  async function loadConnectionRepositoryAccess(
    credential: StoredGitHubCredential,
    forceRefresh: boolean
  ): Promise<RepositoryAccessSnapshot> {
    if (
      !forceRefresh &&
      connectionSnapshotCache?.identityId === credential.identity.id &&
      now() < connectionSnapshotCache.expiresAt
    ) {
      return connectionSnapshotCache.snapshot
    }

    const generation = connectionSnapshotGeneration
    if (
      connectionSnapshotInFlight?.identityId === credential.identity.id &&
      connectionSnapshotInFlight.generation === generation
    ) {
      return connectionSnapshotInFlight.promise
    }

    const promise = loadRepositoryAccess(credential.accessToken)
    connectionSnapshotInFlight = {
      identityId: credential.identity.id,
      generation,
      promise
    }

    try {
      const snapshot = await promise
      if (generation === connectionSnapshotGeneration) {
        connectionSnapshotCache = {
          identityId: credential.identity.id,
          expiresAt: now() + CONNECTION_SNAPSHOT_TTL_MS,
          snapshot
        }
      }
      return snapshot
    } finally {
      if (connectionSnapshotInFlight?.promise === promise) {
        connectionSnapshotInFlight = undefined
      }
    }
  }

  async function loadRepositoryAccess(accessToken: string): Promise<RepositoryAccessSnapshot> {
    const installationAccess = await adapter.listInstallations(accessToken)
    const installations: GitHubInstallation[] = []
    const repositories = new Map<string, GitHubRepository>()

    for (const installation of installationAccess) {
      if (installation.status !== 'usable') {
        installations.push({ ...installation, repositoryCount: 0 })
        continue
      }

      try {
        const installationRepositories = await adapter.listInstallationRepositories(
          accessToken,
          installation.id
        )
        installations.push({
          ...installation,
          status: installationRepositories.length > 0 ? 'usable' : 'no-repositories',
          repositoryCount: installationRepositories.length
        })
        for (const repository of installationRepositories) {
          repositories.set(repository.id, { ...repository, installationId: installation.id })
        }
      } catch (error) {
        if (error instanceof GitHubInstallationAccessError) {
          installations.push({
            ...installation,
            status: error.code,
            repositoryCount: 0
          })
          continue
        }
        throw error
      }
    }

    return {
      installations,
      repositories: [...repositories.values()]
    }
  }

  return {
    getConnection: () => getConnection(),
    refreshConnection,
    listAuthorizedRepositories,
    openInstallation,
    openManageAccess
  }
}

export class GitHubInstallationAccessError extends Error {
  constructor(
    readonly code: Extract<
      GitHubInstallationStatus,
      'suspended' | 'organization-authorization-required'
    >
  ) {
    super(`github.${code}`)
    this.name = 'GitHubInstallationAccessError'
  }
}

function isGitHubError(error: unknown, code: GitHubIntegrationError['code']): boolean {
  return error instanceof GitHubIntegrationError && error.code === code
}
