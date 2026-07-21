import { describe, expect, it } from 'vitest'

import { toGitHubApiError } from './github-api-error'

describe('GitHub API rate-limit classification', () => {
  it.each([
    ['primary limit', { status: 403, response: { headers: { 'x-ratelimit-remaining': '0' } } }],
    [
      'Pull Request endpoint secondary retry header',
      { status: 403, response: { headers: { 'retry-after': '60' } } }
    ],
    [
      'secondary provider message',
      {
        status: 403,
        response: {
          headers: {},
          data: { message: 'You have exceeded a secondary rate limit. Please wait.' }
        }
      }
    ],
    ['Issue endpoint HTTP 429', { status: 429, response: { headers: {} } }]
  ])('maps %s honestly without exposing provider payloads', (_name, providerError) => {
    const error = toGitHubApiError(providerError)

    expect(error.message).toBe('github.rateLimited')
    expect(error.message).not.toContain('Please wait')
  })

  it('keeps a non-rate-limit 403 as a permission failure', () => {
    expect(toGitHubApiError({ status: 403 }).message).toBe('github.permissionDenied')
  })
})
