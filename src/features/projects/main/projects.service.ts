import { nanoid } from 'nanoid'

import type {
  CreateEmptyProjectRequest,
  GitHubRepositoryAssociation,
  Project,
  UpdateProjectRequest
} from '../shared/project.model'

export type StoredProject = {
  id: string
  name: string
  path: string
  knowledgeBasePath?: string | null
  githubRepositoryId?: string | null
  githubRepositoryNodeId?: string | null
  githubOwner?: string | null
  githubName?: string | null
  githubUrl?: string | null
  githubLinkedAt?: Date | null
  createdAt: Date
  updatedAt: Date
  archivedAt?: Date | null
}

export type ProjectsRepository = {
  list: () => Promise<StoredProject[]>
  create: (project: StoredProject) => Promise<StoredProject>
  update: (project: StoredProject) => Promise<StoredProject>
  findById: (id: string) => Promise<StoredProject | undefined>
  deleteById: (id: string) => Promise<void>
}

export type ProjectPathAdapter = {
  createEmptyProjectDirectory: (name: string) => Promise<string>
  chooseProjectFolder: () => Promise<
    { canceled: true } | { canceled: false; path: string; name: string }
  >
  normalizeProjectPath: (path: string) => string
}

export type Clock = () => Date

export type OptionalProjectLinkResult = {
  project: StoredProject
  warning?: string
}

export type LinkGitHubRepositoryInput = Omit<GitHubRepositoryAssociation, 'fullName' | 'linkedAt'>

export type ProjectsService = {
  listProjects: () => Promise<Project[]>
  getProject: (projectId: string) => Promise<Project>
  linkGitHubRepository: (
    projectId: string,
    association: LinkGitHubRepositoryInput
  ) => Promise<Project>
  createEmptyProject: (request: CreateEmptyProjectRequest) => Promise<Project>
  addProjectFromFolder: () => Promise<Project | null>
  updateProject: (request: UpdateProjectRequest) => Promise<Project>
  archiveProject: (projectId: string) => Promise<void>
  deleteProject: (projectId: string) => Promise<StoredProject>
}

export function createProjectsService({
  repository,
  pathAdapter,
  linkKnowledgeBaseProject = async (project) => ({ project }),
  now = () => new Date()
}: {
  repository: ProjectsRepository
  pathAdapter: ProjectPathAdapter
  linkKnowledgeBaseProject?: (project: StoredProject) => Promise<OptionalProjectLinkResult>
  now?: Clock
}): ProjectsService {
  async function linkOptionalKnowledgeBase(project: StoredProject): Promise<Project> {
    try {
      const result = await linkKnowledgeBaseProject(project)
      return toProject(result.project, result.warning)
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : 'Unknown linking error.'
      return toProject(
        project,
        `Project was added, but its Knowledge Base folder could not be linked. ${message}`
      )
    }
  }

  return {
    async listProjects() {
      return (await repository.list()).map((project) => toProject(project))
    },

    async getProject(projectId) {
      const project = await repository.findById(projectId.trim())
      if (!project) throw new Error('Project not found')
      return toProject(project)
    },

    async linkGitHubRepository(projectId, association) {
      const project = await repository.findById(projectId.trim())
      if (!project) throw new Error('Project not found')
      const linkedAt = now()
      return toProject(
        await repository.update({
          ...project,
          githubRepositoryId: association.repositoryId,
          githubRepositoryNodeId: association.nodeId,
          githubOwner: association.owner,
          githubName: association.name,
          githubUrl: association.htmlUrl,
          githubLinkedAt: linkedAt,
          updatedAt: linkedAt
        })
      )
    },

    async createEmptyProject(request) {
      const name = normalizeName(request.name)
      const path = await pathAdapter.createEmptyProjectDirectory(name)
      const timestamp = now()

      const project = await repository.create({
        id: nanoid(),
        name,
        path: pathAdapter.normalizeProjectPath(path),
        createdAt: timestamp,
        updatedAt: timestamp
      })
      return linkOptionalKnowledgeBase(project)
    },

    async addProjectFromFolder() {
      const folder = await pathAdapter.chooseProjectFolder()
      if (folder.canceled) return null

      const timestamp = now()
      const project = await repository.create({
        id: nanoid(),
        name: normalizeName(folder.name),
        path: pathAdapter.normalizeProjectPath(folder.path),
        createdAt: timestamp,
        updatedAt: timestamp
      })
      return linkOptionalKnowledgeBase(project)
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
    },

    async archiveProject(projectId) {
      const existing = await repository.findById(projectId.trim())
      if (!existing) throw new Error('Project not found')
      const timestamp = now()
      await repository.update({ ...existing, archivedAt: timestamp, updatedAt: timestamp })
    },

    async deleteProject(projectId) {
      const existing = await repository.findById(projectId.trim())
      if (!existing) throw new Error('Project not found')
      await repository.deleteById(existing.id)
      return existing
    }
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ')
  if (!normalized) throw new Error('Project name is required')
  return normalized
}

function toProject(project: StoredProject, setupWarning?: string): Project {
  const hasGitHubAssociation =
    project.githubRepositoryId &&
    project.githubRepositoryNodeId &&
    project.githubOwner &&
    project.githubName &&
    project.githubUrl &&
    project.githubLinkedAt

  return {
    id: project.id,
    name: project.name,
    path: project.path,
    ...(project.knowledgeBasePath ? { knowledgeBasePath: project.knowledgeBasePath } : {}),
    ...(setupWarning ? { setupWarning } : {}),
    ...(hasGitHubAssociation
      ? {
          githubRepository: {
            repositoryId: project.githubRepositoryId!,
            nodeId: project.githubRepositoryNodeId!,
            owner: project.githubOwner!,
            name: project.githubName!,
            fullName: `${project.githubOwner!}/${project.githubName!}`,
            htmlUrl: project.githubUrl!,
            linkedAt: project.githubLinkedAt!.toISOString()
          }
        }
      : {}),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  }
}
