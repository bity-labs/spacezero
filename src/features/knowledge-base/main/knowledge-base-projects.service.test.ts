import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StoredProject } from '../../projects/main/projects.service'
import type { KnowledgeBaseStatus } from '../shared'
import {
  createKnowledgeBaseProjectFolderHost,
  createKnowledgeBaseProjectsService as createKnowledgeBaseProjectsServiceImplementation,
  createProjectKnowledgeReadme,
  slugifyProjectName
} from './knowledge-base-projects.service'

const temporaryDirectories: string[] = []

async function createRoot(): Promise<string> {
  const rootPath = await mkdtemp(join(tmpdir(), 'spacezero-kb-projects-'))
  temporaryDirectories.push(rootPath)
  return rootPath
}

function createProject(id: string, name: string): StoredProject {
  const createdAt = new Date(0)
  return {
    id,
    name,
    path: `/workspace/${id}`,
    createdAt,
    updatedAt: createdAt
  }
}

function createProjectsRepository(initialProjects: StoredProject[]) {
  let projects = [...initialProjects]
  return {
    async list() {
      return projects
    },
    async update(project: StoredProject) {
      projects = projects.map((item) => (item.id === project.id ? project : item))
      return project
    },
    get projects() {
      return projects
    }
  }
}

function createKnowledgeBaseStatusReader(
  rootPath?: string
): () => Promise<KnowledgeBaseStatus> {
  return async () =>
    rootPath
      ? { setupState: 'configured', rootPath }
      : { setupState: 'unconfigured' }
}

