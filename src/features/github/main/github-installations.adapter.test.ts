import { describe, expect, it } from 'vitest'

import { GitHubInstallationAccessError } from './github-connection.service'
import { createGitHubInstallationsAdapter } from './github-installations.adapter'

function providerError(
  status: number,
  response: { headers?: Record<string, string>; data?: { message: string } } = {},
  message = 'GitHub request failed'
): Error & { status: number; response: typeof response } {
  return Object.assign(new Error(message), { status, response })
}

function createFailingAdapter(error: Error) {
  return createGitHubInstallationsAdapter({
    createClient: () => ({
      request: (async () => {
        throw error
      }) as never
    })
  })
}

describe('GitHub installations adapter errors', () => {
  it('preserves a primary rate limit while listing installations', async () => {
    const error = providerError(403, {
      headers: { 'x-ratelimit-remaining': '0' }
    })

    await expect(createFailingAdapter(error).listInstallations('access-secret')).rejects.toThrow(
      'github.rateLimited'
    )
  })

  it.each([
    [
      'secondary 403',
      providerError(
        403,
        {
          data: { message: 'You have exceeded a secondary rate limit.' },
          headers: {}
        },
        'You have exceeded a secondary rate limit.'
      )
    ],
    ['HTTP 429', providerError(429, { headers: { 'retry-after': '30' } })]
  ])('preserves %s while listing installation repositories', async (_name, error) => {
    await expect(
      createFailingAdapter(error).listInstallationRepositories('access-secret', '100')
    ).rejects.toThrow('github.rateLimited')
  })

  it('maps a non-rate-limit installation 403 to organization authorization', async () => {
    const error = providerError(403, { headers: {} })

    await expect(
      createFailingAdapter(error).listInstallationRepositories('access-secret', '100')
    ).rejects.toEqual(new GitHubInstallationAccessError('organization-authorization-required'))
  })
})
