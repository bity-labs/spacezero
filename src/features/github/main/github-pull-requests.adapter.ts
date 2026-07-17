import { Octokit } from '@octokit/rest'

import type {
  GitHubCheckRun,
  GitHubCommitStatus,
  GitHubIssueComment,
  GitHubPullRequest,
  GitHubPullRequestFile,
  GitHubPullRequestPatch,
  GitHubPullRequestReview,
  GitHubPullRequestSummary,
  GitHubUser
} from '../shared'
import { toGitHubApiError } from './github-api-error'
import type { GitHubPullRequestsAdapter } from './github-pull-requests.service'

type ApiUser = {
  id: number
  login: string
  avatar_url: string
}

type ApiPullRequest = {
  number: number
  title: string
  body?: string | null
  state: string
  draft?: boolean | null
  html_url: string
  user: ApiUser | null
  base: { ref: string }
  head: { ref: string; sha: string }
  commits?: number
  comments?: number
  merged_at?: string | null
  created_at: string
  updated_at: string
}

type ApiComment = {
  id: number
  body?: string | null
  html_url: string
  user: ApiUser | null
  created_at: string
  updated_at: string
}

type ApiFile = {
  sha: string
  filename: string
  previous_filename?: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string | null
}

type ApiCheckRun = {
  id: number
  name: string
  status: string
  conclusion: string | null
  details_url: string | null
  app?: { name?: string } | null
  started_at: string | null
  completed_at: string | null
}

type ApiCommitStatus = {
  id: number
  context: string
  state: string
  description: string | null
  target_url: string | null
  updated_at: string
}

type ApiReview = {
  id: number
  state: string
  body?: string | null
  html_url: string
  user: ApiUser | null
  submitted_at?: string | null
}

export function createGitHubPullRequestsAdapter(): GitHubPullRequestsAdapter {
  return {
    async listPullRequests({ accessToken, owner, repository, page, perPage }) {
      const octokit = new Octokit({ auth: accessToken })
      try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
          owner,
          repo: repository,
          state: 'all',
          sort: 'updated',
          direction: 'desc',
          page,
          per_page: perPage
        })
        return {
          items: response.data.map((pullRequest) =>
            toPullRequestSummary(pullRequest as ApiPullRequest)
          ),
          page,
          hasNextPage: hasNextPage(response.headers.link)
        }
      } catch (error) {
        throw toGitHubApiError(error)
      }
    },

    async getPullRequest({ accessToken, owner, repository, number }) {
      const octokit = new Octokit({ auth: accessToken })
      try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
          owner,
          repo: repository,
          pull_number: number
        })
        return toPullRequest(response.data as ApiPullRequest)
      } catch (error) {
        throw toGitHubApiError(error)
      }
    },

    async listConversationComments({ accessToken, owner, repository, number, page, perPage }) {
      const octokit = new Octokit({ auth: accessToken })
      try {
        const response = await octokit.request(
          'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
          {
            owner,
            repo: repository,
            issue_number: number,
            page,
            per_page: perPage
          }
        )
        return {
          items: response.data.map((comment) => toComment(comment as ApiComment)),
          page,
          hasNextPage: hasNextPage(response.headers.link)
        }
      } catch (error) {
        throw toGitHubApiError(error)
      }
    },

    async listFiles({ accessToken, owner, repository, number, page, perPage }) {
      const octokit = new Octokit({ auth: accessToken })
      try {
        const response = await octokit.request(
          'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
          {
            owner,
            repo: repository,
            pull_number: number,
            page,
            per_page: perPage
          }
        )
        return {
          items: response.data.map((file) => toFile(file as ApiFile)),
          page,
          hasNextPage: hasNextPage(response.headers.link)
        }
      } catch (error) {
        throw toGitHubApiError(error)
      }
    },

    async listCheckRuns({ accessToken, owner, repository, number, page, perPage }) {
      const octokit = new Octokit({ auth: accessToken })
      try {
        const headSha = await getHeadSha(octokit, owner, repository, number)
        const response = await octokit.request(
          'GET /repos/{owner}/{repo}/commits/{ref}/check-runs',
          {
            owner,
            repo: repository,
            ref: headSha,
            page,
            per_page: perPage
          }
        )
        return {
          items: response.data.check_runs.map((checkRun) => toCheckRun(checkRun as ApiCheckRun)),
          page,
          hasNextPage: hasNextPage(response.headers.link)
        }
      } catch (error) {
        throw toGitHubApiError(error)
      }
    },

    async listCommitStatuses({ accessToken, owner, repository, number, page, perPage }) {
      const octokit = new Octokit({ auth: accessToken })
      try {
        const headSha = await getHeadSha(octokit, owner, repository, number)
        const response = await octokit.request('GET /repos/{owner}/{repo}/commits/{ref}/statuses', {
          owner,
          repo: repository,
          ref: headSha,
          page,
          per_page: perPage
        })
        return {
          items: response.data.map((status) => toCommitStatus(status as ApiCommitStatus)),
          page,
          hasNextPage: hasNextPage(response.headers.link)
        }
      } catch (error) {
        throw toGitHubApiError(error)
      }
    },

    async listReviews({ accessToken, owner, repository, number, page, perPage }) {
      const octokit = new Octokit({ auth: accessToken })
      try {
        const response = await octokit.request(
          'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
          {
            owner,
            repo: repository,
            pull_number: number,
            page,
            per_page: perPage
          }
        )
        return {
          items: response.data.map((review) => toReview(review as ApiReview)),
          page,
          hasNextPage: hasNextPage(response.headers.link)
        }
      } catch (error) {
        throw toGitHubApiError(error)
      }
    },

    async createConversationComment({ accessToken, owner, repository, number, body }) {
      const octokit = new Octokit({ auth: accessToken })
      try {
        const response = await octokit.request(
          'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
          {
            owner,
            repo: repository,
            issue_number: number,
            body
          }
        )
        return toComment(response.data as ApiComment)
      } catch (error) {
        throw toGitHubApiError(error)
      }
    },

    async createReview({ accessToken, owner, repository, number, event, body }) {
      const octokit = new Octokit({ auth: accessToken })
      try {
        const response = await octokit.request(
          'POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
          {
            owner,
            repo: repository,
            pull_number: number,
            event,
            ...(body ? { body } : {})
          }
        )
        return toReview(response.data as ApiReview)
      } catch (error) {
        throw toGitHubApiError(error)
      }
    }
  }
}

