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
