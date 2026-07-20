import { describe, expect, it } from 'vitest'

import { isAllowedGitHubRepositoryUrl } from './external-url-policy'

describe('external URL policy', () => {
  it.each([
    'https://github.com/bity-labs/spacezero',
    'https://github.com/bity-labs/spacezero/',
    'https://github.com/octocat/hello_world.js'
  ])('allows the intended GitHub repository URL %s', (url) => {
    expect(isAllowedGitHubRepositoryUrl(url)).toBe(true)
  })

  it.each([
    'https://example.com/bity-labs/spacezero',
    'https://github.com.example.com/bity-labs/spacezero',
    'http://github.com/bity-labs/spacezero',
    'ftp://github.com/bity-labs/spacezero',
    'javascript:alert(1)',
    'https://user@github.com/bity-labs/spacezero',
    'https://user:secret@github.com/bity-labs/spacezero',
    'https://github.com:443/bity-labs/spacezero',
    'https://github.com:8443/bity-labs/spacezero',
    'https://github.com/bity-labs',
    'https://github.com/bity-labs/spacezero/issues/83',
    'https://github.com/bity-labs/spacezero?tab=readme',
    'https://github.com/bity-labs/spacezero#readme',
    'https://github.com/bity-labs/repo/../spacezero',
    'not a URL'
  ])('denies an untrusted external URL %s', (url) => {
    expect(isAllowedGitHubRepositoryUrl(url)).toBe(false)
  })
})
