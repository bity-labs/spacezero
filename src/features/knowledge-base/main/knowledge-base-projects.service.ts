import { createHash } from 'node:crypto'
import { lstat, mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { StoredProject } from '../../projects/main/projects.service'
import type { KnowledgeBaseStatus } from '../shared'

export type KnowledgeBaseProjectsRepository = {
  list: () => Promise<StoredProject[]>
  update: (project: StoredProject) => Promise<StoredProject>
}

export type KnowledgeBaseProjectFolderHost = {
  getPathKind: (path: string) => Promise<'missing' | 'file' | 'folder'>
  createDirectory: (path: string) => Promise<void>
  writeTextFile: (path: string, content: string) => Promise<void>
}

export type KnowledgeBaseProjectLinkResult = {
  project: StoredProject
  warning?: string
}

export type KnowledgeBaseExistingProjectsLinkResult = {
  projects: StoredProject[]
  warning?: string
}

export type KnowledgeBaseProjectsService = {
  linkExistingProjects: () => Promise<KnowledgeBaseExistingProjectsLinkResult>
  linkProject: (project: StoredProject) => Promise<KnowledgeBaseProjectLinkResult>
  clearProjectLinks: () => Promise<void>
}

export function createKnowledgeBaseProjectsService({
  getKnowledgeBaseStatus,
  projectsRepository,
  host,
  now = () => new Date()
}: {
  getKnowledgeBaseStatus: () => Promise<KnowledgeBaseStatus>
  projectsRepository: KnowledgeBaseProjectsRepository
  host: KnowledgeBaseProjectFolderHost
  now?: () => Date
}): KnowledgeBaseProjectsService {
  async function linkProject(project: StoredProject): Promise<StoredProject> {
    const status = await getKnowledgeBaseStatus()
    if (status.setupState === 'unconfigured') return project
    if (status.setupState === 'unavailable') {
      throw new Error(`Knowledge Base is unavailable at ${status.rootPath}.`)
    }

    const projectFolder = chooseProjectFolder(
      status.rootPath,
      project,
      await projectsRepository.list()
    )
    const pathKind = await host.getPathKind(projectFolder)
    if (pathKind === 'file') {
      throw new Error(`Project Knowledge Base path is not a folder: ${projectFolder}`)
    }
    if (pathKind === 'missing') {
      await host.createDirectory(projectFolder)
      await host.writeTextFile(
        join(projectFolder, 'README.md'),
        createProjectKnowledgeReadme(project.name)
      )
    }

    if (project.knowledgeBasePath === projectFolder) return project
    return projectsRepository.update({
      ...project,
      knowledgeBasePath: projectFolder,
      updatedAt: now()
    })
  }

  async function safelyLinkProject(
    project: StoredProject
  ): Promise<KnowledgeBaseProjectLinkResult> {
    try {
      return { project: await linkProject(project), warning: undefined }
    } catch (error) {
      return {
        project,
        warning: createProjectLinkWarning(project, error)
      }
    }
  }

  return {
    async linkExistingProjects() {
      let projects: StoredProject[]
      try {
        projects = await projectsRepository.list()
      } catch (error) {
        return {
          projects: [],
          warning: `Knowledge Base was configured, but existing projects could not be linked. ${getErrorMessage(error)}`
        }
      }

      const linkedProjects: StoredProject[] = []
      const warnings: string[] = []
      for (const project of projects) {
        const result = await safelyLinkProject(project)
        linkedProjects.push(result.project)
        if (result.warning) warnings.push(result.warning)
      }
      return {
        projects: linkedProjects,
        warning: warnings.length > 0 ? warnings.join(' ') : undefined
      }
    },
    linkProject: safelyLinkProject,
    async clearProjectLinks() {
      const projects = await projectsRepository.list()
      for (const project of projects) {
        if (!project.knowledgeBasePath) continue
        await projectsRepository.update({
          ...project,
          knowledgeBasePath: null,
          updatedAt: now()
        })
      }
    }
  }
}

function createProjectLinkWarning(project: StoredProject, error: unknown): string {
  return `Could not link the Knowledge Base folder for "${project.name}". ${getErrorMessage(error)}`
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Unknown linking error.'
}

function chooseProjectFolder(
  rootPath: string,
  project: StoredProject,
  projects: StoredProject[]
): string {
  const projectsRoot = join(rootPath, 'projects')
  if (
    project.knowledgeBasePath &&
    isPathWithinRoot(projectsRoot, project.knowledgeBasePath) &&
    isProjectFolderAvailable(project.knowledgeBasePath, project.id, projects)
  ) {
    return project.knowledgeBasePath
  }

  const baseSlug = slugifyProjectName(project.name)
  const baseFolder = join(projectsRoot, baseSlug)
  if (isProjectFolderAvailable(baseFolder, project.id, projects)) return baseFolder

  const idSuffix = createHash('sha256').update(project.id).digest('hex')
  for (const suffixLength of [8, 12, 16, idSuffix.length]) {
    const candidate = join(projectsRoot, `${baseSlug}-${idSuffix.slice(0, suffixLength)}`)
    if (isProjectFolderAvailable(candidate, project.id, projects)) return candidate
  }

  throw new Error(`Could not allocate a unique Knowledge Base folder for "${project.name}".`)
}

function isProjectFolderAvailable(
  candidate: string,
  projectId: string,
  projects: StoredProject[]
): boolean {
  const owner = projects.find(
    (project) =>
      project.knowledgeBasePath && resolve(project.knowledgeBasePath) === resolve(candidate)
  )
  return !owner || owner.id === projectId
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const pathFromRoot = relative(resolve(rootPath), resolve(targetPath))
  return (
    pathFromRoot === '' ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot))
  )
}

export function createKnowledgeBaseProjectFolderHost(): KnowledgeBaseProjectFolderHost {
  return {
    async getPathKind(path) {
      try {
        const details = await lstat(path)
        return details.isDirectory() ? 'folder' : 'file'
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') return 'missing'
        throw error
      }
    },
    async createDirectory(path) {
      try {
        await mkdir(dirname(path))
      } catch (error) {
        if (!isNodeError(error) || error.code !== 'EEXIST') throw error
      }
      await mkdir(path)
    },
    async writeTextFile(path, content) {
      await writeFile(path, content, { encoding: 'utf8', flag: 'wx' })
    }
  }
}

export function slugifyProjectName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'project'
}

export function createProjectKnowledgeReadme(projectName: string): string {
  return `# ${projectName}\n\nProject knowledge for ${projectName}.\n\nUse this file as an index for durable notes, decisions, architecture context, debugging notes, and handoff summaries related to this project.\n`
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
