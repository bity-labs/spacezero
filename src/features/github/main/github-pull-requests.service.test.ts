import { describe, expect, it } from 'vitest'

import type { GitHubRepository } from '../shared'
import {
  createGitHubPullRequestsService,
  type GitHubPullRequestsAdapter
} from './github-pull-requests.service'

const repository: GitHubRepository = {
  id: '1000',
  nodeId: 'R_1000',
  installationId: '100',
  owner: 'bity-labs',
  name: 'spacezero',
  fullName: 'bity-labs/spacezero',
  isPrivate: true,
  defaultBranch: 'main',
  htmlUrl: 'https://github.com/bity-labs/spacezero',
  cloneUrl: 'https://github.com/bity-labs/spacezero.git'
}

function createAdapter(): GitHubPullRequestsAdapter {
  return {
    async listPullRequests() {
      return {
        items: [
          {
            number: 79,
            title: 'Managed storage foundation',
            state: 'open',
            isDraft: false,
            htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79',
            author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
            baseBranch: 'main',
            headBranch: 'feat/storage',
            createdAt: '2026-07-18T00:00:00.000Z',
            updatedAt: '2026-07-18T01:00:00.000Z'
          }
        ],
        page: 1,
        hasNextPage: true
      }
    },
    async getPullRequest() {
      return {
        number: 79,
        title: 'Managed storage foundation',
        body: 'Pull Request body',
        state: 'open',
        isDraft: false,
        htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79',
        author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
        baseBranch: 'main',
        headBranch: 'feat/storage',
        commitCount: 4,
        conversationCommentCount: 1,
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T01:00:00.000Z'
      }
    },
    async listConversationComments() {
      return {
        items: [
          {
            id: '500',
            body: 'Please update the docs.',
            htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79#issuecomment-500',
            author: { id: '84', login: 'reviewer', avatarUrl: 'https://avatars.example/84' },
            createdAt: '2026-07-18T02:00:00.000Z',
            updatedAt: '2026-07-18T02:00:00.000Z'
          }
        ],
        page: 1,
        hasNextPage: false
      }
    },
    async listFiles() {
      return {
        items: [
          {
            sha: 'abc',
            filename: 'src/index.ts',
            previousFilename: null,
            status: 'modified',
            additions: 2,
            deletions: 1,
            changes: 3,
            patch: { status: 'available', text: '@@ -1 +1 @@', truncated: false }
          }
        ],
        page: 1,
        hasNextPage: true
      }
    },
    async listCheckRuns() {
      return {
        items: [
          {
            id: 'check-1',
            name: 'test',
            status: 'completed',
            conclusion: 'success',
            detailsUrl: 'https://github.com/checks/1',
            appName: 'GitHub Actions',
            startedAt: '2026-07-18T02:00:00.000Z',
            completedAt: '2026-07-18T02:05:00.000Z'
          }
        ],
        page: 1,
        hasNextPage: false
      }
    },
    async listCommitStatuses() {
      return {
        items: [
          {
            id: 'status-1',
            context: 'deploy',
            state: 'pending',
            description: 'Deployment queued',
            targetUrl: null,
            updatedAt: '2026-07-18T02:00:00.000Z'
          }
        ],
        page: 1,
        hasNextPage: false
      }
    },
    async listReviews() {
      return {
        items: [
          {
            id: 'review-1',
            state: 'approved',
            body: 'Looks good',
            htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79#review-1',
            author: { id: '84', login: 'reviewer', avatarUrl: 'https://avatars.example/84' },
            submittedAt: '2026-07-18T03:00:00.000Z'
          }
        ],
        page: 1,
        hasNextPage: false
      }
    },
    async createConversationComment(request) {
      return {
        id: 'comment-2',
        body: request.body,
        htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79#issuecomment-501',
        author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
        createdAt: '2026-07-18T04:00:00.000Z',
        updatedAt: '2026-07-18T04:00:00.000Z'
      }
    },
    async createReview(request) {
      return {
        id: 'review-2',
        state: request.event === 'APPROVE' ? 'approved' : 'changes_requested',
        body: request.body ?? null,
        htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79#review-2',
        author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
        submittedAt: '2026-07-18T04:00:00.000Z'
      }
    }
  }
}

