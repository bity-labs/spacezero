import { Octokit } from '@octokit/rest'

import {
  GitHubInstallationAccessError,
  type GitHubInstallationAccess,
  type GitHubInstallationsAdapter,
  type GitHubRepositoryAccess
} from './github-connection.service'
import { GitHubIntegrationError } from './github-auth.service'

export function createGitHubInstallationsAdapter(): GitHubInstallationsAdapter {
  return {
    async listInstallations(accessToken) {
      const octokit = new Octokit({ auth: accessToken })
      const installations: GitHubInstallationAccess[] = []

      try {
        for (let page = 1; ; page += 1) {
          const response = await octokit.request('GET /user/installations', {
            per_page: 100,
            page
          })
          installations.push(...response.data.installations.map(toInstallation))
          if (
            installations.length >= response.data.total_count ||
            response.data.installations.length < 100
          ) {
            break
          }
        }
        return installations
      } catch (error) {
        throw sanitizeOctokitError(error)
      }
    },

    async listInstallationRepositories(accessToken, installationId) {
      const octokit = new Octokit({ auth: accessToken })
      const repositories: GitHubRepositoryAccess[] = []

      try {
        for (let page = 1; ; page += 1) {
          const response = await octokit.request(
            'GET /user/installations/{installation_id}/repositories',
            {
              installation_id: Number(installationId),
              per_page: 100,
              page
            }
          )
          repositories.push(...response.data.repositories.map(toRepository))
          if (
            repositories.length >= response.data.total_count ||
            response.data.repositories.length < 100
          ) {
            break
          }
        }
        return repositories
      } catch (error) {
        const status = getStatus(error)
        if (status === 403) {
          throw new GitHubInstallationAccessError('organization-authorization-required')
        }
        if (status === 404) throw new GitHubInstallationAccessError('suspended')
        throw sanitizeOctokitError(error)
      }
    }
  }
}

function toInstallation(
  installation: Awaited<
    ReturnType<Octokit['rest']['apps']['listInstallationsForAuthenticatedUser']>
  >['data']['installations'][number]
): GitHubInstallationAccess {
  const account = installation.account
  if (!account || !('login' in account)) throw new GitHubIntegrationError('authorization-failed')

  return {
    id: String(installation.id),
    owner: {
      id: String(account.id),
      login: account.login,
      type: account.type === 'Organization' ? 'organization' : 'user',
      avatarUrl: account.avatar_url
    },
    repositorySelection: installation.repository_selection === 'all' ? 'all' : 'selected',
    status: installation.suspended_at ? 'suspended' : 'usable'
  }
}

function toRepository(
  repository: Awaited<
    ReturnType<Octokit['rest']['apps']['listReposAccessibleToInstallation']>
  >['data']['repositories'][number]
): GitHubRepositoryAccess {
  return {
    id: String(repository.id),
    nodeId: repository.node_id,
    owner: repository.owner.login,
    name: repository.name,
    fullName: repository.full_name,
    isPrivate: repository.private,
    defaultBranch: repository.default_branch,
    htmlUrl: repository.html_url,
    cloneUrl: repository.clone_url
  }
}

function sanitizeOctokitError(error: unknown): GitHubIntegrationError {
  const status = getStatus(error)
  if (status === 401) return new GitHubIntegrationError('reconnect-required')
  if (status === 403) return new GitHubIntegrationError('authorization-failed')
  return new GitHubIntegrationError('network-error')
}

function getStatus(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : undefined
}
