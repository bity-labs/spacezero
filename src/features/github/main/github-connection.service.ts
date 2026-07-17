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
    'usable' | 'pending-approval' | 'suspended' | 'organization-authorization-required'
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

export function createGitHubConnectionService({
  auth,
  adapter,
  appSlug,
  openExternal
}: {
  auth: AuthBoundary
  adapter: GitHubInstallationsAdapter
  appSlug: string | undefined
  openExternal: (url: string) => Promise<void>
}) {
  async function getConnection(): Promise<GitHubConnection> {
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

    let snapshot: Awaited<ReturnType<typeof loadRepositoryAccess>>
    try {
      snapshot = await loadRepositoryAccess(credential.accessToken)
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

    if (snapshot.installations.some((installation) => installation.status === 'pending-approval')) {
      return {
        status: 'pending-organization-approval',
        identity: credential.identity,
        installations: snapshot.installations
      }
    }

    return {
      status: 'repository-access-required',
      identity: credential.identity,
      installations: snapshot.installations
    }
  }

  async function listAuthorizedRepositories(): Promise<GitHubRepository[]> {
    const credential = await auth.getAuthorizedCredential()
    return (await loadRepositoryAccess(credential.accessToken)).repositories
  }

  async function openInstallation(): Promise<void> {
    const slug = appSlug?.trim()
    if (!slug || !/^[a-zA-Z0-9-]+$/.test(slug)) {
      throw new GitHubIntegrationError('configuration-missing')
    }
    await openExternal(`https://github.com/apps/${slug}/installations/new`)
  }

  async function loadRepositoryAccess(accessToken: string): Promise<{
    installations: GitHubInstallation[]
    repositories: GitHubRepository[]
  }> {
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

  return { getConnection, listAuthorizedRepositories, openInstallation }
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
