import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('@octokit/rest', () => ({
  Octokit: class {
    request = request
  }
}))

import {
  classifyPullRequestPatch,
  createGitHubPullRequestsAdapter
} from './github-pull-requests.adapter'

beforeEach(() => request.mockReset())

describe('GitHub Pull Request adapter', () => {
  it('loads and maps a paginated Pull Request commit page', async () => {
    request.mockResolvedValue({
      data: [
        {
          sha: '0123456789abcdef0123456789abcdef01234567',
          html_url: 'https://github.com/bity-labs/spacezero/commit/0123456',
          author: {
            id: 42,
            login: 'octocat',
            avatar_url: 'https://avatars.example/42'
          },
          commit: {
            message: 'feat: add managed worktrees',
            author: { date: '2026-07-18T01:30:00.000Z' }
          }
        }
      ],
      headers: { link: '<https://api.github.com/page=2>; rel="next"' }
    })

    await expect(
      createGitHubPullRequestsAdapter().listCommits({
        accessToken: 'access-secret',
        owner: 'bity-labs',
        repository: 'spacezero',
        number: 100,
        page: 1,
        perPage: 30
      })
    ).resolves.toEqual({
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
      hasNextPage: true
    })
    expect(request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', {
      owner: 'bity-labs',
      repo: 'spacezero',
      pull_number: 100,
      page: 1,
      per_page: 30
    })
  })
})

describe('GitHub Pull Request patch classification', () => {
  it('marks a complete text patch as available', () => {
    expect(
      classifyPullRequestPatch({
        patch: '@@ -1 +1,2 @@\n-old\n+new\n+line',
        changes: 3,
        additions: 2,
        deletions: 1
      })
    ).toEqual({
      status: 'available',
      text: '@@ -1 +1,2 @@\n-old\n+new\n+line',
      truncated: false
    })
  })

  it('marks an incomplete text patch as truncated', () => {
    expect(
      classifyPullRequestPatch({
        patch: '@@ -1 +1 @@\n-old\n+new',
        changes: 10,
        additions: 5,
        deletions: 5
      })
    ).toMatchObject({ status: 'available', truncated: true })
  })

  it.each([
    [{ patch: undefined, changes: 0, additions: 0, deletions: 0 }, 'binary'],
    [{ patch: undefined, changes: 500, additions: 300, deletions: 200 }, 'omitted'],
    [{ patch: null, changes: 1, additions: 1, deletions: 0 }, 'unavailable']
  ] as const)('represents a missing patch as %s', (file, status) => {
    expect(classifyPullRequestPatch(file)).toEqual({ status })
  })
})