describe('GitHub Pull Requests service', () => {
  it('scopes paginated list requests to the linked Project repository', async () => {
    const adapter = createAdapter()
    const calls: unknown[] = []
    const listPullRequests = adapter.listPullRequests
    adapter.listPullRequests = async (request) => {
      calls.push(request)
      return listPullRequests(request)
    }
    const service = createGitHubPullRequestsService({
      projects: { getLinkedRepository: async () => repository },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'access-secret' }) as never },
      adapter
    })

    const page = await service.listPullRequests({ projectId: 'project-1', page: 1 })

    expect(calls).toEqual([
      {
        accessToken: 'access-secret',
        owner: 'bity-labs',
        repository: 'spacezero',
        page: 1,
        perPage: 30
      }
    ])
    expect(page).toMatchObject({
      items: [{ number: 79, title: 'Managed storage foundation' }],
      page: 1,
      hasNextPage: true
    })
    expect(JSON.stringify(page)).not.toContain('access-secret')
  })

  it('loads independently paginated files, checks, statuses, and reviews', async () => {
    const adapter = createAdapter()
    const requests: unknown[] = []
    const listFiles = adapter.listFiles
    adapter.listFiles = async (request) => {
      requests.push(request)
      return listFiles(request)
    }
    const service = createGitHubPullRequestsService({
      projects: { getLinkedRepository: async () => repository },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'access-secret' }) as never },
      adapter
    })

    await expect(
      service.listFiles({ projectId: 'project-1', number: 79, page: 2 })
    ).resolves.toMatchObject({ items: [{ filename: 'src/index.ts' }], hasNextPage: true })
    await expect(
      service.listCheckRuns({ projectId: 'project-1', number: 79, page: 1 })
    ).resolves.toMatchObject({ items: [{ name: 'test', conclusion: 'success' }] })
    await expect(
      service.listCommitStatuses({ projectId: 'project-1', number: 79, page: 1 })
    ).resolves.toMatchObject({ items: [{ context: 'deploy', state: 'pending' }] })
    await expect(
      service.listReviews({ projectId: 'project-1', number: 79, page: 1 })
    ).resolves.toMatchObject({ items: [{ state: 'approved' }] })
    expect(requests).toEqual([
      expect.objectContaining({
        accessToken: 'access-secret',
        owner: 'bity-labs',
        repository: 'spacezero',
        number: 79,
        page: 2,
        perPage: 30
      })
    ])
  })

  it('creates a conversation comment and submits GitHub-valid reviews', async () => {
    const adapter = createAdapter()
    const commentRequests: unknown[] = []
    const reviewRequests: unknown[] = []
    const createComment = adapter.createConversationComment
    const createReview = adapter.createReview
    adapter.createConversationComment = async (request) => {
      commentRequests.push(request)
      return createComment(request)
    }
    adapter.createReview = async (request) => {
      reviewRequests.push(request)
      return createReview(request)
    }
    const service = createGitHubPullRequestsService({
      projects: { getLinkedRepository: async () => repository },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'access-secret' }) as never },
      adapter
    })

    await expect(
      service.createConversationComment({
        projectId: 'project-1',
        number: 79,
        body: '  Conversation note  '
      })
    ).resolves.toMatchObject({ body: 'Conversation note' })
    await expect(
      service.createReview({
        projectId: 'project-1',
        number: 79,
        event: 'REQUEST_CHANGES',
        body: '  Please add a test.  '
      })
    ).resolves.toMatchObject({ state: 'changes_requested', body: 'Please add a test.' })
    expect(commentRequests).toEqual([
      expect.objectContaining({ accessToken: 'access-secret', body: 'Conversation note' })
    ])
    expect(reviewRequests).toEqual([
      expect.objectContaining({
        accessToken: 'access-secret',
        event: 'REQUEST_CHANGES',
        body: 'Please add a test.'
      })
    ])
  })

  it('rejects empty comments and invalid review input before resolving credentials', async () => {
    let credentialReads = 0
    const service = createGitHubPullRequestsService({
      projects: { getLinkedRepository: async () => repository },
      auth: {
        getAuthorizedCredential: async () => {
          credentialReads += 1
          return { accessToken: 'access-secret' } as never
        }
      },
      adapter: createAdapter()
    })

    await expect(
      service.createConversationComment({ projectId: 'project-1', number: 79, body: '  ' })
    ).rejects.toThrow('github.invalidComment')
    await expect(
      service.createReview({
        projectId: 'project-1',
        number: 79,
        event: 'REQUEST_CHANGES'
      })
    ).rejects.toThrow('github.invalidReview')
    expect(credentialReads).toBe(0)
  })

  it('returns core Pull Request detail and paginated conversation comments', async () => {
    const service = createGitHubPullRequestsService({
      projects: { getLinkedRepository: async () => repository },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'access-secret' }) as never },
      adapter: createAdapter()
    })

    await expect(
      service.getPullRequest({ projectId: 'project-1', number: 79 })
    ).resolves.toMatchObject({
      baseBranch: 'main',
      headBranch: 'feat/storage',
      commitCount: 4,
      conversationCommentCount: 1
    })
    await expect(
      service.listConversationComments({ projectId: 'project-1', number: 79, page: 1 })
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: '500', body: 'Please update the docs.' })],
      page: 1,
      hasNextPage: false
    })
  })
})
