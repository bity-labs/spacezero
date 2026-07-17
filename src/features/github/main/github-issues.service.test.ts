import { describe, expect, it } from 'vitest'

import type { GitHubRepository } from '../shared'
import { createGitHubIssuesService, type GitHubIssuesAdapter } from './github-issues.service'

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

function createAdapter(): GitHubIssuesAdapter {
  return {
    async listIssues() {
      return {
        items: [
          {
            number: 83,
            title: 'GitHub integration',
            body: 'Issue body',
            state: 'open',
            htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83',
            author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
            labels: [{ id: '1', name: 'enhancement', color: '0e8a16' }],
            assignees: [],
            commentCount: 2,
            createdAt: '2026-07-18T00:00:00.000Z',
            updatedAt: '2026-07-18T01:00:00.000Z',
            isPullRequest: false
          },
          {
            number: 84,
            title: 'A pull request from the combined endpoint',
            body: null,
            state: 'open',
            htmlUrl: 'https://github.com/bity-labs/spacezero/pull/84',
            author: null,
            labels: [],
            assignees: [],
            commentCount: 0,
            createdAt: '2026-07-18T00:00:00.000Z',
            updatedAt: '2026-07-18T00:00:00.000Z',
            isPullRequest: true
          }
        ],
        page: 1,
        hasNextPage: true
      }
    },
    async getIssue() {
      return {
        number: 83,
        title: 'GitHub integration',
        body: 'Issue body',
        state: 'open',
        htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83',
        author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
        labels: [{ id: '1', name: 'enhancement', color: '0e8a16' }],
        assignees: [{ id: '84', login: 'maintainer', avatarUrl: 'https://avatars.example/84' }],
        commentCount: 1,
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T01:00:00.000Z',
        isPullRequest: false
      }
    },
    async listIssueComments() {
      return {
        items: [
          {
            id: '500',
            body: 'Looks good',
            htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83#issuecomment-500',
            author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
            createdAt: '2026-07-18T02:00:00.000Z',
            updatedAt: '2026-07-18T02:00:00.000Z'
          }
        ],
        page: 1,
        hasNextPage: false
      }
    },
    async createIssueComment(request) {
      return {
        id: '501',
        body: request.body,
        htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83#issuecomment-501',
        author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
        createdAt: '2026-07-18T03:00:00.000Z',
        updatedAt: '2026-07-18T03:00:00.000Z'
      }
    },
    async updateIssueState(request) {
      return { ...(await createAdapter().getIssue(request)), state: request.state }
    }
  }
}

describe('GitHub Issues service', () => {
  it('scopes requests to the linked Project and excludes Pull Requests', async () => {
    const calls: unknown[] = []
    const adapter = createAdapter()
    const listIssues = adapter.listIssues
    adapter.listIssues = async (request) => {
      calls.push(request)
      return listIssues(request)
    }
    const service = createGitHubIssuesService({
      projects: { getLinkedRepository: async () => repository },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'access-secret' }) as never },
      adapter
    })

    const page = await service.listIssues({ projectId: 'project-1', page: 1 })

    expect(calls).toEqual([
      {
        accessToken: 'access-secret',
        owner: 'bity-labs',
        repository: 'spacezero',
        page: 1,
        perPage: 30
      }
    ])
    expect(page).toEqual({
      items: [expect.objectContaining({ number: 83, title: 'GitHub integration' })],
      page: 1,
      hasNextPage: true
    })
    expect(JSON.stringify(page)).not.toContain('access-secret')
    expect(JSON.stringify(page)).not.toContain('combined endpoint')
  })

  it('returns Issue detail and paginated comments through sanitized models', async () => {
    const service = createGitHubIssuesService({
      projects: { getLinkedRepository: async () => repository },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'access-secret' }) as never },
      adapter: createAdapter()
    })

    await expect(service.getIssue({ projectId: 'project-1', number: 83 })).resolves.toMatchObject({
      number: 83,
      assignees: [{ login: 'maintainer' }]
    })
    await expect(
      service.listIssueComments({ projectId: 'project-1', number: 83, page: 1 })
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: '500', body: 'Looks good' })],
      page: 1,
      hasNextPage: false
    })
  })

  it('comments and changes Issue state only after the adapter confirms each mutation', async () => {
    const adapter = createAdapter()
    const commentRequests: unknown[] = []
    const stateRequests: unknown[] = []
    const createComment = adapter.createIssueComment
    const updateState = adapter.updateIssueState
    adapter.createIssueComment = async (request) => {
      commentRequests.push(request)
      return createComment(request)
    }
    adapter.updateIssueState = async (request) => {
      stateRequests.push(request)
      return updateState(request)
    }
    const service = createGitHubIssuesService({
      projects: { getLinkedRepository: async () => repository },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'access-secret' }) as never },
      adapter
    })

    await expect(
      service.createIssueComment({ projectId: 'project-1', number: 83, body: '  A comment  ' })
    ).resolves.toMatchObject({ body: 'A comment' })
    await expect(
      service.updateIssueState({ projectId: 'project-1', number: 83, state: 'closed' })
    ).resolves.toMatchObject({ state: 'closed' })
    expect(commentRequests).toEqual([
      expect.objectContaining({ accessToken: 'access-secret', number: 83, body: 'A comment' })
    ])
    expect(stateRequests).toEqual([
      expect.objectContaining({ accessToken: 'access-secret', number: 83, state: 'closed' })
    ])
  })

  it('rejects an empty comment before resolving credentials or calling GitHub', async () => {
    let credentialReads = 0
    const service = createGitHubIssuesService({
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
      service.createIssueComment({ projectId: 'project-1', number: 83, body: '   ' })
    ).rejects.toThrow('github.invalidComment')
    expect(credentialReads).toBe(0)
  })

  it('rejects a Pull Request number opened through the Issue detail API', async () => {
    const adapter = createAdapter()
    adapter.getIssue = async () => ({
      ...(await createAdapter().getIssue({} as never)),
      isPullRequest: true
    })
    const service = createGitHubIssuesService({
      projects: { getLinkedRepository: async () => repository },
      auth: { getAuthorizedCredential: async () => ({ accessToken: 'access-secret' }) as never },
      adapter
    })

    await expect(service.getIssue({ projectId: 'project-1', number: 84 })).rejects.toThrow(
      'github.issueNotFound'
    )
  })
})
