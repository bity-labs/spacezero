import { describe, expect, it } from 'vitest'

import { toExternalGitRemoteUrl } from './knowledge-base-recovery.service'

describe('toExternalGitRemoteUrl', () => {
  it('normalizes HTTPS and SSH Git remotes for external recovery', () => {
    expect(toExternalGitRemoteUrl('https://github.com/bity-labs/spacezero.git')).toBe(
      'https://github.com/bity-labs/spacezero'
    )
    expect(toExternalGitRemoteUrl('git@github.com:bity-labs/spacezero.git')).toBe(
      'https://github.com/bity-labs/spacezero'
    )
    expect(toExternalGitRemoteUrl('ssh://git@github.com/bity-labs/spacezero.git')).toBe(
      'https://github.com/bity-labs/spacezero'
    )
  })

  it('rejects local or unsupported remotes instead of passing them to the shell', () => {
    expect(toExternalGitRemoteUrl('/tmp/knowledge.git')).toBeUndefined()
    expect(toExternalGitRemoteUrl('file:///tmp/knowledge.git')).toBeUndefined()
  })
})
