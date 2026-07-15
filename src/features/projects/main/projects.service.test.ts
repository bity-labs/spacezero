import { describe, expect, it } from 'vitest'

import { createProjectsService, type ProjectsRepository, type StoredProject } from './projects.service'

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
        { id: 'project-1', name: 'Space Zero', path: '/tmp/spacezero', createdAt, updatedAt: createdAt }
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
        { id: 'project-1', name: 'Space Zero', path: '/tmp/spacezero', createdAt, updatedAt: createdAt }
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
        createEmptyProjectDirectory: async (name) => `/tmp/${name.toLowerCase().replaceAll(' ', '-')}`,
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
