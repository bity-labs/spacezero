import { describe, expect, it, vi } from 'vitest'

import type { Project } from '../../projects/shared'
import type { GitHubCloneProgress, GitHubRepository } from '../shared'
import {
  createGitHubRepositorySetupService,
  GitHubCloneCancelledError,
  type GitHubCloneAdapter
} from './github-repository-setup.service'

const repository: GitHubRepository = {
  id: '1000',
  nodeId: 'R_1000',
  installationId: '100',
  owner: 'bity-labs',
  name: 'spacezero',
  fullName: 'bity-labs/spacezero',
  isPrivate: true,
  defaultBranch: 'main',
  htmlUrl: 'https://github.com/bity-labs/spacezero',
  cloneUrl: 'https://github.com/bity-labs/spacezero.git'
}

const registeredProject: Project = {
  id: 'project-1',
  name: 'spacezero',
  path: '/home/tiby/SpaceZero/projects/bity-labs/spacezero',
  githubRepository: {
    repositoryId: '1000',
    nodeId: 'R_1000',
    owner: 'bity-labs',
    name: 'spacezero',
    fullName: 'bity-labs/spacezero',
    htmlUrl: 'https://github.com/bity-labs/spacezero',
    linkedAt: '2026-07-18T01:00:00.000Z'
  },
  createdAt: '2026-07-18T01:00:00.000Z',
  updatedAt: '2026-07-18T01:00:00.000Z'
}

const unlinkedProject: Project = {
  id: 'project-unlinked',
  name: 'Space Zero local',
  path: '/home/tiby/ws/dev/spacezero',
  createdAt: '2026-07-18T01:00:00.000Z',
  updatedAt: '2026-07-18T01:00:00.000Z'
}

const noRemotes = { listRemotes: async () => [] }
const unusedProjectLink = async () => registeredProject

function createCloneAdapter(): GitHubCloneAdapter & {
  requests: Array<{ destination: string; accessToken: string; cloneUrl: string }>
  removed: string[]
} {
  return {
    requests: [],
    removed: [],
    async clone({ repository, destination, accessToken, onProgress }) {
      this.requests.push({ destination, accessToken, cloneUrl: repository.cloneUrl })
      onProgress({ percent: 60 })
    },
    async removeDestination(destination) {
      this.removed.push(destination)
    }
  }
}

async function waitForTerminalEvent(
  start: (emit: (event: GitHubCloneProgress) => void) => Promise<unknown>
): Promise<{ result: unknown; events: GitHubCloneProgress[] }> {
  const events: GitHubCloneProgress[] = []
  let finish: (() => void) | undefined
  const terminal = new Promise<void>((resolve) => {
    finish = resolve
  })
  const result = await start((event) => {
    events.push(event)
    if (event.status === 'complete' || event.status === 'failed' || event.status === 'cancelled') {
      finish?.()
    }
  })
  await terminal
  return { result, events }
}

