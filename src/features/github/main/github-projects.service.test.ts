import { describe, expect, it } from 'vitest'

import type { ProjectsService } from '../../projects/main/projects.service'
import type { Project } from '../../projects/shared'
import type { GitHubRepository } from '../shared'
import { createGitHubProjectsService } from './github-projects.service'

const repositories: GitHubRepository[] = [
  {
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
  },
  {
    id: '2000',
    nodeId: 'R_2000',
    installationId: '200',
    owner: 'octocat',
    name: 'hello-world',
    fullName: 'octocat/hello-world',
    isPrivate: false,
    defaultBranch: 'main',
    htmlUrl: 'https://github.com/octocat/hello-world',
    cloneUrl: 'https://github.com/octocat/hello-world.git'
  }
]

function createProjectsBoundary(): Pick<ProjectsService, 'getProject' | 'linkGitHubRepository'> {
  let project: Project = {
    id: 'project-1',
    name: 'Space Zero',
    path: '/external/workspaces/spacezero',
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z'
  }

  return {
    async getProject(projectId) {
      if (projectId !== project.id) throw new Error('Project not found')
      return project
    },
    async linkGitHubRepository(projectId, association) {
      if (projectId !== project.id) throw new Error('Project not found')
      project = {
        ...project,
        githubRepository: {
          ...association,
          fullName: `${association.owner}/${association.name}`,
          linkedAt: '2026-07-18T01:00:00.000Z'
        },
        updatedAt: '2026-07-18T01:00:00.000Z'
      }
      return project
    }
  }
}

describe('GitHub Projects service', () => {
  it('suggests an exact canonical HTTPS/SSH remote match and persists stable identity only', async () => {
    const projects = createProjectsBoundary()
    const inspectedPaths: string[] = []
    const service = createGitHubProjectsService({
      projects,
      repositories: { listAuthorizedRepositories: async () => repositories },
      git: {
        async listRemotes(path) {
          inspectedPaths.push(path)
          return [
            'https://github.com/Bity-Labs/SpaceZero.git',
            'git@github.com:Bity-Labs/SpaceZero.git'
          ]
        }
      }
    })

    const options = await service.getLinkOptions({ projectId: 'project-1' })
    const linked = await service.linkProject({
      projectId: 'project-1',
      repositoryId: '1000'
    })

    expect(options).toMatchObject({
      suggestedRepositoryIds: ['1000'],
      ambiguous: false
    })
    expect(inspectedPaths).toEqual([
      '/external/workspaces/spacezero',
      '/external/workspaces/spacezero'
    ])
    expect(linked.path).toBe('/external/workspaces/spacezero')
    expect(linked.githubRepository).toEqual({
      repositoryId: '1000',
      nodeId: 'R_1000',
      owner: 'bity-labs',
      name: 'spacezero',
      fullName: 'bity-labs/spacezero',
      htmlUrl: 'https://github.com/bity-labs/spacezero',
      linkedAt: '2026-07-18T01:00:00.000Z'
    })
  })

  it('requires explicit confirmation when different remotes match multiple authorized repositories', async () => {
    const service = createGitHubProjectsService({
      projects: createProjectsBoundary(),
      repositories: { listAuthorizedRepositories: async () => repositories },
      git: {
        async listRemotes() {
          return [
            'git@github.com:bity-labs/spacezero.git',
            'https://github.com/octocat/hello-world.git'
          ]
        }
      }
    })

    await expect(
      service.linkProject({ projectId: 'project-1', repositoryId: '1000' })
    ).rejects.toThrow('github.ambiguousRemoteMatch')
    await expect(
      service.linkProject({
        projectId: 'project-1',
        repositoryId: '1000',
        confirmAmbiguous: true
      })
    ).resolves.toMatchObject({ githubRepository: { repositoryId: '1000' } })
  })

  it('fetches live metadata by stable ID and fails closed after a grant is revoked', async () => {
    let authorized = true
    const service = createGitHubProjectsService({
      projects: createProjectsBoundary(),
      repositories: {
        listAuthorizedRepositories: async () => (authorized ? repositories : [])
      },
      git: { listRemotes: async () => [] }
    })
    await service.linkProject({ projectId: 'project-1', repositoryId: '1000' })

    await expect(service.getLinkedRepository({ projectId: 'project-1' })).resolves.toEqual(
      repositories[0]
    )
    authorized = false
    await expect(service.getLinkedRepository({ projectId: 'project-1' })).rejects.toThrow(
      'github.repositoryAccessRevoked'
    )
  })

  it('rejects a stale or unauthorized repository selection', async () => {
    const service = createGitHubProjectsService({
      projects: createProjectsBoundary(),
      repositories: { listAuthorizedRepositories: async () => repositories.slice(0, 1) },
      git: { listRemotes: async () => [] }
    })

    await expect(
      service.linkProject({ projectId: 'project-1', repositoryId: '2000' })
    ).rejects.toThrow('github.repositoryNotAuthorized')
  })
})
