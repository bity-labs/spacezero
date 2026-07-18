import { describe, expect, it, vi } from 'vitest'

import {
  createGitHubConnectionService,
  type GitHubInstallationsAdapter
} from './github-connection.service'
import { GitHubIntegrationError, type StoredGitHubCredential } from './github-auth.service'

const credential: StoredGitHubCredential = {
  accessToken: 'access-secret',
  refreshToken: 'refresh-secret',
  accessTokenExpiresAt: '2026-07-18T01:00:00.000Z',
  refreshTokenExpiresAt: '2026-08-18T00:00:00.000Z',
  identity: {
    id: '42',
    login: 'octocat',
    avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
    profileUrl: 'https://github.com/octocat'
  }
}

const personalInstallation = {
  id: '100',
  owner: {
    id: '42',
    login: 'octocat',
    type: 'user' as const,
    avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4'
  },
  repositorySelection: 'selected' as const,
  status: 'usable' as const
}

const organizationInstallation = {
  id: '200',
  owner: {
    id: '84',
    login: 'bity-labs',
    type: 'organization' as const,
    avatarUrl: 'https://avatars.githubusercontent.com/u/84?v=4'
  },
  repositorySelection: 'all' as const,
  status: 'usable' as const
}

function createAdapter(): GitHubInstallationsAdapter {
  return {
    async listInstallations() {
      return [personalInstallation, organizationInstallation]
    },
    async listInstallationRepositories(_accessToken, installationId) {
      if (installationId === '100') {
        return [
          {
            id: '1000',
            nodeId: 'R_1000',
            owner: 'octocat',
            name: 'hello-world',
            fullName: 'octocat/hello-world',
            isPrivate: false,
            defaultBranch: 'main',
            htmlUrl: 'https://github.com/octocat/hello-world',
            cloneUrl: 'https://github.com/octocat/hello-world.git'
          }
        ]
      }
      return [
        {
          id: '2000',
          nodeId: 'R_2000',
          owner: 'bity-labs',
          name: 'spacezero',
          fullName: 'bity-labs/spacezero',
          isPrivate: true,
          defaultBranch: 'main',
          htmlUrl: 'https://github.com/bity-labs/spacezero',
          cloneUrl: 'https://github.com/bity-labs/spacezero.git'
        }
      ]
    }
  }
}

