import { Octokit } from '@octokit/rest'

import type { GitHubIssueComment, GitHubUser } from '../shared'
import { toGitHubApiError } from './github-api-error'
import type { GitHubIssueApiItem, GitHubIssuesAdapter } from './github-issues.service'

type ApiUser = {
  id: number
  login: string
  avatar_url: string
}

type ApiIssue = {
  number: number
  title: string
  body?: string | null
  state: string
  html_url: string
  user: ApiUser | null
  labels: Array<string | { id?: number; name?: string; color?: string | null }>
  assignees?: ApiUser[] | null
  comments: number
  created_at: string
  updated_at: string
  pull_request?: unknown
}

type ApiComment = {
  id: number
  body?: string | null
  html_url: string
  user: ApiUser | null
  created_at: string
  updated_at: string
}

export function createGitHubIssuesAdapter(): GitHubIssuesAdapter {
  return {
    async listIssues({ accessToken, owner, repository, page, perPage }) {
      const octokit = new Octokit({ auth: accessToken })
      try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/issues', {
          owner,
          repo: repository,
          state: 'open',
          sort: 'updated',
          direction: 'desc',
          page,
          per_page: perPage
        })
        return {
          items: response.data.map((issue) => toIssue(issue as ApiIssue)),
          page,
          hasNextPage: hasNextPage(response.headers.link)
        }
      } catch (error) {
        throw toGitHubApiError(error)
      }
    },

    async getIssue({ accessToken, owner, repository, number }) {
      const octokit = new Octokit({ auth: accessToken })
      try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
          owner,
          repo: repository,
          issue_number: number
        })
        return toIssue(response.data as ApiIssue)
      } catch (error) {
        throw toGitHubApiError(error)
      }
    },

    async listIssueComments({ accessToken, owner, repository, number, page, perPage }) {
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

    async createIssueComment({ accessToken, owner, repository, number, body }) {
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

    async updateIssueState({ accessToken, owner, repository, number, state }) {
      const octokit = new Octokit({ auth: accessToken })
      try {
        const response = await octokit.request(
          'PATCH /repos/{owner}/{repo}/issues/{issue_number}',
          {
            owner,
            repo: repository,
            issue_number: number,
            state
          }
        )
        return toIssue(response.data as ApiIssue)
      } catch (error) {
        throw toGitHubApiError(error)
      }
    }
  }
}

function toIssue(issue: ApiIssue): GitHubIssueApiItem {
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? null,
    state: issue.state === 'closed' ? 'closed' : 'open',
    htmlUrl: issue.html_url,
    author: toUser(issue.user),
    labels: issue.labels.flatMap((label) => {
      if (typeof label === 'string' || !label.name) return []
      return [
        { id: String(label.id ?? label.name), name: label.name, color: label.color ?? '6e7781' }
      ]
    }),
    assignees: (issue.assignees ?? []).flatMap((user) => {
      const mapped = toUser(user)
      return mapped ? [mapped] : []
    }),
    commentCount: issue.comments,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    isPullRequest: Boolean(issue.pull_request)
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
