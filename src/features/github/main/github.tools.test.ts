import { describe, expect, it, vi } from 'vitest'

import { createGitHubTools } from './github.tools'

describe('GitHub Pull Request Workspace Tool', () => {
  it('binds Pull Request creation to the executing Project Session and returns structured partial failure without credentials', async () => {
    const createOrReusePullRequest = vi.fn(async () => ({
      status: 'failed' as const,
      pushStatus: 'succeeded' as const,
      error: { code: 'github.repositoryAccessRevoked', retryable: false }
    }))
    const [tool] = createGitHubTools({ createOrReusePullRequest })
    expect(
      tool?.inputSchema.safeParse({
        expectedHeadSha: '0123456789abcdef0123456789abcdef01234567',
        title: 'Create a secure PR',
        accessToken: 'must-not-enter-agent-input'
      }).success
    ).toBe(false)

    const result = await tool?.handler(
      {
        expectedHeadSha: '0123456789abcdef0123456789abcdef01234567',
        title: 'Create a secure PR'
      },
      { sessionId: 'session-1' }
    )

    expect(createOrReusePullRequest).toHaveBeenCalledWith({
      sessionId: 'session-1',
      expectedHeadSha: '0123456789abcdef0123456789abcdef01234567',
      title: 'Create a secure PR'
    })
    expect(result).toEqual({
      ok: true,
      data: {
        status: 'failed',
        pushStatus: 'succeeded',
        error: { code: 'github.repositoryAccessRevoked', retryable: false }
      }
    })
    expect(JSON.stringify(result)).not.toContain('token')
  })

  it('fails closed outside an executing Project Session', async () => {
    const createOrReusePullRequest = vi.fn()
    const [tool] = createGitHubTools({ createOrReusePullRequest })

    await expect(
      tool?.handler({
        expectedHeadSha: '0123456789abcdef0123456789abcdef01234567',
        title: 'No session'
      })
    ).resolves.toMatchObject({ ok: false, error: { code: 'github.sessionUnavailable' } })
    expect(createOrReusePullRequest).not.toHaveBeenCalled()
  })
})
