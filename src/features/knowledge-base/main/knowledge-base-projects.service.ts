import { createHash } from 'node:crypto'
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { StoredProject } from '../../projects/main/projects.service'
import { assertKnowledgeBaseCanonicalPathAllowed } from './knowledge-base-files.service'
import type { KnowledgeBaseOperationCoordinator } from './knowledge-base-operation-coordinator'
import type { KnowledgeBaseRootProvider } from './knowledge-base-root.provider'

export type KnowledgeBaseProjectsRepository = {
  list: () => Promise<StoredProject[]>
  update: (project: StoredProject) => Promise<StoredProject>
}

export type KnowledgeBaseProjectFolderHost = {
  ensureProjectDirectory: (rootPath: string, path: string) => Promise<boolean>
  writeTextFile: (rootPath: string, path: string, content: string) => Promise<void>
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
  rootProvider,
  projectsRepository,
  host,
  operations = { runExclusive: (operation) => operation() },
  now = () => new Date()
}: {
  rootProvider: Pick<KnowledgeBaseRootProvider, 'getStatus' | 'getVerifiedRoot'>
  projectsRepository: KnowledgeBaseProjectsRepository
  host: KnowledgeBaseProjectFolderHost
  operations?: KnowledgeBaseOperationCoordinator
  now?: () => Date
}): KnowledgeBaseProjectsService {
  async function linkProject(project: StoredProject): Promise<StoredProject> {
    const status = await rootProvider.getStatus()
    if (status.setupState === 'unconfigured') return project
    if (status.setupState === 'unavailable') {
      throw new Error(`Knowledge Base is unavailable at ${status.rootPath}.`)
    }

    const rootPath = await rootProvider.getVerifiedRoot()
    const projectFolder = chooseProjectFolder(
      rootPath,
      project,
      await projectsRepository.list()
    )
    const created = await host.ensureProjectDirectory(rootPath, projectFolder)
    if (created) {
      await host.writeTextFile(
        rootPath,
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
      return {
        project: await operations.runExclusive(() => linkProject(project)),
        warning: undefined
      }
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
    async ensureProjectDirectory(rootPath, path) {
      assertLexicalPathWithinRoot(rootPath, path)
      await ensureSafeDirectory(rootPath, dirname(path))

      try {
        await mkdir(path)
        return true
      } catch (error) {
        if (!isNodeError(error) || error.code !== 'EEXIST') throw error
        await assertSafeDirectory(rootPath, path)
        return false
      }
    },
    async writeTextFile(rootPath, path, content) {
      assertLexicalPathWithinRoot(rootPath, path)
      await assertSafeDirectory(rootPath, dirname(path))
      await writeFile(path, content, { encoding: 'utf8', flag: 'wx' })
    }
  }
}

async function ensureSafeDirectory(rootPath: string, path: string): Promise<void> {
  assertLexicalPathWithinRoot(rootPath, path)
  try {
    await mkdir(path)
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'EEXIST') throw error
  }
  await assertSafeDirectory(rootPath, path)
}

async function assertSafeDirectory(rootPath: string, path: string): Promise<void> {
  const details = await lstat(path)
  const [canonicalRoot, canonicalPath] = await Promise.all([
    realpath(rootPath),
    realpath(path)
  ])
  await assertKnowledgeBaseCanonicalPathAllowed(canonicalRoot, canonicalPath)
  if (details.isSymbolicLink()) {
    throw new Error('Project Knowledge Base directories cannot be symbolic links.')
  }
  if (!details.isDirectory()) {
    throw new Error(`Project Knowledge Base path is not a folder: ${path}`)
  }
}

function assertLexicalPathWithinRoot(rootPath: string, path: string): void {
  if (!isPathWithinRoot(rootPath, path) || resolve(rootPath) === resolve(path)) {
    throw new Error('Project Knowledge Base path is outside the configured root.')
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
