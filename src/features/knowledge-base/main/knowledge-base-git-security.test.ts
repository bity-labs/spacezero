import { describe, expect, it } from 'vitest'

import {
  redactGitSecrets,
  sanitizeGitRemoteUrl
} from './knowledge-base-git-security'

describe('Knowledge Base Git security', () => {
  it('returns only a safe scheme, host, and path for credential-bearing URLs', () => {
    expect(
      sanitizeGitRemoteUrl(
        'https://builder:secret@example.com/notes.git?private_token=query-secret&X-Amz-Signature=signed-secret&X-Amz-Security-Token=session-secret#fragment-secret'
      )
    ).toBe('https://example.com/notes.git')
  })

  it('drops SSH userinfo from scp-style remotes', () => {
    expect(sanitizeGitRemoteUrl('git@github.com:bity-labs/notes.git')).toBe(
      'github.com:bity-labs/notes.git'
    )
  })

  it('removes every query and fragment value from renderer-visible Git errors', () => {
    const message =
      "fatal: unable to access 'https://builder:secret@example.com/notes.git?oauth_token=query-secret&X-Amz-Signature=signed-secret#fragment-secret': authentication failed"

    const redacted = redactGitSecrets(message)

    expect(redacted).toContain('https://example.com/notes.git')
    expect(redacted).not.toMatch(
      /builder|secret|oauth_token|X-Amz-Signature|query-secret|signed-secret|fragment-secret/
    )
  })

  it('sanitizes arbitrary query names instead of relying on a credential allowlist', () => {
    expect(
      sanitizeGitRemoteUrl(
        'ssh://git@example.com/team/notes.git?custom_auth=do-not-expose#private'
      )
    ).toBe('ssh://example.com/team/notes.git')
  })
})
