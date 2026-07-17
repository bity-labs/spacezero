import { describe, expect, it, vi } from 'vitest'

import {
  createProjectsService,
  type ProjectsRepository,
  type StoredProject
} from './projects.service'

function createMemoryRepository(initialProjects: StoredProject[] = []): ProjectsRepository {
  let projects = [...initialProjects]

  return {
    async list() {
      return [...projects]
        .filter((project) => !project.archivedAt)
        .sort((left, right) => left.name.localeCompare(right.name))
    },
    async create(project) {
      projects.push(project)
      return project
    },
    async update(project) {
      projects = projects.map((existing) => (existing.id === project.id ? project : existing))
      return project
    },
    async findById(id) {
      return projects.find((project) => project.id === id)
    },
    async deleteById(id) {
      projects = projects.filter((project) => project.id !== id)
    }
  }
}

describe('createProjectsService', () => {
  it('archives projects so active lists no longer include them', async () => {
    const createdAt = new Date('2026-07-10T00:00:00.000Z')
    const archivedAt = new Date('2026-07-11T00:00:00.000Z')
    const service = createProjectsService({
      repository: createMemoryRepository([
        {
          id: 'project-1',
          name: 'Space Zero',
          path: '/tmp/spacezero',
          createdAt,
          updatedAt: createdAt
        }
      ]),
      now: () => archivedAt,
      pathAdapter: {
        createEmptyProjectDirectory: async () => '/tmp/unused',
        chooseProjectFolder: async () => ({ canceled: true }),
        normalizeProjectPath: (path) => path
      }
    })

    await service.archiveProject('project-1')

    await expect(service.listProjects()).resolves.toEqual([])
  })

  it('deletes project metadata', async () => {
    const createdAt = new Date('2026-07-10T00:00:00.000Z')
    const service = createProjectsService({
      repository: createMemoryRepository([
        {
          id: 'project-1',
          name: 'Space Zero',
          path: '/tmp/spacezero',
          createdAt,
          updatedAt: createdAt
        }
      ]),
      pathAdapter: {
        createEmptyProjectDirectory: async () => '/tmp/unused',
        chooseProjectFolder: async () => ({ canceled: true }),
        normalizeProjectPath: (path) => path
      }
    })

    await expect(service.deleteProject('project-1')).resolves.toMatchObject({ id: 'project-1' })
    await expect(service.listProjects()).resolves.toEqual([])
  })

  it('creates an empty project with normalized metadata and generated path', async () => {
    const now = new Date('2026-07-10T00:00:00.000Z')
    const service = createProjectsService({
      repository: createMemoryRepository(),
      now: () => now,
      pathAdapter: {
        createEmptyProjectDirectory: async (name) =>
          `/tmp/${name.toLowerCase().replaceAll(' ', '-')}`,
        chooseProjectFolder: async () => ({ canceled: true }),
        normalizeProjectPath: (path) => path
      }
    })

    const project = await service.createEmptyProject({ name: '  Agent   Workspace  ' })

    expect(project).toMatchObject({
      name: 'Agent Workspace',
      path: '/tmp/agent-workspace',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })
    expect(await service.listProjects()).toEqual([project])
  })

  it('keeps project creation successful when optional Knowledge Base linking fails', async () => {
    const service = createProjectsService({
      repository: createMemoryRepository(),
      linkKnowledgeBaseProject: async () => {
        throw new Error('Knowledge Base is read-only')
      },
      pathAdapter: {
        createEmptyProjectDirectory: async () => '/tmp/agent-workspace',
        chooseProjectFolder: async () => ({ canceled: true }),
        normalizeProjectPath: (path) => path
      }
    })

    await expect(service.createEmptyProject({ name: 'Agent Workspace' })).resolves.toMatchObject({
      name: 'Agent Workspace',
      setupWarning:
        'Project was added, but its Knowledge Base folder could not be linked. Knowledge Base is read-only'
    })
    await expect(service.listProjects()).resolves.toEqual([
      expect.objectContaining({ name: 'Agent Workspace' })
    ])
  })

  it('links newly created projects to an optional Knowledge Base integration', async () => {
    const linkedPath = '/knowledge/projects/agent-workspace'
    const linkKnowledgeBaseProject = vi.fn(async (project: StoredProject) => ({
      project: {
        ...project,
        knowledgeBasePath: linkedPath
      }
    }))
    const service = createProjectsService({
      repository: createMemoryRepository(),
      linkKnowledgeBaseProject,
      pathAdapter: {
        createEmptyProjectDirectory: async () => '/tmp/agent-workspace',
        chooseProjectFolder: async () => ({ canceled: true }),
        normalizeProjectPath: (path) => path
      }
    })

    await expect(service.createEmptyProject({ name: 'Agent Workspace' })).resolves.toMatchObject({
      knowledgeBasePath: linkedPath
    })
    expect(linkKnowledgeBaseProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Agent Workspace' })
    )
  })

  it('links imported project folders when the Knowledge Base is configured', async () => {
    const linkKnowledgeBaseProject = vi.fn(async (project: StoredProject) => ({
      project: {
        ...project,
        knowledgeBasePath: '/knowledge/projects/existing-folder'
      }
    }))
    const service = createProjectsService({
      repository: createMemoryRepository(),
      linkKnowledgeBaseProject,
      pathAdapter: {
        createEmptyProjectDirectory: async () => '/tmp/unused',
        chooseProjectFolder: async () => ({
          canceled: false,
          path: '/tmp/existing-folder',
          name: 'Existing Folder'
        }),
        normalizeProjectPath: (path) => path
      }
    })

    await expect(service.addProjectFromFolder()).resolves.toMatchObject({
      knowledgeBasePath: '/knowledge/projects/existing-folder'
    })
    expect(linkKnowledgeBaseProject).toHaveBeenCalledOnce()
  })

  it('keeps project import successful when optional Knowledge Base linking fails', async () => {
    const service = createProjectsService({
      repository: createMemoryRepository(),
      linkKnowledgeBaseProject: async () => {
        throw new Error('Knowledge Base folder cannot be created')
      },
      pathAdapter: {
        createEmptyProjectDirectory: async () => '/tmp/unused',
        chooseProjectFolder: async () => ({
          canceled: false,
          path: '/tmp/existing-folder',
          name: 'Existing Folder'
        }),
        normalizeProjectPath: (path) => path
      }
    })

    await expect(service.addProjectFromFolder()).resolves.toMatchObject({
      name: 'Existing Folder',
      setupWarning:
        'Project was added, but its Knowledge Base folder could not be linked. Knowledge Base folder cannot be created'
    })
    await expect(service.listProjects()).resolves.toEqual([
      expect.objectContaining({ name: 'Existing Folder' })
    ])
  })

  it('links stable GitHub repository metadata without changing the Project path', async () => {
    const createdAt = new Date('2026-07-10T00:00:00.000Z')
    const linkedAt = new Date('2026-07-18T01:00:00.000Z')
    const service = createProjectsService({
      repository: createMemoryRepository([
        {
          id: 'project-1',
          name: 'Space Zero',
          path: '/external/workspaces/spacezero',
          createdAt,
          updatedAt: createdAt
        }
      ]),
      now: () => linkedAt,
      pathAdapter: {
        createEmptyProjectDirectory: async () => '/tmp/unused',
        chooseProjectFolder: async () => ({ canceled: true }),
        normalizeProjectPath: (path) => path
      }
    })

    await expect(
      service.linkGitHubRepository('project-1', {
        repositoryId: '1000',
        nodeId: 'R_1000',
        owner: 'bity-labs',
        name: 'spacezero',
        htmlUrl: 'https://github.com/bity-labs/spacezero'
      })
    ).resolves.toMatchObject({
      path: '/external/workspaces/spacezero',
      githubRepository: {
        repositoryId: '1000',
        nodeId: 'R_1000',
        fullName: 'bity-labs/spacezero',
        linkedAt: linkedAt.toISOString()
      }
    })
  })

  it('registers a cloned GitHub repository only after receiving its final path', async () => {
    const now = new Date('2026-07-18T01:00:00.000Z')
    const service = createProjectsService({
      repository: createMemoryRepository(),
      now: () => now,
      pathAdapter: {
        createEmptyProjectDirectory: async () => '/tmp/unused',
        chooseProjectFolder: async () => ({ canceled: true }),
        normalizeProjectPath: (path) => path
      }
    })

    await expect(
      service.registerGitHubProject({
        name: 'spacezero',
        path: '/home/tiby/SpaceZero/projects/bity-labs/spacezero',
        repositoryId: '1000',
        nodeId: 'R_1000',
        owner: 'bity-labs',
        htmlUrl: 'https://github.com/bity-labs/spacezero'
      })
    ).resolves.toMatchObject({
      name: 'spacezero',
      path: '/home/tiby/SpaceZero/projects/bity-labs/spacezero',
      githubRepository: {
        repositoryId: '1000',
        fullName: 'bity-labs/spacezero'
      },
      createdAt: now.toISOString()
    })
  })

  it('returns null when folder selection is canceled', async () => {
    const service = createProjectsService({
      repository: createMemoryRepository(),
      pathAdapter: {
        createEmptyProjectDirectory: async () => '/tmp/unused',
        chooseProjectFolder: async () => ({ canceled: true }),
        normalizeProjectPath: (path) => path
      }
    })

    await expect(service.addProjectFromFolder()).resolves.toBeNull()
    await expect(service.listProjects()).resolves.toEqual([])
  })

  it('updates an existing project name and path', async () => {
    const createdAt = new Date('2026-07-10T00:00:00.000Z')
    const updatedAt = new Date('2026-07-10T01:00:00.000Z')
    const service = createProjectsService({
      repository: createMemoryRepository([
        {
          id: 'project-1',
          name: 'Space Zero',
          path: '/tmp/spacezero',
          createdAt,
          updatedAt: createdAt
        }
      ]),
      now: () => updatedAt,
      pathAdapter: {
        createEmptyProjectDirectory: async () => '/tmp/unused',
        chooseProjectFolder: async () => ({ canceled: true }),
        normalizeProjectPath: (path) => path.trim()
      }
    })

    await expect(
      service.updateProject({
        id: 'project-1',
        name: '  Space Zero Desktop ',
        path: ' /tmp/spacezero-desktop '
      })
    ).resolves.toEqual({
      id: 'project-1',
      name: 'Space Zero Desktop',
      path: '/tmp/spacezero-desktop',
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString()
    })
  })
})