describe('GitHub repository setup service', () => {
  it('clones into managed owner/repository storage and registers only after success', async () => {
    const clone = createCloneAdapter()
    const registrations: unknown[] = []
    const service = createGitHubRepositorySetupService({
      repositories: { listAuthorizedRepositories: async () => [repository] },
      auth: {
        getAuthorizedCredential: async () => ({
          accessToken: 'access-secret',
          refreshToken: 'refresh-secret',
          accessTokenExpiresAt: '2026-07-18T02:00:00.000Z',
          refreshTokenExpiresAt: '2026-08-18T00:00:00.000Z',
          identity: {
            id: '42',
            login: 'octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
            profileUrl: 'https://github.com/octocat'
          }
        })
      },
      projects: {
        listProjects: async () => [],
        linkGitHubRepository: unusedProjectLink,
        registerGitHubProject: async (input) => {
          registrations.push(input)
          return registeredProject
        }
      },
      git: noRemotes,
      clone,
      getProjectsPath: async () => '/home/tiby/SpaceZero/projects',
      createOperationId: () => 'clone-1'
    })

    const { result, events } = await waitForTerminalEvent((emit) =>
      service.startClone({ repositoryId: '1000' }, emit)
    )

    expect(result).toEqual({ status: 'started', operationId: 'clone-1' })
    expect(clone.requests).toEqual([
      {
        destination: '/home/tiby/SpaceZero/projects/bity-labs/spacezero',
        accessToken: 'access-secret',
        cloneUrl: 'https://github.com/bity-labs/spacezero.git'
      }
    ])
    expect(registrations).toEqual([
      {
        name: 'spacezero',
        path: '/home/tiby/SpaceZero/projects/bity-labs/spacezero',
        repositoryId: '1000',
        nodeId: 'R_1000',
        owner: 'bity-labs',
        htmlUrl: 'https://github.com/bity-labs/spacezero'
      }
    ])
    expect(events.at(-1)).toMatchObject({
      operationId: 'clone-1',
      status: 'complete',
      projectId: 'project-1'
    })
    expect(JSON.stringify(events)).not.toContain('access-secret')
  })

  it('opens an already-associated Project instead of cloning it again', async () => {
    const clone = createCloneAdapter()
    const service = createGitHubRepositorySetupService({
      repositories: { listAuthorizedRepositories: async () => [repository] },
      auth: { getAuthorizedCredential: async () => Promise.reject(new Error('unused')) },
      projects: {
        listProjects: async () => [registeredProject],
        linkGitHubRepository: unusedProjectLink,
        registerGitHubProject: async () => Promise.reject(new Error('unused'))
      },
      git: noRemotes,
      clone,
      getProjectsPath: async () => '/home/tiby/SpaceZero/projects'
    })

    await expect(service.listSetupOptions()).resolves.toEqual([
      {
        repository,
        existingProject: { id: 'project-1', name: 'spacezero' }
      }
    ])
    await expect(service.startClone({ repositoryId: '1000' }, () => undefined)).resolves.toEqual({
      status: 'already-added',
      projectId: 'project-1'
    })
    expect(clone.requests).toEqual([])
  })

  it('links an unassociated registered Project whose remote exactly matches', async () => {
    const clone = createCloneAdapter()
    const linkGitHubRepository = vi.fn(async () => registeredProject)
    const service = createGitHubRepositorySetupService({
      repositories: { listAuthorizedRepositories: async () => [repository] },
      auth: { getAuthorizedCredential: async () => Promise.reject(new Error('unused')) },
      projects: {
        listProjects: async () => [unlinkedProject],
        linkGitHubRepository,
        registerGitHubProject: async () => Promise.reject(new Error('unused'))
      },
      git: {
        listRemotes: async () => ['git@github.com:bity-labs/spacezero.git']
      },
      clone,
      getProjectsPath: async () => '/home/tiby/SpaceZero/projects'
    })

    await expect(service.listSetupOptions()).resolves.toEqual([
      {
        repository,
        matchingProjects: [{ id: 'project-unlinked', name: 'Space Zero local' }]
      }
    ])
    await expect(service.startClone({ repositoryId: '1000' }, () => undefined)).resolves.toEqual({
      status: 'already-added',
      projectId: 'project-unlinked'
    })
    expect(linkGitHubRepository).toHaveBeenCalledWith('project-unlinked', {
      repositoryId: '1000',
      nodeId: 'R_1000',
      owner: 'bity-labs',
      name: 'spacezero',
      htmlUrl: 'https://github.com/bity-labs/spacezero'
    })
    expect(clone.requests).toEqual([])
  })

  it('requires an explicit matching Project selection when remote matches are ambiguous', async () => {
    const clone = createCloneAdapter()
    const secondProject = {
      ...unlinkedProject,
      id: 'project-unlinked-2',
      name: 'Space Zero backup',
      path: '/home/tiby/ws/archive/spacezero'
    }
    const linkGitHubRepository = vi.fn(async () => ({
      ...registeredProject,
      id: secondProject.id,
      name: secondProject.name,
      path: secondProject.path
    }))
    const service = createGitHubRepositorySetupService({
      repositories: { listAuthorizedRepositories: async () => [repository] },
      auth: { getAuthorizedCredential: async () => Promise.reject(new Error('unused')) },
      projects: {
        listProjects: async () => [unlinkedProject, secondProject],
        linkGitHubRepository,
        registerGitHubProject: async () => Promise.reject(new Error('unused'))
      },
      git: {
        listRemotes: async () => ['https://github.com/bity-labs/spacezero.git']
      },
      clone,
      getProjectsPath: async () => '/home/tiby/SpaceZero/projects'
    })

    await expect(service.listSetupOptions()).resolves.toEqual([
      {
        repository,
        matchingProjects: [
          { id: 'project-unlinked', name: 'Space Zero local' },
          { id: 'project-unlinked-2', name: 'Space Zero backup' }
        ]
      }
    ])
    await expect(service.startClone({ repositoryId: '1000' }, () => undefined)).rejects.toThrow(
      'github.ambiguousProjectRemoteMatch'
    )
    await expect(
      service.startClone(
        { repositoryId: '1000', existingProjectId: 'project-unlinked-2' },
        () => undefined
      )
    ).resolves.toEqual({ status: 'already-added', projectId: 'project-unlinked-2' })
    expect(linkGitHubRepository).toHaveBeenCalledWith(
      'project-unlinked-2',
      expect.objectContaining({ repositoryId: '1000' })
    )
    expect(clone.requests).toEqual([])
  })

  it('removes a completed clone when Project registration rolls back', async () => {
    const clone = createCloneAdapter()
    const service = createGitHubRepositorySetupService({
      repositories: { listAuthorizedRepositories: async () => [repository] },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'access-secret' }) as never },
      projects: {
        listProjects: async () => [],
        linkGitHubRepository: unusedProjectLink,
        registerGitHubProject: async () => {
          throw new Error('database constraint')
        }
      },
      git: noRemotes,
      clone,
      getProjectsPath: async () => '/home/tiby/SpaceZero/projects',
      createOperationId: () => 'clone-1'
    })

    const { events } = await waitForTerminalEvent((emit) =>
      service.startClone({ repositoryId: '1000' }, emit)
    )

    expect(clone.removed).toEqual(['/home/tiby/SpaceZero/projects/bity-labs/spacezero'])
    expect(events.at(-1)?.status).toBe('failed')
  })

  it('does not register a Project after the clone adapter rolls back a failure', async () => {
    const clone = createCloneAdapter()
    clone.clone = async () => {
      throw new Error('provider output with access-secret')
    }
    let registrations = 0
    const service = createGitHubRepositorySetupService({
      repositories: { listAuthorizedRepositories: async () => [repository] },
      auth: {
        getAuthorizedCredential: async () =>
          ({
            accessToken: 'access-secret'
          }) as never
      },
      projects: {
        listProjects: async () => [],
        linkGitHubRepository: unusedProjectLink,
        registerGitHubProject: async () => {
          registrations += 1
          return registeredProject
        }
      },
      git: noRemotes,
      clone,
      getProjectsPath: async () => '/home/tiby/SpaceZero/projects',
      createOperationId: () => 'clone-1'
    })

    const { events } = await waitForTerminalEvent((emit) =>
      service.startClone({ repositoryId: '1000' }, emit)
    )

    expect(registrations).toBe(0)
    expect(clone.removed).toEqual([])
    expect(events.at(-1)).toEqual({
      operationId: 'clone-1',
      status: 'failed',
      message: 'Clone failed. Check repository access, network, and destination, then retry.'
    })
    expect(JSON.stringify(events)).not.toContain('access-secret')
  })

  it('cancels an active clone without registering partial content', async () => {
    const clone = createCloneAdapter()
    clone.clone = ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new GitHubCloneCancelledError()), {
          once: true
        })
      })
    const service = createGitHubRepositorySetupService({
      repositories: { listAuthorizedRepositories: async () => [repository] },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'access-secret' }) as never },
      projects: {
        listProjects: async () => [],
        linkGitHubRepository: unusedProjectLink,
        registerGitHubProject: async () => registeredProject
      },
      git: noRemotes,
      clone,
      getProjectsPath: async () => '/home/tiby/SpaceZero/projects',
      createOperationId: () => 'clone-1'
    })
    const events: GitHubCloneProgress[] = []

    await service.startClone({ repositoryId: '1000' }, (event) => events.push(event))
    await service.cancelClone({ operationId: 'clone-1' })
    await vi.waitFor(() => expect(events.at(-1)?.status).toBe('cancelled'))

    expect(clone.removed).toEqual([])
  })
})
