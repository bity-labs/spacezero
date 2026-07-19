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
import type { AuthorizedRepositories, GitHubRemoteAdapter } from './github-projects.service'
import { canonicalizeGitHubRemote } from './github-remote'

export type GitHubCloneAdapter = {
  clone: (request: {
    repository: GitHubRepository
    managedRoot: string
    destination: string
    accessToken: string
    signal: AbortSignal
    onProgress: (progress: { percent?: number }) => void
  }) => Promise<void>
  removeDestination: (destination: string) => Promise<void>
  releaseDestination?: (destination: string) => void
}

type ProjectsBoundary = Pick<
  ProjectsService,
  'listProjects' | 'linkGitHubRepository' | 'registerGitHubProject'
> &
  Partial<Pick<ProjectsService, 'deleteProject'>>
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
  git,
  clone,
  getProjectsPath,
  createOperationId = nanoid
}: {
  repositories: AuthorizedRepositories
  auth: Pick<GitHubAuthService, 'getAuthorizedCredential'>
  projects: ProjectsBoundary
  git: GitHubRemoteAdapter
  clone: GitHubCloneAdapter
  getProjectsPath: () => Promise<string>
  createOperationId?: () => string
}) {
  const operations = new Map<string, CloneOperation>()
  const activeDestinations = new Set<string>()

  async function listSetupOptions(): Promise<GitHubRepositorySetupOption[]> {
    const { authorizedRepositories, projectsByRepositoryId, remoteMatchesByRepository } =
      await loadSetupState()

    return authorizedRepositories.map((repository) => {
      const existingProject = projectsByRepositoryId.get(repository.id)
      const matchingProjects = existingProject
        ? []
        : (remoteMatchesByRepository.get(repository.fullName.toLowerCase()) ?? [])
      return {
        repository,
        ...(existingProject
          ? { existingProject: { id: existingProject.id, name: existingProject.name } }
          : {}),
        ...(matchingProjects.length > 0
          ? {
              matchingProjects: matchingProjects.map((project) => ({
                id: project.id,
                name: project.name
              }))
            }
          : {})
      }
    })
  }

  async function loadSetupState() {
    const [authorizedRepositories, registeredProjects] = await Promise.all([
      repositories.listAuthorizedRepositories(),
      projects.listProjects()
    ])
    const projectsByRepositoryId = new Map(
      registeredProjects.flatMap((project) =>
        project.githubRepository ? [[project.githubRepository.repositoryId, project] as const] : []
      )
    )
    const remoteMatchesByRepository = new Map<string, typeof registeredProjects>()

    await Promise.all(
      registeredProjects
        .filter((project) => !project.githubRepository)
        .map(async (project) => {
          const remoteKeys = new Set(
            (await git.listRemotes(project.path))
              .map(canonicalizeGitHubRemote)
              .filter((remote): remote is NonNullable<typeof remote> => remote !== null)
              .map((remote) => remote.key)
          )
          for (const remoteKey of remoteKeys) {
            const matches = remoteMatchesByRepository.get(remoteKey) ?? []
            matches.push(project)
            remoteMatchesByRepository.set(remoteKey, matches)
          }
        })
    )

    return { authorizedRepositories, projectsByRepositoryId, remoteMatchesByRepository }
  }

  async function startClone(
    request: StartGitHubCloneRequest,
    emit: EmitCloneProgress
  ): Promise<StartGitHubCloneResult> {
    const repositoryId = request.repositoryId.trim()
    const { authorizedRepositories, projectsByRepositoryId, remoteMatchesByRepository } =
      await loadSetupState()
    const repository = authorizedRepositories.find((candidate) => candidate.id === repositoryId)
    if (!repository) throw new Error('github.repositoryNotAuthorized')

    const existingProject = projectsByRepositoryId.get(repositoryId)
    if (existingProject) return { status: 'already-added', projectId: existingProject.id }

    const matchingProjects = remoteMatchesByRepository.get(repository.fullName.toLowerCase()) ?? []
    if (matchingProjects.length > 0) {
      const requestedProjectId = request.existingProjectId?.trim()
      if (matchingProjects.length > 1 && !requestedProjectId) {
        throw new Error('github.ambiguousProjectRemoteMatch')
      }
      const matchingProject = requestedProjectId
        ? matchingProjects.find((project) => project.id === requestedProjectId)
        : matchingProjects[0]
      if (!matchingProject) throw new Error('github.ambiguousProjectRemoteMatch')

      await projects.linkGitHubRepository(matchingProject.id, {
        repositoryId: repository.id,
        nodeId: repository.nodeId,
        owner: repository.owner,
        name: repository.name,
        htmlUrl: repository.htmlUrl
      })
      return { status: 'already-added', projectId: matchingProject.id }
    }
    if (request.existingProjectId) throw new Error('github.projectRemoteMatchNotFound')

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
        managedRoot: projectsPath,
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
    managedRoot,
    destination,
    accessToken,
    abortController,
    emit
  }: {
    operationId: string
    repository: GitHubRepository
    managedRoot: string
    destination: string
    accessToken: string
    abortController: AbortController
    emit: EmitCloneProgress
  }): Promise<void> {
    let cloneCompleted = false
    let cancellationRollbackFailed = false
    emit({ operationId, status: 'starting', message: 'Preparing managed clone…' })

    try {
      assertCloneActive(abortController.signal)
      await clone.clone({
        repository,
        managedRoot,
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
      assertCloneActive(abortController.signal)

      const project = await projects.registerGitHubProject({
        name: repository.name,
        path: destination,
        repositoryId: repository.id,
        nodeId: repository.nodeId,
        owner: repository.owner,
        htmlUrl: repository.htmlUrl
      })
      if (abortController.signal.aborted) {
        try {
          if (!projects.deleteProject) throw new Error('github.cloneCancellationRollbackFailed')
          await projects.deleteProject(project.id)
        } catch (error) {
          cancellationRollbackFailed = true
          throw error
        }
        throw new GitHubCloneCancelledError()
      }

      clone.releaseDestination?.(destination)
      emit({
        operationId,
        status: 'complete',
        message: 'Repository cloned and Project added.',
        projectId: project.id
      })
    } catch (error) {
      let cleanupFailed = false
      if (cloneCompleted) {
        try {
          await clone.removeDestination(destination)
        } catch {
          cleanupFailed = true
        }
      }
      if (
        !cleanupFailed &&
        !cancellationRollbackFailed &&
        (abortController.signal.aborted || error instanceof GitHubCloneCancelledError)
      ) {
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

function assertCloneActive(signal: AbortSignal): void {
  if (signal.aborted) throw new GitHubCloneCancelledError()
}
