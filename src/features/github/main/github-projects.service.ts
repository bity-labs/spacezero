import type { ProjectsService } from '../../projects/main/projects.service'
import type {
  GitHubProjectLinkOptions,
  GitHubProjectRequest,
  GitHubRepository,
  LinkGitHubProjectRequest
} from '../shared'
import { canonicalizeGitHubRemote } from './github-remote'

export type GitHubRemoteAdapter = {
  listRemotes: (projectPath: string) => Promise<string[]>
}

export type AuthorizedRepositories = {
  listAuthorizedRepositories: () => Promise<GitHubRepository[]>
}

export function createGitHubProjectsService({
  projects,
  repositories,
  git
}: {
  projects: Pick<ProjectsService, 'getProject' | 'linkGitHubRepository'>
  repositories: AuthorizedRepositories
  git: GitHubRemoteAdapter
}) {
  async function getLinkOptions(request: GitHubProjectRequest): Promise<GitHubProjectLinkOptions> {
    const project = await projects.getProject(request.projectId.trim())
    const authorizedRepositories = await repositories.listAuthorizedRepositories()
    const remoteKeys = new Set(
      (await git.listRemotes(project.path))
        .map(canonicalizeGitHubRemote)
        .filter((remote): remote is NonNullable<typeof remote> => remote !== null)
        .map((remote) => remote.key)
    )
    const suggestedRepositoryIds = authorizedRepositories
      .filter((repository) => remoteKeys.has(repository.fullName.toLowerCase()))
      .map((repository) => repository.id)

    return {
      repositories: authorizedRepositories,
      suggestedRepositoryIds,
      ambiguous: suggestedRepositoryIds.length > 1
    }
  }

  async function linkProject(request: LinkGitHubProjectRequest) {
    const options = await getLinkOptions({ projectId: request.projectId })
    const repository = options.repositories.find(
      (candidate) => candidate.id === request.repositoryId.trim()
    )
    if (!repository) throw new Error('github.repositoryNotAuthorized')
    if (options.ambiguous && request.confirmAmbiguous !== true) {
      throw new Error('github.ambiguousRemoteMatch')
    }

    return projects.linkGitHubRepository(request.projectId, {
      repositoryId: repository.id,
      nodeId: repository.nodeId,
      owner: repository.owner,
      name: repository.name,
      htmlUrl: repository.htmlUrl
    })
  }

  return { getLinkOptions, linkProject }
}
