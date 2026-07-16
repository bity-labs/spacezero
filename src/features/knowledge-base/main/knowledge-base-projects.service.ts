import { lstat, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { StoredProject } from '../../projects/main/projects.service'
import type { KnowledgeBaseConfigurationRepository } from './knowledge-base.service'

export type KnowledgeBaseProjectsRepository = {
  list: () => Promise<StoredProject[]>
  update: (project: StoredProject) => Promise<StoredProject>
}

export type KnowledgeBaseProjectFolderHost = {
  getPathKind: (path: string) => Promise<'missing' | 'file' | 'folder'>
  createDirectory: (path: string) => Promise<void>
  writeTextFile: (path: string, content: string) => Promise<void>
}

export type KnowledgeBaseProjectsService = {
  linkExistingProjects: () => Promise<StoredProject[]>
  linkProject: (project: StoredProject) => Promise<StoredProject>
}

export function createKnowledgeBaseProjectsService({
  configurationRepository,
  projectsRepository,
  host,
  now = () => new Date()
}: {
  configurationRepository: KnowledgeBaseConfigurationRepository
  projectsRepository: KnowledgeBaseProjectsRepository
  host: KnowledgeBaseProjectFolderHost
  now?: () => Date
}): KnowledgeBaseProjectsService {
  async function linkProject(project: StoredProject): Promise<StoredProject> {
    const configuration = await configurationRepository.get()
    if (!configuration) return project

    const projectFolder = join(
      configuration.rootPath,
      'projects',
      slugifyProjectName(project.name)
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

  return {
    async linkExistingProjects() {
      const linkedProjects: StoredProject[] = []
      for (const project of await projectsRepository.list()) {
        linkedProjects.push(await linkProject(project))
      }
      return linkedProjects
    },
    linkProject
  }
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
      await mkdir(path, { recursive: true })
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
