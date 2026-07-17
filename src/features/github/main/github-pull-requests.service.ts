import type {
  GitHubIssueComment,
  GitHubPage,
  GitHubPullRequest,
  GitHubPullRequestCommentsRequest,
  GitHubPullRequestListRequest,
  GitHubPullRequestRequest,
  GitHubPullRequestSummary,
  GitHubRepository
} from '../shared'
import type { GitHubAuthService } from './github-auth.service'

export type GitHubPullRequestsAdapter = {
  listPullRequests: (request: {
    accessToken: string
    owner: string
    repository: string
    page: number
    perPage: number
  }) => Promise<GitHubPage<GitHubPullRequestSummary>>
  getPullRequest: (request: {
    accessToken: string
    owner: string
    repository: string
    number: number
  }) => Promise<GitHubPullRequest>
  listConversationComments: (request: {
    accessToken: string
    owner: string
    repository: string
    number: number
    page: number
    perPage: number
  }) => Promise<GitHubPage<GitHubIssueComment>>
}

export function createGitHubPullRequestsService({
  projects,
  auth,
  adapter
}: {
  projects: {
    getLinkedRepository: (request: { projectId: string }) => Promise<GitHubRepository>
  }
  auth: Pick<GitHubAuthService, 'getAuthorizedCredential'>
  adapter: GitHubPullRequestsAdapter
}) {
  async function resolveAccess(projectId: string): Promise<{
    repository: GitHubRepository
    accessToken: string
  }> {
    const [repository, credential] = await Promise.all([
      projects.getLinkedRepository({ projectId }),
      auth.getAuthorizedCredential()
    ])
    return { repository, accessToken: credential.accessToken }
  }

  async function listPullRequests(
    request: GitHubPullRequestListRequest
  ): Promise<GitHubPage<GitHubPullRequestSummary>> {
    const { repository, accessToken } = await resolveAccess(request.projectId.trim())
    return adapter.listPullRequests({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      page: request.page,
      perPage: request.perPage ?? 30
    })
  }

  async function getPullRequest(request: GitHubPullRequestRequest): Promise<GitHubPullRequest> {
    const { repository, accessToken } = await resolveAccess(request.projectId.trim())
    return adapter.getPullRequest({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      number: request.number
    })
  }

  async function listConversationComments(
    request: GitHubPullRequestCommentsRequest
  ): Promise<GitHubPage<GitHubIssueComment>> {
    const { repository, accessToken } = await resolveAccess(request.projectId.trim())
    return adapter.listConversationComments({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      number: request.number,
      page: request.page,
      perPage: request.perPage ?? 50
    })
  }

  return { listPullRequests, getPullRequest, listConversationComments }
}
