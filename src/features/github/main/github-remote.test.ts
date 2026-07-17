import { describe, expect, it } from 'vitest'

import { canonicalizeGitHubRemote } from './github-remote'

describe('canonicalizeGitHubRemote', () => {
  it.each([
    'https://github.com/Bity-Labs/SpaceZero.git',
    'git@github.com:Bity-Labs/SpaceZero.git',
    'ssh://git@github.com/Bity-Labs/SpaceZero.git',
    'ssh://git@github.com/Bity-Labs/SpaceZero'
  ])('canonicalizes supported HTTPS and SSH remotes: %s', (remote) => {
    expect(canonicalizeGitHubRemote(remote)).toEqual({
      owner: 'Bity-Labs',
      repository: 'SpaceZero',
      key: 'bity-labs/spacezero'
    })
  })

  it.each([
    'https://gitlab.com/bity-labs/spacezero.git',
    'http://github.com/bity-labs/spacezero.git',
    'https://token@github.com/bity-labs/spacezero.git',
    'https://github.com/bity-labs',
    'https://github.com/bity-labs/spacezero/issues',
    'file:///tmp/spacezero'
  ])('rejects unsupported or non-GitHub remotes: %s', (remote) => {
    expect(canonicalizeGitHubRemote(remote)).toBeNull()
  })
})
