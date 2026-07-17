import type {
  GitHubIssue,
  GitHubIssueComment,
  GitHubIssueCommentCreateRequest,
  GitHubIssueCommentsRequest,
  GitHubIssueListRequest,
  GitHubIssueRequest,
  GitHubIssueStateUpdateRequest,
  GitHubPage,
  GitHubRepository
} from '../shared'
import type { GitHubAuthService } from './github-auth.service'

export type GitHubIssueApiItem = GitHubIssue & { isPullRequest: boolean }

export type GitHubIssuesAdapter = {
  listIssues: (request: {
    accessToken: string
    owner: string
    repository: string
    page: number
    perPage: number
  }) => Promise<GitHubPage<GitHubIssueApiItem>>
  getIssue: (request: {
    accessToken: string
    owner: string
    repository: string
    number: number
  }) => Promise<GitHubIssueApiItem>
  listIssueComments: (request: {
    accessToken: string
    owner: string
    repository: string
    number: number
    page: number
    perPage: number
  }) => Promise<GitHubPage<GitHubIssueComment>>
  createIssueComment: (request: {
    accessToken: string
    owner: string
    repository: string
    number: number
    body: string
  }) => Promise<GitHubIssueComment>
  updateIssueState: (request: {
    accessToken: string
    owner: string
    repository: string
    number: number
    state: 'open' | 'closed'
  }) => Promise<GitHubIssueApiItem>
}

export function createGitHubIssuesService({
  projects,
  auth,
  adapter
}: {
  projects: {
    getLinkedRepository: (request: { projectId: string }) => Promise<GitHubRepository>
  }
  auth: Pick<GitHubAuthService, 'getAuthorizedCredential'>
  adapter: GitHubIssuesAdapter
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

  async function listIssues(request: GitHubIssueListRequest): Promise<GitHubPage<GitHubIssue>> {
    const { repository, accessToken } = await resolveAccess(request.projectId.trim())
    const page = await adapter.listIssues({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      page: request.page,
      perPage: request.perPage ?? 30
    })
    return {
      ...page,
      items: page.items.filter((issue) => !issue.isPullRequest).map(toIssue)
    }
  }

  async function getIssue(request: GitHubIssueRequest): Promise<GitHubIssue> {
    const { repository, accessToken } = await resolveAccess(request.projectId.trim())
    const issue = await adapter.getIssue({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      number: request.number
    })
    if (issue.isPullRequest) throw new Error('github.issueNotFound')
    return toIssue(issue)
  }

  async function listIssueComments(
    request: GitHubIssueCommentsRequest
  ): Promise<GitHubPage<GitHubIssueComment>> {
    const { repository, accessToken } = await resolveAccess(request.projectId.trim())
    return adapter.listIssueComments({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      number: request.number,
      page: request.page,
      perPage: request.perPage ?? 50
    })
  }

  async function createIssueComment(
    request: GitHubIssueCommentCreateRequest
  ): Promise<GitHubIssueComment> {
    const body = request.body.trim()
    if (!body || body.length > 65_536) throw new Error('github.invalidComment')
    const { repository, accessToken } = await resolveAccess(request.projectId.trim())
    return adapter.createIssueComment({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      number: request.number,
      body
    })
  }

  async function updateIssueState(request: GitHubIssueStateUpdateRequest): Promise<GitHubIssue> {
    const { repository, accessToken } = await resolveAccess(request.projectId.trim())
    const issue = await adapter.updateIssueState({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      number: request.number,
      state: request.state
    })
    if (issue.isPullRequest) throw new Error('github.issueNotFound')
    return toIssue(issue)
  }

  return { listIssues, getIssue, listIssueComments, createIssueComment, updateIssueState }
}

function toIssue(issue: GitHubIssueApiItem): GitHubIssue {
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    htmlUrl: issue.htmlUrl,
    author: issue.author,
    labels: issue.labels,
    assignees: issue.assignees,
    commentCount: issue.commentCount,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt
  }
}
