import type {
  GitHubCheckRun,
  GitHubCommitStatus,
  GitHubIssueComment,
  GitHubPage,
  GitHubPullRequest,
  GitHubPullRequestCommentCreateRequest,
  GitHubPullRequestCommentsRequest,
  GitHubPullRequestCommit,
  GitHubPullRequestFile,
  GitHubPullRequestListRequest,
  GitHubPullRequestPageRequest,
  GitHubPullRequestRequest,
  GitHubPullRequestReview,
  GitHubPullRequestReviewCreateRequest,
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
  listConversationComments: (
    request: GitHubPullRequestAdapterPageRequest
  ) => Promise<GitHubPage<GitHubIssueComment>>
  listCommits: (
    request: GitHubPullRequestAdapterPageRequest
  ) => Promise<GitHubPage<GitHubPullRequestCommit>>
  listFiles: (
    request: GitHubPullRequestAdapterPageRequest
  ) => Promise<GitHubPage<GitHubPullRequestFile>>
  listCheckRuns: (
    request: GitHubPullRequestAdapterPageRequest
  ) => Promise<GitHubPage<GitHubCheckRun>>
  listCommitStatuses: (
    request: GitHubPullRequestAdapterPageRequest
  ) => Promise<GitHubPage<GitHubCommitStatus>>
  listReviews: (
    request: GitHubPullRequestAdapterPageRequest
  ) => Promise<GitHubPage<GitHubPullRequestReview>>
  createConversationComment: (request: {
    accessToken: string
    owner: string
    repository: string
    number: number
    body: string
  }) => Promise<GitHubIssueComment>
  createReview: (request: {
    accessToken: string
    owner: string
    repository: string
    number: number
    event: 'APPROVE' | 'REQUEST_CHANGES'
    body?: string
  }) => Promise<GitHubPullRequestReview>
}

type GitHubPullRequestAdapterPageRequest = {
  accessToken: string
  owner: string
  repository: string
  number: number
  page: number
  perPage: number
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
    const page = await adapter.listPullRequests({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      page: request.page,
      perPage: request.perPage ?? 30
    })
    return { ...page, items: page.items.filter((pullRequest) => pullRequest.state !== 'merged') }
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

  async function listCommits(
    request: GitHubPullRequestPageRequest
  ): Promise<GitHubPage<GitHubPullRequestCommit>> {
    return listDetailPage(request, 30, adapter.listCommits)
  }

  async function listFiles(
    request: GitHubPullRequestPageRequest
  ): Promise<GitHubPage<GitHubPullRequestFile>> {
    return listDetailPage(request, 30, adapter.listFiles)
  }

  async function listCheckRuns(
    request: GitHubPullRequestPageRequest
  ): Promise<GitHubPage<GitHubCheckRun>> {
    return listDetailPage(request, 50, adapter.listCheckRuns)
  }

  async function listCommitStatuses(
    request: GitHubPullRequestPageRequest
  ): Promise<GitHubPage<GitHubCommitStatus>> {
    return listDetailPage(request, 50, adapter.listCommitStatuses)
  }

  async function listReviews(
    request: GitHubPullRequestPageRequest
  ): Promise<GitHubPage<GitHubPullRequestReview>> {
    return listDetailPage(request, 50, adapter.listReviews)
  }

  async function listDetailPage<T>(
    request: GitHubPullRequestPageRequest,
    defaultPerPage: number,
    load: (request: GitHubPullRequestAdapterPageRequest) => Promise<GitHubPage<T>>
  ): Promise<GitHubPage<T>> {
    const { repository, accessToken } = await resolveAccess(request.projectId.trim())
    return load({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      number: request.number,
      page: request.page,
      perPage: request.perPage ?? defaultPerPage
    })
  }

  async function createConversationComment(
    request: GitHubPullRequestCommentCreateRequest
  ): Promise<GitHubIssueComment> {
    const body = request.body.trim()
    if (!body || body.length > 65_536) throw new Error('github.invalidComment')
    const { repository, accessToken } = await resolveAccess(request.projectId.trim())
    await adapter.getPullRequest({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      number: request.number
    })

    return adapter.createConversationComment({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      number: request.number,
      body
    })
  }

  async function createReview(
    request: GitHubPullRequestReviewCreateRequest
  ): Promise<GitHubPullRequestReview> {
    const body = request.body?.trim()
    if (request.event !== 'APPROVE' && request.event !== 'REQUEST_CHANGES') {
      throw new Error('github.invalidReview')
    }
    if (request.event === 'REQUEST_CHANGES' && !body) throw new Error('github.invalidReview')
    if (body && body.length > 65_536) throw new Error('github.invalidReview')
    const { repository, accessToken } = await resolveAccess(request.projectId.trim())
    return adapter.createReview({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      number: request.number,
      event: request.event,
      ...(body ? { body } : {})
    })
  }

  return {
    listPullRequests,
    getPullRequest,
    listConversationComments,
    listCommits,
    listFiles,
    listCheckRuns,
    listCommitStatuses,
    listReviews,
    createConversationComment,
    createReview
  }
}