async function getHeadSha(
  octokit: Octokit,
  owner: string,
  repository: string,
  number: number
): Promise<string> {
  const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo: repository,
    pull_number: number
  })
  return response.data.head.sha
}

function toPullRequestSummary(pullRequest: ApiPullRequest): GitHubPullRequestSummary {
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.merged_at ? 'merged' : pullRequest.state === 'closed' ? 'closed' : 'open',
    isDraft: Boolean(pullRequest.draft),
    htmlUrl: pullRequest.html_url,
    author: toUser(pullRequest.user),
    baseBranch: pullRequest.base.ref,
    headBranch: pullRequest.head.ref,
    createdAt: pullRequest.created_at,
    updatedAt: pullRequest.updated_at
  }
}

function toPullRequest(pullRequest: ApiPullRequest): GitHubPullRequest {
  return {
    ...toPullRequestSummary(pullRequest),
    body: pullRequest.body ?? null,
    commitCount: pullRequest.commits ?? 0,
    conversationCommentCount: pullRequest.comments ?? 0
  }
}

function toComment(comment: ApiComment): GitHubIssueComment {
  return {
    id: String(comment.id),
    body: comment.body ?? '',
    htmlUrl: comment.html_url,
    author: toUser(comment.user),
    createdAt: comment.created_at,
    updatedAt: comment.updated_at
  }
}

function toFile(file: ApiFile): GitHubPullRequestFile {
  return {
    sha: file.sha,
    filename: file.filename,
    previousFilename: file.previous_filename ?? null,
    status: toFileStatus(file.status),
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: classifyPullRequestPatch(file)
  }
}

export function classifyPullRequestPatch(file: {
  patch?: string | null
  changes: number
  additions: number
  deletions: number
}): GitHubPullRequestPatch {
  if (file.patch === null) return { status: 'unavailable' }
  if (file.patch === undefined) {
    return file.changes === 0 ? { status: 'binary' } : { status: 'omitted' }
  }
  const representedChanges = file.patch.split('\n').filter((line) => {
    return (
      (line.startsWith('+') && !line.startsWith('+++')) ||
      (line.startsWith('-') && !line.startsWith('---'))
    )
  }).length
  return {
    status: 'available',
    text: file.patch,
    truncated: representedChanges < file.additions + file.deletions
  }
}

function toFileStatus(status: string): GitHubPullRequestFile['status'] {
  const knownStatuses: GitHubPullRequestFile['status'][] = [
    'added',
    'modified',
    'removed',
    'renamed',
    'copied',
    'changed',
    'unchanged'
  ]
  return knownStatuses.includes(status as GitHubPullRequestFile['status'])
    ? (status as GitHubPullRequestFile['status'])
    : 'unknown'
}

function toCheckRun(checkRun: ApiCheckRun): GitHubCheckRun {
  return {
    id: String(checkRun.id),
    name: checkRun.name,
    status:
      checkRun.status === 'queued' ||
      checkRun.status === 'in_progress' ||
      checkRun.status === 'completed'
        ? checkRun.status
        : 'unknown',
    conclusion: checkRun.conclusion,
    detailsUrl: checkRun.details_url,
    appName: checkRun.app?.name ?? null,
    startedAt: checkRun.started_at,
    completedAt: checkRun.completed_at
  }
}

function toCommitStatus(status: ApiCommitStatus): GitHubCommitStatus {
  return {
    id: String(status.id),
    context: status.context,
    state:
      status.state === 'error' ||
      status.state === 'failure' ||
      status.state === 'pending' ||
      status.state === 'success'
        ? status.state
        : 'unknown',
    description: status.description,
    targetUrl: status.target_url,
    updatedAt: status.updated_at
  }
}

function toReview(review: ApiReview): GitHubPullRequestReview {
  const state = review.state.toLowerCase()
  return {
    id: String(review.id),
    state:
      state === 'approved' ||
      state === 'changes_requested' ||
      state === 'commented' ||
      state === 'dismissed' ||
      state === 'pending'
        ? state
        : 'unknown',
    body: review.body ?? null,
    htmlUrl: review.html_url,
    author: toUser(review.user),
    submittedAt: review.submitted_at ?? null
  }
}

function toUser(user: ApiUser | null): GitHubUser | null {
  if (!user) return null
  return { id: String(user.id), login: user.login, avatarUrl: user.avatar_url }
}

function hasNextPage(link: string | undefined): boolean {
  return typeof link === 'string' && /rel="next"/.test(link)
}