function createKnowledgeBaseProjectsService({
  getKnowledgeBaseStatus,
  ...options
}: Omit<
  Parameters<typeof createKnowledgeBaseProjectsServiceImplementation>[0],
  'rootProvider'
> & {
  getKnowledgeBaseStatus: () => Promise<KnowledgeBaseStatus>
}) {
  return createKnowledgeBaseProjectsServiceImplementation({
    ...options,
    rootProvider: {
      getStatus: getKnowledgeBaseStatus,
      async getVerifiedRoot() {
        const status = await getKnowledgeBaseStatus()
        if (status.setupState !== 'configured') {
          throw new Error('Knowledge Base is unavailable.')
        }
        return status.rootPath
      }
    }
  })
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe('createKnowledgeBaseProjectsService', () => {
  it('backfills project folders, starter indexes, and app-owned links for existing projects', async () => {
    const rootPath = await createRoot()
    const projectsRepository = createProjectsRepository([
      createProject('project-1', 'Space Zero'),
      createProject('project-2', 'Café Builder')
    ])
    const service = createKnowledgeBaseProjectsService({
      getKnowledgeBaseStatus: createKnowledgeBaseStatusReader(rootPath),
      projectsRepository,
      host: createKnowledgeBaseProjectFolderHost()
    })

    await expect(service.linkExistingProjects()).resolves.toMatchObject({
      warning: undefined
    })

    expect(projectsRepository.projects.map((project) => project.knowledgeBasePath)).toEqual([
      join(rootPath, 'projects', 'space-zero'),
      join(rootPath, 'projects', 'cafe-builder')
    ])
    await expect(
      readFile(join(rootPath, 'projects', 'space-zero', 'README.md'), 'utf8')
    ).resolves.toBe(createProjectKnowledgeReadme('Space Zero'))
  })

  it('does not recreate a persisted Knowledge Base root that is unavailable', async () => {
    const rootPath = await createRoot()
    await rm(rootPath, { recursive: true })
    const project = createProject('project-1', 'Space Zero')
    const projectsRepository = createProjectsRepository([project])
    const host = createKnowledgeBaseProjectFolderHost()
    const ensureProjectDirectory = vi.spyOn(host, 'ensureProjectDirectory')
    const service = createKnowledgeBaseProjectsService({
      getKnowledgeBaseStatus: async () => ({
        setupState: 'unavailable',
        rootPath,
        reason: 'missing'
      }),
      projectsRepository,
      host
    })

    await expect(service.linkProject(project)).resolves.toMatchObject({
      project,
      warning: expect.stringContaining('Knowledge Base is unavailable')
    })
    expect(ensureProjectDirectory).not.toHaveBeenCalled()
    await expect(readFile(join(rootPath, 'projects', 'space-zero', 'README.md'))).rejects.toThrow()
  })

  it('does not recreate the Knowledge Base if it disappears while a project is linking', async () => {
    const rootPath = await createRoot()
    await rm(rootPath, { recursive: true })
    const project = createProject('project-1', 'Space Zero')
    const service = createKnowledgeBaseProjectsService({
      getKnowledgeBaseStatus: createKnowledgeBaseStatusReader(rootPath),
      projectsRepository: createProjectsRepository([project]),
      host: createKnowledgeBaseProjectFolderHost()
    })

    await expect(service.linkProject(project)).resolves.toMatchObject({
      project,
      warning: expect.any(String)
    })
    await expect(readFile(join(rootPath, 'projects', 'space-zero', 'README.md'))).rejects.toThrow()
  })

  it('does not follow a symlinked projects directory outside the Knowledge Base', async () => {
    const rootPath = await createRoot()
    const outsidePath = await mkdtemp(join(tmpdir(), 'spacezero-kb-outside-projects-'))
    temporaryDirectories.push(outsidePath)
    await symlink(outsidePath, join(rootPath, 'projects'))
    const project = createProject('project-1', 'Space Zero')
    const projectsRepository = createProjectsRepository([project])
    const service = createKnowledgeBaseProjectsService({
      getKnowledgeBaseStatus: createKnowledgeBaseStatusReader(rootPath),
      projectsRepository,
      host: createKnowledgeBaseProjectFolderHost()
    })

    await expect(service.linkProject(project)).resolves.toMatchObject({
      project,
      warning: expect.stringContaining('outside the configured root')
    })
    await expect(readFile(join(outsidePath, 'space-zero', 'README.md'))).rejects.toThrow()
    expect(projectsRepository.projects[0]?.knowledgeBasePath).toBeUndefined()
  })

  it('assigns stable distinct folders to projects with duplicate names', async () => {
    const rootPath = await createRoot()
    const projectsRepository = createProjectsRepository([
      createProject('project-1', 'Space Zero'),
      createProject('project-2', 'Space Zero')
    ])
    const service = createKnowledgeBaseProjectsService({
      getKnowledgeBaseStatus: createKnowledgeBaseStatusReader(rootPath),
      projectsRepository,
      host: createKnowledgeBaseProjectFolderHost()
    })

    await service.linkExistingProjects()

    const [firstPath, secondPath] = projectsRepository.projects.map(
      (project) => project.knowledgeBasePath
    )
    expect(firstPath).toBe(join(rootPath, 'projects', 'space-zero'))
    expect(secondPath).toMatch(
      new RegExp(`^${escapeRegularExpression(join(rootPath, 'projects', 'space-zero-'))}`)
    )
    expect(secondPath).not.toBe(firstPath)
  })

  it('does not collapse multiple non-Latin project names into one folder', async () => {
    const rootPath = await createRoot()
    const projectsRepository = createProjectsRepository([
      createProject('project-ja', '日本語'),
      createProject('project-ko', '한국어')
    ])
    const service = createKnowledgeBaseProjectsService({
      getKnowledgeBaseStatus: createKnowledgeBaseStatusReader(rootPath),
      projectsRepository,
      host: createKnowledgeBaseProjectFolderHost()
    })

    await service.linkExistingProjects()

    const linkedPaths = projectsRepository.projects.map((project) => project.knowledgeBasePath)
    expect(new Set(linkedPaths).size).toBe(2)
    expect(linkedPaths[0]).toBe(join(rootPath, 'projects', 'project'))
    expect(linkedPaths[1]).toMatch(
      new RegExp(`^${escapeRegularExpression(join(rootPath, 'projects', 'project-'))}`)
    )
  })

  it('links a newly created project when the Knowledge Base is configured', async () => {
    const rootPath = await createRoot()
    const project = createProject('project-1', 'Agent Workspace')
    const projectsRepository = createProjectsRepository([project])
    const service = createKnowledgeBaseProjectsService({
      getKnowledgeBaseStatus: createKnowledgeBaseStatusReader(rootPath),
      projectsRepository,
      host: createKnowledgeBaseProjectFolderHost()
    })

    await expect(service.linkProject(project)).resolves.toMatchObject({
      project: {
        knowledgeBasePath: join(rootPath, 'projects', 'agent-workspace')
      },
      warning: undefined
    })
  })

  it('reuses existing project folders without overwriting an existing README', async () => {
    const rootPath = await createRoot()
    const projectFolder = join(rootPath, 'projects', 'space-zero')
    await mkdir(projectFolder, { recursive: true })
    await writeFile(join(projectFolder, 'README.md'), '# My existing index\n')
    const project = createProject('project-1', 'Space Zero')
    const projectsRepository = createProjectsRepository([project])
    const service = createKnowledgeBaseProjectsService({
      getKnowledgeBaseStatus: createKnowledgeBaseStatusReader(rootPath),
      projectsRepository,
      host: createKnowledgeBaseProjectFolderHost()
    })

    await service.linkProject(project)

    await expect(readFile(join(projectFolder, 'README.md'), 'utf8')).resolves.toBe(
      '# My existing index\n'
    )
    expect(projectsRepository.projects[0]?.knowledgeBasePath).toBe(projectFolder)
  })

  it('leaves project creation metadata alone when the Knowledge Base is optional and unconfigured', async () => {
    const project = createProject('project-1', 'Space Zero')
    const projectsRepository = createProjectsRepository([project])
    const service = createKnowledgeBaseProjectsService({
      getKnowledgeBaseStatus: createKnowledgeBaseStatusReader(),
      projectsRepository,
      host: createKnowledgeBaseProjectFolderHost()
    })

    await expect(service.linkProject(project)).resolves.toEqual({
      project,
      warning: undefined
    })
    expect(projectsRepository.projects[0]?.knowledgeBasePath).toBeUndefined()
  })

  it('returns a non-blocking warning when a project folder cannot be linked', async () => {
    const rootPath = await createRoot()
    const project = createProject('project-1', 'Space Zero')
    const projectsRepository = createProjectsRepository([project])
    const host = createKnowledgeBaseProjectFolderHost()
    host.ensureProjectDirectory = vi.fn(async () => {
      throw new Error('Permission denied')
    })
    const service = createKnowledgeBaseProjectsService({
      getKnowledgeBaseStatus: createKnowledgeBaseStatusReader(rootPath),
      projectsRepository,
      host
    })

    await expect(service.linkProject(project)).resolves.toEqual({
      project,
      warning:
        'Could not link the Knowledge Base folder for "Space Zero". Permission denied'
    })
    expect(projectsRepository.projects[0]?.knowledgeBasePath).toBeUndefined()
  })

  it('keeps setup successful and reports backfill failures separately', async () => {
    const rootPath = await createRoot()
    const project = createProject('project-1', 'Space Zero')
    const projectsRepository = createProjectsRepository([project])
    const host = createKnowledgeBaseProjectFolderHost()
    host.ensureProjectDirectory = vi.fn(async () => {
      throw new Error('Knowledge Base is read-only')
    })
    const service = createKnowledgeBaseProjectsService({
      getKnowledgeBaseStatus: createKnowledgeBaseStatusReader(rootPath),
      projectsRepository,
      host
    })

    await expect(service.linkExistingProjects()).resolves.toEqual({
      projects: [project],
      warning:
        'Could not link the Knowledge Base folder for "Space Zero". Knowledge Base is read-only'
    })
  })
})

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('slugifyProjectName', () => {
  it('creates stable project-folder slugs from names', () => {
    expect(slugifyProjectName('  Café & Agent Workspace  ')).toBe('cafe-agent-workspace')
    expect(slugifyProjectName('日本語')).toBe('project')
  })
})
