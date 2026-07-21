import { describe, expect, it, vi } from 'vitest'

import type { GitHubIssue, GitHubRepository } from '../shared'
import { createGitHubSourceSessionsService } from './github-source-sessions.service'

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

const issue: GitHubIssue = {
  number: 83,
  title: 'GitHub integration',
  body: 'Implement the linked workflow.',
  state: 'open',
  htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83',
  author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
  labels: [{ id: '1', name: 'enhancement', color: '0e8a16' }],
  assignees: [{ id: '84', login: 'maintainer', avatarUrl: 'https://avatars.example/84' }],
  commentCount: 1,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T01:00:00.000Z'
}

describe('GitHub source Sessions service', () => {
  it('creates an Issue-linked managed Session with runtime-only structured context', async () => {
    const createSession = vi.fn(async (request) => ({
      state: {} as never,
      session: {
        id: 'session-1',
        kind: 'project' as const,
        projectId: request.projectId,
        title: request.title ?? 'Session',
        status: 'idle' as const,
        source: request.source,
        worktree: {
          path: '/SpaceZero/worktrees/project-1/session-1',
          branch: 'spacezero/issue-83-session-1',
          baseRevision: 'abc123'
        },
        createdAt: '2026-07-18T02:00:00.000Z',
        updatedAt: '2026-07-18T02:00:00.000Z'
      }
    }))
    const service = createGitHubSourceSessionsService({
      projects: { getLinkedRepository: async () => repository },
      issues: {
        getIssue: async () => issue,
        listIssueComments: async () => ({
          items: [
            {
              id: '500',
              body: 'Remember the revoked-access state.',
              htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83#issuecomment-500',
              author: { id: '84', login: 'maintainer', avatarUrl: 'https://avatars.example/84' },
              createdAt: '2026-07-18T01:30:00.000Z',
              updatedAt: '2026-07-18T01:30:00.000Z'
            }
          ],
          page: 1,
          hasNextPage: false
        })
      },
      createSession
    })

    const session = await service.startIssueSession({ projectId: 'project-1', number: 83 })

    expect(session).toMatchObject({
      id: 'session-1',
      source: {
        type: 'issue',
        repositoryId: '1000',
        repositoryNodeId: 'R_1000',
        repositoryOwner: 'bity-labs',
        repositoryName: 'spacezero',
        repositoryFullName: 'bity-labs/spacezero',
        number: 83,
        url: issue.htmlUrl,
        title: issue.title
      }
    })
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        title: 'Issue #83: GitHub integration',
        source: expect.objectContaining({ type: 'issue', number: 83 }),
        systemPromptContext: expect.stringContaining('Implement the linked workflow.')
      })
    )
    expect(createSession.mock.calls[0]?.[0].systemPromptContext).toContain(
      'Remember the revoked-access state.'
    )
    expect(createSession.mock.calls[0]?.[0].systemPromptContext).toContain(
      'Do not mutate GitHub unless the builder explicitly asks.'
    )
  })

  it('creates a Pull Request-linked Session at the fetched PR ref with available review context', async () => {
    const createSession = vi.fn(async (request) => ({
      session: {
        id: 'session-pr-1',
        kind: 'project' as const,
        projectId: request.projectId,
        title: request.title ?? 'Session',
        status: 'idle' as const,
        source: request.source,
        worktree: {
          path: '/SpaceZero/worktrees/project-1/session-pr-1',
          branch: 'spacezero/pull-request-79-session-pr-1',
          baseRevision: 'def456'
        },
        createdAt: '2026-07-18T03:00:00.000Z',
        updatedAt: '2026-07-18T03:00:00.000Z'
      }
    }))
    const emptyPage = { items: [], page: 1, hasNextPage: false }
    const service = createGitHubSourceSessionsService({
      projects: { getLinkedRepository: async () => repository },
      issues: {
        getIssue: async () => issue,
        listIssueComments: async () => emptyPage
      },
      pullRequests: {
        getPullRequest: async () => ({
          number: 79,
          title: 'Managed storage foundation',
          body: 'Review the managed storage changes.',
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
        }),
        listConversationComments: async () => ({
          items: [
            {
              id: 'comment-1',
              body: 'Please update the docs.',
              htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79#comment-1',
              author: { id: '84', login: 'reviewer', avatarUrl: 'https://avatars.example/84' },
              createdAt: '2026-07-18T02:00:00.000Z',
              updatedAt: '2026-07-18T02:00:00.000Z'
            }
          ],
          page: 1,
          hasNextPage: false
        }),
        listFiles: async () => ({
          items: [
            {
              sha: 'abc',
              filename: 'src/index.ts',
              previousFilename: null,
              status: 'modified',
              additions: 2,
              deletions: 1,
              changes: 3,
              patch: { status: 'available', text: '@@', truncated: false }
            }
          ],
          page: 1,
          hasNextPage: false
        }),
        listCheckRuns: async () => ({
          items: [
            {
              id: 'check-1',
              name: 'test',
              status: 'completed',
              conclusion: 'success',
              detailsUrl: null,
              appName: 'GitHub Actions',
              startedAt: null,
              completedAt: null
            }
          ],
          page: 1,
          hasNextPage: false
        }),
        listCommitStatuses: async () => emptyPage,
        listReviews: async () => ({
          items: [
            {
              id: 'review-1',
              state: 'changes_requested',
              body: 'Add a rollback test.',
              htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79#review-1',
              author: { id: '84', login: 'reviewer', avatarUrl: 'https://avatars.example/84' },
              submittedAt: '2026-07-18T02:00:00.000Z'
            }
          ],
          page: 1,
          hasNextPage: false
        })
      },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'access-secret' }) },
      createSession
    })

    const session = await service.startPullRequestSession({ projectId: 'project-1', number: 79 })

    expect(session).toMatchObject({
      source: { type: 'pull-request', repositoryId: '1000', number: 79 },
      worktree: { baseRevision: 'def456' }
    })
    expect(JSON.stringify(session)).not.toContain('access-secret')
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ type: 'pull-request', number: 79 }),
        startPoint: {
          kind: 'github-ref',
          remoteUrl: 'https://github.com/bity-labs/spacezero.git',
          ref: 'refs/pull/79/head',
          accessToken: 'access-secret'
        },
        systemPromptContext: expect.stringContaining('Add a rollback test.')
      })
    )
    expect(createSession.mock.calls[0]?.[0].systemPromptContext).toContain('src/index.ts')
    expect(createSession.mock.calls[0]?.[0].systemPromptContext).toContain('Check test: success')
    expect(createSession.mock.calls[0]?.[0].systemPromptContext).toContain(
      'Do not comment, approve, request changes, merge, close'
    )
  })

  it('does not create a Session when current Issue access cannot be verified', async () => {
    const createSession = vi.fn()
    const service = createGitHubSourceSessionsService({
      projects: { getLinkedRepository: async () => repository },
      issues: {
        getIssue: async () => {
          throw new Error('github.repositoryAccessRevoked')
        },
        listIssueComments: vi.fn()
      },
      createSession
    })

    await expect(service.startIssueSession({ projectId: 'project-1', number: 83 })).rejects.toThrow(
      'github.repositoryAccessRevoked'
    )
    expect(createSession).not.toHaveBeenCalled()
  })
})
