import { isAbsolute, relative, resolve, sep } from 'node:path'

import { nanoid } from 'nanoid'

import type { ProjectsService } from '../../projects/main/projects.service'
import type {
  CancelGitHubCloneRequest,
  GitHubCloneProgress,
  GitHubRepository,
  GitHubRepositorySetupOption,
  StartGitHubCloneRequest,
  StartGitHubCloneResult
} from '../shared'
import type { GitHubAuthService } from './github-auth.service'
import type { AuthorizedRepositories } from './github-projects.service'

export type GitHubCloneAdapter = {
  clone: (request: {
    repository: GitHubRepository
    destination: string
    accessToken: string
    signal: AbortSignal
    onProgress: (progress: { percent?: number }) => void
  }) => Promise<void>
  removeDestination: (destination: string) => Promise<void>
}

type ProjectsBoundary = Pick<ProjectsService, 'listProjects' | 'registerGitHubProject'>
type EmitCloneProgress = (event: GitHubCloneProgress) => void

type CloneOperation = {
  abortController: AbortController
  completion: Promise<void>
}

export class GitHubCloneCancelledError extends Error {
  constructor() {
    super('github.cloneCancelled')
    this.name = 'GitHubCloneCancelledError'
  }
}

export function createGitHubRepositorySetupService({
  repositories,
  auth,
  projects,
  clone,
  getProjectsPath,
  createOperationId = nanoid
}: {
  repositories: AuthorizedRepositories
  auth: Pick<GitHubAuthService, 'getAuthorizedCredential'>
  projects: ProjectsBoundary
  clone: GitHubCloneAdapter
  getProjectsPath: () => Promise<string>
  createOperationId?: () => string
}) {
  const operations = new Map<string, CloneOperation>()
  const activeDestinations = new Set<string>()

  async function listSetupOptions(): Promise<GitHubRepositorySetupOption[]> {
    const [authorizedRepositories, registeredProjects] = await Promise.all([
      repositories.listAuthorizedRepositories(),
      projects.listProjects()
    ])
    const projectsByRepositoryId = new Map(
      registeredProjects.flatMap((project) =>
        project.githubRepository ? [[project.githubRepository.repositoryId, project] as const] : []
      )
    )

    return authorizedRepositories.map((repository) => {
      const existingProject = projectsByRepositoryId.get(repository.id)
      return {
        repository,
        ...(existingProject
          ? { existingProject: { id: existingProject.id, name: existingProject.name } }
          : {})
      }
    })
  }

  async function startClone(
    request: StartGitHubCloneRequest,
    emit: EmitCloneProgress
  ): Promise<StartGitHubCloneResult> {
    const repositoryId = request.repositoryId.trim()
    const [authorizedRepositories, registeredProjects] = await Promise.all([
      repositories.listAuthorizedRepositories(),
      projects.listProjects()
    ])
    const repository = authorizedRepositories.find((candidate) => candidate.id === repositoryId)
    if (!repository) throw new Error('github.repositoryNotAuthorized')

    const existingProject = registeredProjects.find(
      (project) => project.githubRepository?.repositoryId === repositoryId
    )
    if (existingProject) return { status: 'already-added', projectId: existingProject.id }

    const credential = await auth.getAuthorizedCredential()
    const projectsPath = resolve(await getProjectsPath())
    const destination = resolveCloneDestination(projectsPath, repository)
    const operationId = createOperationId()
    if (operations.has(operationId)) throw new Error('github.cloneOperationAlreadyExists')
    if (activeDestinations.has(destination)) throw new Error('github.cloneAlreadyInProgress')
    activeDestinations.add(destination)

    const abortController = new AbortController()
    let finishOperation: (() => void) | undefined
    const completion = new Promise<void>((resolve) => {
      finishOperation = resolve
    })
    operations.set(operationId, { abortController, completion })
    setTimeout(() => {
      void runClone({
        operationId,
        repository,
        destination,
        accessToken: credential.accessToken,
        abortController,
        emit
      }).finally(() => {
        operations.delete(operationId)
        activeDestinations.delete(destination)
        finishOperation?.()
      })
    }, 0)

    return { status: 'started', operationId }
  }

  async function runClone({
    operationId,
    repository,
    destination,
    accessToken,
    abortController,
    emit
  }: {
    operationId: string
    repository: GitHubRepository
    destination: string
    accessToken: string
    abortController: AbortController
    emit: EmitCloneProgress
  }): Promise<void> {
    let cloneCompleted = false
    emit({ operationId, status: 'starting', message: 'Preparing managed clone…' })

    try {
      if (abortController.signal.aborted) throw new GitHubCloneCancelledError()
      await clone.clone({
        repository,
        destination,
        accessToken,
        signal: abortController.signal,
        onProgress: ({ percent }) =>
          emit({
            operationId,
            status: 'cloning',
            message: 'Cloning repository…',
            ...(percent === undefined ? {} : { percent })
          })
      })
      cloneCompleted = true
      const project = await projects.registerGitHubProject({
        name: repository.name,
        path: destination,
        repositoryId: repository.id,
        nodeId: repository.nodeId,
        owner: repository.owner,
        htmlUrl: repository.htmlUrl
      })
      emit({
        operationId,
        status: 'complete',
        message: 'Repository cloned and Project added.',
        projectId: project.id
      })
    } catch (error) {
      if (cloneCompleted) await clone.removeDestination(destination).catch(() => undefined)
      if (abortController.signal.aborted || error instanceof GitHubCloneCancelledError) {
        emit({ operationId, status: 'cancelled', message: 'Clone cancelled.' })
        return
      }
      emit({
        operationId,
        status: 'failed',
        message: 'Clone failed. Check repository access, network, and destination, then retry.'
      })
    }
  }

  async function cancelClone(request: CancelGitHubCloneRequest): Promise<void> {
    const operation = operations.get(request.operationId.trim())
    if (!operation) return
    operation.abortController.abort()
    await operation.completion
  }

  return { listSetupOptions, startClone, cancelClone }
}

function resolveCloneDestination(projectsPath: string, repository: GitHubRepository): string {
  assertSafePathSegment(repository.owner)
  assertSafePathSegment(repository.name)
  const destination = resolve(projectsPath, repository.owner, repository.name)
  const relativePath = relative(projectsPath, destination)
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error('github.cloneDestinationOutsideProjectsPath')
  }
  return destination
}

function assertSafePathSegment(segment: string): void {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(segment)) {
    throw new Error('github.invalidRepositoryPath')
  }
}
