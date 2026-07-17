import { Octokit } from '@octokit/rest'

import type {
  GitHubIssueComment,
  GitHubPullRequest,
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
  head: { ref: string }
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
    }
  }
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

function toUser(user: ApiUser | null): GitHubUser | null {
  if (!user) return null
  return { id: String(user.id), login: user.login, avatarUrl: user.avatar_url }
}

function hasNextPage(link: string | undefined): boolean {
  return typeof link === 'string' && /rel="next"/.test(link)
}
