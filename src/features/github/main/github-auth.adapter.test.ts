import { describe, expect, it } from 'vitest'

import { createGitHubAuthAdapter } from './github-auth.adapter'

describe('GitHub auth adapter', () => {
  it('maps device-flow slow down without leaking the provider description', async () => {
    const requests: Array<{ url: string; body: string }> = []
    const adapter = createGitHubAuthAdapter({
      fetchImpl: (async (input, init) => {
        requests.push({ url: String(input), body: String(init?.body) })
        return new Response(
          JSON.stringify({ error: 'slow_down', error_description: 'provider detail' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }) as typeof fetch
    })

    await expect(adapter.pollDeviceCode('Iv1.client', 'device-secret')).resolves.toEqual({
      status: 'slow_down'
    })
    expect(requests[0]).toEqual({
      url: 'https://github.com/login/oauth/access_token',
      body: 'client_id=Iv1.client&device_code=device-secret&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code'
    })
  })

  it('classifies a provider-rejected refresh grant as reconnect required', async () => {
    const adapter = createGitHubAuthAdapter({
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            error: 'bad_refresh_token',
            error_description: 'The refresh token is invalid or revoked.'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )) as typeof fetch
    })

    await expect(
      adapter.refreshAccessToken('Iv1.client', 'revoked-refresh-secret')
    ).rejects.toMatchObject({ code: 'reconnect-required' })
  })

  it('calculates access and refresh expiry from the token response', async () => {
    const adapter = createGitHubAuthAdapter({
      now: () => new Date('2026-07-18T00:00:00.000Z'),
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            access_token: 'access-secret',
            expires_in: 3600,
            refresh_token: 'refresh-secret',
            refresh_token_expires_in: 7200
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )) as typeof fetch
    })

    await expect(adapter.refreshAccessToken('Iv1.client', 'refresh-secret')).resolves.toEqual({
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      accessTokenExpiresAt: '2026-07-18T01:00:00.000Z',
      refreshTokenExpiresAt: '2026-07-18T02:00:00.000Z'
    })
  })
})
