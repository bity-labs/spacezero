import type {
  GitHubCheckRun,
  GitHubCommitStatus,
  GitHubCreateOrReusePullRequestRequest,
  GitHubCreateOrReusePullRequestResult,
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
  getBranchHeadSha: (request: {
    accessToken: string
    owner: string
    repository: string
    branch: string
  }) => Promise<string>
  findOpenPullRequests: (request: {
    accessToken: string
    owner: string
    repository: string
    headBranch: string
    baseBranch: string
  }) => Promise<GitHubPullRequestMatch[]>
  createPullRequest: (request: {
    accessToken: string
    owner: string
    repository: string
    headBranch: string
    baseBranch: string
    title: string
    body?: string
  }) => Promise<GitHubPullRequestMatch>
}

export type GitHubPullRequestMatch = {
  number: number
  htmlUrl: string
  headBranch: string
  headSha: string
  baseBranch: string
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
  adapter,
  sessions
}: {
  projects: {
    getLinkedRepository: (request: { projectId: string }) => Promise<GitHubRepository>
  }
  auth: Pick<GitHubAuthService, 'getAuthorizedCredential'>
  adapter: GitHubPullRequestsAdapter
  sessions?: {
    findSessionById: (sessionId: string) => Promise<
      | {
          projectId: string | null
          worktreeBranch?: string | null
          archivedAt?: Date | null
          workspaceContextSessionId?: string | null
        }
      | undefined
    >
  }
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

  async function createOrReusePullRequest(
    request: GitHubCreateOrReusePullRequestRequest
  ): Promise<GitHubCreateOrReusePullRequestResult> {
    try {
      if (!sessions) return createFailure('github.sessionUnavailable', false)
      const executingSession = await sessions.findSessionById(request.sessionId.trim())
      if (!executingSession?.projectId || executingSession.archivedAt) {
        return createFailure('github.sessionUnavailable', false)
      }
      const session = executingSession.workspaceContextSessionId
        ? await sessions.findSessionById(executingSession.workspaceContextSessionId)
        : executingSession
      if (
        !session?.projectId ||
        session.projectId !== executingSession.projectId ||
        !session.worktreeBranch ||
        session.archivedAt ||
        session.workspaceContextSessionId
      ) {
        return createFailure('github.sessionUnavailable', false)
      }

      const { repository, accessToken } = await resolveAccess(session.projectId)
      const headBranch = session.worktreeBranch
      const baseBranch = repository.defaultBranch
      const expectedHeadSha = request.expectedHeadSha.toLowerCase()
      const remoteHeadSha = await adapter.getBranchHeadSha({
        accessToken,
        owner: repository.owner,
        repository: repository.name,
        branch: headBranch
      })
      if (remoteHeadSha.toLowerCase() !== expectedHeadSha) {
        return createFailure('github.pushedHeadMismatch', true)
      }

      const scope = {
        accessToken,
        owner: repository.owner,
        repository: repository.name,
        headBranch,
        baseBranch
      }
      const existing = await findExactPullRequest(adapter, scope, expectedHeadSha, repository)
      if (existing.status === 'found') return createSuccess('reused', existing.match)
      if (existing.status === 'ambiguous') {
        return createFailure('github.ambiguousPullRequestMatch', false)
      }
      if (existing.status === 'mismatch') {
        return createFailure('github.pullRequestHeadMismatch', true)
      }

      const createRequest = {
        ...scope,
        title: request.title.trim(),
        ...(request.body?.trim() ? { body: request.body.trim() } : {})
      }
      try {
        const created = await adapter.createPullRequest(createRequest)
        return validateCreatedPullRequest(
          created,
          expectedHeadSha,
          repository,
          headBranch,
          baseBranch
        )
      } catch (firstError) {
        const recovered = await recoverCreatedPullRequest(
          adapter,
          scope,
          expectedHeadSha,
          repository
        )
        if (recovered) return recovered
        if (!isRetryablePullRequestError(firstError)) {
          return createFailure(toSafePullRequestErrorCode(firstError), false)
        }

        try {
          const created = await adapter.createPullRequest(createRequest)
          return validateCreatedPullRequest(
            created,
            expectedHeadSha,
            repository,
            headBranch,
            baseBranch
          )
        } catch (retryError) {
          const retryRecovered = await recoverCreatedPullRequest(
            adapter,
            scope,
            expectedHeadSha,
            repository
          )
          return (
            retryRecovered ??
            createFailure(
              toSafePullRequestErrorCode(retryError),
              isRetryablePullRequestError(retryError)
            )
          )
        }
      }
    } catch (error) {
      return createFailure(toSafePullRequestErrorCode(error), isRetryablePullRequestError(error))
    }
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
    createReview,
    createOrReusePullRequest
  }
}

