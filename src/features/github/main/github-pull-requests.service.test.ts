import { describe, expect, it, vi } from 'vitest'

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
            number: 78,
            title: 'Merged pull request',
            state: 'merged',
            isDraft: false,
            htmlUrl: 'https://github.com/bity-labs/spacezero/pull/78',
            author: null,
            baseBranch: 'main',
            headBranch: 'feat/merged',
            createdAt: '2026-07-18T00:00:00.000Z',
            updatedAt: '2026-07-18T01:00:00.000Z'
          },
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
    async listCommits() {
      return {
        items: [
          {
            sha: '0123456789abcdef0123456789abcdef01234567',
            message: 'feat: add managed worktrees',
            htmlUrl: 'https://github.com/bity-labs/spacezero/commit/0123456',
            author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
            authoredAt: '2026-07-18T01:30:00.000Z'
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
    async getBranchHeadSha() {
      return '0123456789abcdef0123456789abcdef01234567'
    },
    async findOpenPullRequests() {
      return []
    },
    async createPullRequest(request) {
      return {
        number: 80,
        htmlUrl: 'https://github.com/bity-labs/spacezero/pull/80',
        headBranch: request.headBranch,
        headSha: '0123456789abcdef0123456789abcdef01234567',
        baseBranch: request.baseBranch
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

describe('GitHub Pull Request creation capability', () => {
  const expectedHeadSha = '0123456789abcdef0123456789abcdef01234567'

  function createCreationService(
    adapter: GitHubPullRequestsAdapter,
    overrides?: {
      getLinkedRepository?: () => Promise<GitHubRepository>
    }
  ) {
    return createGitHubPullRequestsService({
      projects: {
        getLinkedRepository: overrides?.getLinkedRepository ?? (async () => repository)
      },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'app-user-secret' }) as never },
      adapter,
      sessions: {
        findSessionById: async (sessionId) => {
          if (sessionId === 'chat-1') {
            return {
              projectId: 'project-1',
              archivedAt: null,
              workspaceContextSessionId: 'session-1'
            }
          }
          return sessionId === 'session-1'
            ? {
                projectId: 'project-1',
                worktreeBranch: 'feat/create-pr',
                archivedAt: null,
                workspaceContextSessionId: null
              }
            : undefined
        }
      }
    })
  }

  it('creates a non-draft Pull Request for the main-resolved repository, session head, and default base without exposing the credential', async () => {
    const adapter = createAdapter()
    const createPullRequest = vi.spyOn(adapter, 'createPullRequest')
    const result = await createCreationService(adapter).createOrReusePullRequest({
      sessionId: 'chat-1',
      expectedHeadSha,
      title: 'Create the Pull Request capability'
    })

    expect(createPullRequest).toHaveBeenCalledWith({
      accessToken: 'app-user-secret',
      owner: 'bity-labs',
      repository: 'spacezero',
      headBranch: 'feat/create-pr',
      baseBranch: 'main',
      title: 'Create the Pull Request capability'
    })
    expect(result).toMatchObject({
      status: 'created',
      pushStatus: 'succeeded',
      pullRequest: {
        htmlUrl: 'https://github.com/bity-labs/spacezero/pull/80',
        headBranch: 'feat/create-pr',
        baseBranch: 'main'
      }
    })
    expect(JSON.stringify(result)).not.toContain('app-user-secret')
  })

  it('reuses one exact open Pull Request and fails closed when the exact match is ambiguous', async () => {
    const adapter = createAdapter()
    const match = {
      number: 81,
      htmlUrl: 'https://github.com/bity-labs/spacezero/pull/81',
      headBranch: 'feat/create-pr',
      headSha: expectedHeadSha,
      baseBranch: 'main'
    }
    adapter.findOpenPullRequests = vi.fn(async () => [match])
    adapter.createPullRequest = vi.fn()
    await expect(
      createCreationService(adapter).createOrReusePullRequest({
        sessionId: 'session-1',
        expectedHeadSha,
        title: 'Ignored for reuse'
      })
    ).resolves.toMatchObject({ status: 'reused', pullRequest: { number: 81 } })
    expect(adapter.createPullRequest).not.toHaveBeenCalled()

    adapter.findOpenPullRequests = vi.fn(async () => [match, { ...match, number: 82 }])
    await expect(
      createCreationService(adapter).createOrReusePullRequest({
        sessionId: 'session-1',
        expectedHeadSha,
        title: 'Must not create a duplicate'
      })
    ).resolves.toEqual({
      status: 'failed',
      pushStatus: 'succeeded',
      error: { code: 'github.ambiguousPullRequestMatch', retryable: false }
    })
    expect(adapter.createPullRequest).not.toHaveBeenCalled()
  })

  it('revalidates repository authorization and returns a sanitized partial failure after push', async () => {
    const adapter = createAdapter()
    adapter.createPullRequest = vi.fn()
    const service = createCreationService(adapter, {
      getLinkedRepository: async () => {
        throw new Error('github.repositoryAccessRevoked')
      }
    })

    await expect(
      service.createOrReusePullRequest({
        sessionId: 'session-1',
        expectedHeadSha,
        title: 'Unauthorized attempt'
      })
    ).resolves.toEqual({
      status: 'failed',
      pushStatus: 'succeeded',
      error: { code: 'github.repositoryAccessRevoked', retryable: false }
    })
    expect(adapter.createPullRequest).not.toHaveBeenCalled()
  })

  it('reconciles a create timeout before retrying so a completed request remains idempotent', async () => {
    const adapter = createAdapter()
    const createdMatch = {
      number: 83,
      htmlUrl: 'https://github.com/bity-labs/spacezero/pull/83',
      headBranch: 'feat/create-pr',
      headSha: expectedHeadSha,
      baseBranch: 'main'
    }
    let lookupCount = 0
    adapter.findOpenPullRequests = vi.fn(async () => {
      lookupCount += 1
      return lookupCount === 1 ? [] : [createdMatch]
    })
    adapter.createPullRequest = vi.fn(async () => {
      throw new Error('github.network-error')
    })

    await expect(
      createCreationService(adapter).createOrReusePullRequest({
        sessionId: 'session-1',
        expectedHeadSha,
        title: 'Timeout-safe creation'
      })
    ).resolves.toMatchObject({ status: 'reused', pullRequest: { number: 83 } })
    expect(adapter.createPullRequest).toHaveBeenCalledTimes(1)
  })

  it('retries one unresolved network failure and never returns an untrusted Pull Request URL', async () => {
    const adapter = createAdapter()
    adapter.findOpenPullRequests = vi.fn(async () => [])
    adapter.createPullRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error('github.network-error'))
      .mockResolvedValueOnce({
        number: 84,
        htmlUrl: 'https://evil.example/bity-labs/spacezero/pull/84',
        headBranch: 'feat/create-pr',
        headSha: expectedHeadSha,
        baseBranch: 'main'
      })

    await expect(
      createCreationService(adapter).createOrReusePullRequest({
        sessionId: 'session-1',
        expectedHeadSha,
        title: 'Validate URL'
      })
    ).resolves.toEqual({
      status: 'failed',
      pushStatus: 'succeeded',
      error: { code: 'github.invalidPullRequestResponse', retryable: false }
    })
    expect(adapter.createPullRequest).toHaveBeenCalledTimes(2)
  })
})

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
    expect(JSON.stringify(page)).not.toContain('Merged pull request')
  })

  it('loads independently paginated commits, files, checks, statuses, and reviews', async () => {
    const adapter = createAdapter()
    const requests: unknown[] = []
    const listCommits = adapter.listCommits
    adapter.listCommits = async (request) => {
      requests.push(request)
      return listCommits(request)
    }
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
      service.listCommits({ projectId: 'project-1', number: 79, page: 1 })
    ).resolves.toMatchObject({
      items: [
        { sha: '0123456789abcdef0123456789abcdef01234567', message: 'feat: add managed worktrees' }
      ]
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
        page: 1,
        perPage: 30
      }),
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

  it('rejects an Issue number before creating a Pull Request conversation comment', async () => {
    const adapter = createAdapter()
    adapter.getPullRequest = vi.fn(async () => {
      throw new Error('github.notFound')
    })
    adapter.createConversationComment = vi.fn(async () => {
      throw new Error('Pull Request comment mutation must not run')
    })
    const service = createGitHubPullRequestsService({
      projects: { getLinkedRepository: async () => repository },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'access-secret' }) as never },
      adapter
    })

    await expect(
      service.createConversationComment({
        projectId: 'project-1',
        number: 83,
        body: 'Wrong resource'
      })
    ).rejects.toThrow('github.notFound')
    expect(adapter.createConversationComment).not.toHaveBeenCalled()
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
