import { resolve } from 'node:path'

import { nanoid } from 'nanoid'

import {
  withProjectLifecycleLock as runWithProjectLifecycleLock,
  type ProjectLifecycleLock
} from './project-lifecycle-lock'
import type {
  AddProjectFromFolderRequest,
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
  agentResourcesTrusted?: boolean
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

export type RegisterGitHubProjectInput = LinkGitHubRepositoryInput & {
  name: string
  path: string
  agentResourcesTrusted?: boolean
}

export type ProjectsService = {
  listProjects: () => Promise<Project[]>
  getProject: (projectId: string) => Promise<Project>
  linkGitHubRepository: (
    projectId: string,
    association: LinkGitHubRepositoryInput
  ) => Promise<Project>
  registerGitHubProject: (input: RegisterGitHubProjectInput) => Promise<Project>
  createEmptyProject: (request: CreateEmptyProjectRequest) => Promise<Project>
  addProjectFromFolder: (request?: AddProjectFromFolderRequest) => Promise<Project | null>
  updateProject: (request: UpdateProjectRequest) => Promise<Project>
  archiveProject: (projectId: string) => Promise<void>
  deleteProject: (projectId: string) => Promise<StoredProject>
}

export function createProjectsService({
  repository,
  pathAdapter,
  linkKnowledgeBaseProject = async (project) => ({ project }),
  hasManagedSessions = async () => false,
  withProjectLifecycleLock = runWithProjectLifecycleLock,
  now = () => new Date()
}: {
  repository: ProjectsRepository
  pathAdapter: ProjectPathAdapter
  linkKnowledgeBaseProject?: (project: StoredProject) => Promise<OptionalProjectLinkResult>
  hasManagedSessions?: (projectId: string) => Promise<boolean>
  withProjectLifecycleLock?: ProjectLifecycleLock
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
      const normalizedProjectId = projectId.trim()
      return withProjectLifecycleLock(normalizedProjectId, async () => {
        const project = await repository.findById(normalizedProjectId)
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
      })
    },

    async registerGitHubProject(input) {
      const timestamp = now()
      return toProject(
        await repository.create({
          id: nanoid(),
          name: normalizeName(input.name),
          path: pathAdapter.normalizeProjectPath(input.path),
          githubRepositoryId: input.repositoryId,
          githubRepositoryNodeId: input.nodeId,
          githubOwner: input.owner,
          githubName: input.name,
          githubUrl: input.htmlUrl,
          githubLinkedAt: timestamp,
          agentResourcesTrusted: input.agentResourcesTrusted === true,
          createdAt: timestamp,
          updatedAt: timestamp
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
        agentResourcesTrusted: request.agentResourcesTrusted === true,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      return linkOptionalKnowledgeBase(project)
    },

    async addProjectFromFolder(request = { agentResourcesTrusted: false }) {
      const folder = await pathAdapter.chooseProjectFolder()
      if (folder.canceled) return null

      const timestamp = now()
      const project = await repository.create({
        id: nanoid(),
        name: normalizeName(folder.name),
        path: pathAdapter.normalizeProjectPath(folder.path),
        agentResourcesTrusted: request.agentResourcesTrusted === true,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      return linkOptionalKnowledgeBase(project)
    },

    async updateProject(request) {
      const projectId = request.id.trim()
      return withProjectLifecycleLock(projectId, async () => {
        const existing = await repository.findById(projectId)
        if (!existing) throw new Error('Project not found')

        const requestedPath = request.path.trim()
        const normalizedPath = samePath(requestedPath, existing.path)
          ? existing.path
          : pathAdapter.normalizeProjectPath(requestedPath)
        if (!samePath(normalizedPath, existing.path) && (await hasManagedSessions(projectId))) {
          throw new Error('project.pathChangeBlockedByManagedSessions')
        }

        return toProject(
          await repository.update({
            ...existing,
            name: normalizeName(request.name),
            path: normalizedPath,
            ...(request.agentResourcesTrusted === undefined
              ? {}
              : { agentResourcesTrusted: request.agentResourcesTrusted === true }),
            updatedAt: now()
          })
        )
      })
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

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left)
  const normalizedRight = resolve(right)
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
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
    agentResourcesTrusted: project.agentResourcesTrusted === true,
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
