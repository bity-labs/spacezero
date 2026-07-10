import { nanoid } from 'nanoid'

import type {
  CreateEmptyProjectRequest,
  Project,
  UpdateProjectRequest
} from '../shared/project.model'

export type StoredProject = {
  id: string
  name: string
  path: string
  createdAt: Date
  updatedAt: Date
}

export type ProjectsRepository = {
  list: () => Promise<StoredProject[]>
  create: (project: StoredProject) => Promise<StoredProject>
  update: (project: StoredProject) => Promise<StoredProject>
  findById: (id: string) => Promise<StoredProject | undefined>
}

export type ProjectPathAdapter = {
  createEmptyProjectDirectory: (name: string) => Promise<string>
  chooseProjectFolder: () => Promise<{ canceled: true } | { canceled: false; path: string; name: string }>
  normalizeProjectPath: (path: string) => string
}

export type Clock = () => Date

export type ProjectsService = {
  listProjects: () => Promise<Project[]>
  createEmptyProject: (request: CreateEmptyProjectRequest) => Promise<Project>
  addProjectFromFolder: () => Promise<Project | null>
  updateProject: (request: UpdateProjectRequest) => Promise<Project>
}

export function createProjectsService({
  repository,
  pathAdapter,
  now = () => new Date()
}: {
  repository: ProjectsRepository
  pathAdapter: ProjectPathAdapter
  now?: Clock
}): ProjectsService {
  return {
    async listProjects() {
      return (await repository.list()).map(toProject)
    },

    async createEmptyProject(request) {
      const name = normalizeName(request.name)
      const path = await pathAdapter.createEmptyProjectDirectory(name)
      const timestamp = now()

      return toProject(
        await repository.create({
          id: nanoid(),
          name,
          path: pathAdapter.normalizeProjectPath(path),
          createdAt: timestamp,
          updatedAt: timestamp
        })
      )
    },

    async addProjectFromFolder() {
      const folder = await pathAdapter.chooseProjectFolder()
      if (folder.canceled) return null

      const timestamp = now()
      return toProject(
        await repository.create({
          id: nanoid(),
          name: normalizeName(folder.name),
          path: pathAdapter.normalizeProjectPath(folder.path),
          createdAt: timestamp,
          updatedAt: timestamp
        })
      )
    },

    async updateProject(request) {
      const existing = await repository.findById(request.id.trim())
      if (!existing) throw new Error('Project not found')

      return toProject(
        await repository.update({
          ...existing,
          name: normalizeName(request.name),
          path: pathAdapter.normalizeProjectPath(request.path),
          updatedAt: now()
        })
      )
    }
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ')
  if (!normalized) throw new Error('Project name is required')
  return normalized
}

function toProject(project: StoredProject): Project {
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  }
}