type PullRequestLookup =
  | { status: 'none' }
  | { status: 'found'; match: GitHubPullRequestMatch }
  | { status: 'ambiguous' }
  | { status: 'mismatch' }

async function findExactPullRequest(
  adapter: GitHubPullRequestsAdapter,
  scope: {
    accessToken: string
    owner: string
    repository: string
    headBranch: string
    baseBranch: string
  },
  expectedHeadSha: string,
  repository: GitHubRepository
): Promise<PullRequestLookup> {
  const matches = await adapter.findOpenPullRequests(scope)
  if (matches.length > 1) return { status: 'ambiguous' }
  if (matches.length === 0) return { status: 'none' }
  const [match] = matches
  if (!match || match.headSha.toLowerCase() !== expectedHeadSha) return { status: 'mismatch' }
  if (
    match.headBranch !== scope.headBranch ||
    match.baseBranch !== scope.baseBranch ||
    !isUsablePullRequest(match, repository)
  ) {
    return { status: 'mismatch' }
  }
  return { status: 'found', match }
}

async function recoverCreatedPullRequest(
  adapter: GitHubPullRequestsAdapter,
  scope: {
    accessToken: string
    owner: string
    repository: string
    headBranch: string
    baseBranch: string
  },
  expectedHeadSha: string,
  repository: GitHubRepository
): Promise<GitHubCreateOrReusePullRequestResult | undefined> {
  try {
    const lookup = await findExactPullRequest(adapter, scope, expectedHeadSha, repository)
    if (lookup.status === 'found') return createSuccess('reused', lookup.match)
    if (lookup.status === 'ambiguous') {
      return createFailure('github.ambiguousPullRequestMatch', false)
    }
    if (lookup.status === 'mismatch') {
      return createFailure('github.pullRequestHeadMismatch', true)
    }
  } catch {
    // Preserve the original create error when reconciliation cannot be completed.
  }
  return undefined
}

function validateCreatedPullRequest(
  match: GitHubPullRequestMatch,
  expectedHeadSha: string,
  repository: GitHubRepository,
  headBranch: string,
  baseBranch: string
): GitHubCreateOrReusePullRequestResult {
  if (
    match.headSha.toLowerCase() !== expectedHeadSha ||
    match.headBranch !== headBranch ||
    match.baseBranch !== baseBranch ||
    !isUsablePullRequest(match, repository)
  ) {
    return createFailure('github.invalidPullRequestResponse', false)
  }
  return createSuccess('created', match)
}

function isUsablePullRequest(match: GitHubPullRequestMatch, repository: GitHubRepository): boolean {
  if (match.headBranch.length === 0 || match.baseBranch.length === 0) return false
  try {
    const url = new URL(match.htmlUrl)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      !url.username &&
      !url.password &&
      url.pathname === `/${repository.owner}/${repository.name}/pull/${match.number}` &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}

function createSuccess(
  status: 'created' | 'reused',
  match: GitHubPullRequestMatch
): GitHubCreateOrReusePullRequestResult {
  return {
    status,
    pushStatus: 'succeeded',
    pullRequest: {
      number: match.number,
      htmlUrl: match.htmlUrl,
      headBranch: match.headBranch,
      baseBranch: match.baseBranch
    }
  }
}

function createFailure(code: string, retryable: boolean): GitHubCreateOrReusePullRequestResult {
  return { status: 'failed', pushStatus: 'succeeded', error: { code, retryable } }
}

function isRetryablePullRequestError(error: unknown): boolean {
  return error instanceof Error && error.message === 'github.network-error'
}

function toSafePullRequestErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return /^github\.[a-zA-Z0-9.-]+$/.test(code) ? code : 'github.pullRequestCreationFailed'
}