describe('GitHub connection service', () => {
  it('connects only after aggregating a usable repository across installations', async () => {
    const service = createGitHubConnectionService({
      auth: { getAuthorizedCredential: async () => credential },
      adapter: createAdapter(),
      appSlug: 'space-zero',
      openExternal: async () => undefined
    })

    const connection = await service.getConnection()

    expect(connection).toMatchObject({
      status: 'connected',
      identity: credential.identity,
      installations: [
        expect.objectContaining({ id: '100', repositoryCount: 1 }),
        expect.objectContaining({ id: '200', repositoryCount: 1 })
      ],
      repositories: [
        expect.objectContaining({ id: '1000' }),
        expect.objectContaining({ id: '2000' })
      ]
    })
    expect(JSON.stringify(connection)).not.toContain('access-secret')
  })

  it('does not report connected when an installation has no accessible repository', async () => {
    const adapter = createAdapter()
    adapter.listInstallationRepositories = async () => []
    const service = createGitHubConnectionService({
      auth: { getAuthorizedCredential: async () => credential },
      adapter,
      appSlug: 'space-zero',
      openExternal: async () => undefined
    })

    await expect(service.getConnection()).resolves.toEqual({
      status: 'repository-access-required',
      identity: credential.identity,
      installations: [
        { ...personalInstallation, repositoryCount: 0, status: 'no-repositories' },
        { ...organizationInstallation, repositoryCount: 0, status: 'no-repositories' }
      ]
    })
  })

  it('represents pending organization approval without granting repository access', async () => {
    const adapter = createAdapter()
    adapter.listInstallations = async () => [
      {
        ...organizationInstallation,
        status: 'pending-approval'
      }
    ]
    const service = createGitHubConnectionService({
      auth: { getAuthorizedCredential: async () => credential },
      adapter,
      appSlug: 'space-zero',
      openExternal: async () => undefined
    })

    await expect(service.getConnection()).resolves.toEqual({
      status: 'pending-organization-approval',
      identity: credential.identity,
      installations: [
        { ...organizationInstallation, status: 'pending-approval', repositoryCount: 0 }
      ]
    })
  })

  it('transitions revoked authorization to reconnect required', async () => {
    const adapter = createAdapter()
    adapter.listInstallations = async () => {
      throw new GitHubIntegrationError('reconnect-required')
    }
    const service = createGitHubConnectionService({
      auth: { getAuthorizedCredential: async () => credential },
      adapter,
      appSlug: 'space-zero',
      openExternal: async () => undefined
    })

    await expect(service.getConnection()).resolves.toEqual({
      status: 'reconnect-required',
      identity: credential.identity
    })
  })

  it('reuses a recent repository snapshot for connection status', async () => {
    const adapter = createAdapter()
    const listInstallations = vi.spyOn(adapter, 'listInstallations')
    const listRepositories = vi.spyOn(adapter, 'listInstallationRepositories')
    let currentTime = 0
    const service = createGitHubConnectionService({
      auth: { getAuthorizedCredential: async () => credential },
      adapter,
      appSlug: 'space-zero',
      now: () => currentTime,
      openExternal: async () => undefined
    })

    await service.getConnection()
    await service.getConnection()

    expect(listInstallations).toHaveBeenCalledTimes(1)
    expect(listRepositories).toHaveBeenCalledTimes(2)

    currentTime += 60_000
    await service.getConnection()

    expect(listInstallations).toHaveBeenCalledTimes(2)
    expect(listRepositories).toHaveBeenCalledTimes(4)
  })

  it('revalidates changed grants every time repositories are queried', async () => {
    const adapter = createAdapter()
    let revoked = false
    adapter.listInstallationRepositories = async (_token, installationId) =>
      revoked ? [] : createAdapter().listInstallationRepositories('ignored', installationId)
    const service = createGitHubConnectionService({
      auth: { getAuthorizedCredential: async () => credential },
      adapter,
      appSlug: 'space-zero',
      openExternal: async () => undefined
    })

    await expect(service.listAuthorizedRepositories()).resolves.toHaveLength(2)
    revoked = true
    await expect(service.listAuthorizedRepositories()).resolves.toEqual([])
  })

  it('opens GitHub management separately from adding repository access', async () => {
    const opened: string[] = []
    const service = createGitHubConnectionService({
      auth: { getAuthorizedCredential: async () => credential },
      adapter: createAdapter(),
      appSlug: 'space-zero-dev',
      openExternal: async (url) => {
        opened.push(url)
      }
    })

    await service.openManageAccess()

    expect(opened).toEqual(['https://github.com/settings/installations'])
  })

  it('opens only the configured GitHub App installation URL', async () => {
    const opened: string[] = []
    const service = createGitHubConnectionService({
      auth: { getAuthorizedCredential: async () => credential },
      adapter: createAdapter(),
      appSlug: 'space-zero-dev',
      openExternal: async (url) => {
        opened.push(url)
      }
    })

    await service.openInstallation()

    expect(opened).toEqual(['https://github.com/apps/space-zero-dev/installations/new'])
  })

  it('accepts a configured GitHub App slug containing underscores', async () => {
    const opened: string[] = []
    const service = createGitHubConnectionService({
      auth: { getAuthorizedCredential: async () => credential },
      adapter: createAdapter(),
      appSlug: 'space_zero-dev',
      openExternal: async (url) => {
        opened.push(url)
      }
    })

    await service.openInstallation()

    expect(opened).toEqual(['https://github.com/apps/space_zero-dev/installations/new'])
  })
})
