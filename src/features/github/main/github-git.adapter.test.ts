import { describe, expect, it } from 'vitest'

import { createGitHubRemoteAdapter } from './github-git.adapter'

describe('GitHub remote adapter', () => {
  it('reads remote URLs without issuing a mutating Git command', async () => {
    const calls: Array<{ file: string; args: string[] }> = []
    const adapter = createGitHubRemoteAdapter({
      runGit: async (file, args) => {
        calls.push({ file, args })
        return {
          stdout:
            'remote.origin.url git@github.com:bity-labs/spacezero.git\nremote.upstream.url https://github.com/octocat/spacezero.git\n'
        }
      }
    })

    await expect(adapter.listRemotes('/external/spacezero')).resolves.toEqual([
      'git@github.com:bity-labs/spacezero.git',
      'https://github.com/octocat/spacezero.git'
    ])
    expect(calls).toEqual([
      {
        file: 'git',
        args: ['-C', '/external/spacezero', 'config', '--get-regexp', '^remote\\..*\\.url$']
      }
    ])
  })
})
