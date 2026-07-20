import { Octokit } from '@octokit/rest'
import { z } from 'zod'

import {
  GitHubIntegrationError,
  type GitHubAuthAdapter,
  type GitHubDevicePollResult,
  type GitHubTokenSet
} from './github-auth.service'

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const OAUTH_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
const INVALID_REFRESH_GRANT_ERRORS = new Set(['bad_refresh_token', 'invalid_grant'])

const deviceGrantSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive()
})

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  refresh_token_expires_in: z.number().int().positive()
})

const oauthErrorSchema = z.object({ error: z.string() })

export function createGitHubAuthAdapter({
  fetchImpl = globalThis.fetch,
  now = () => new Date()
}: {
  fetchImpl?: typeof fetch
  now?: () => Date
} = {}): GitHubAuthAdapter {
  async function postOAuth(
    url: string,
    body: URLSearchParams,
    signal?: AbortSignal,
    reconnectErrors: ReadonlySet<string> = new Set()
  ): Promise<unknown> {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body,
      signal
    })
    const payload: unknown = await response.json()
    const providerError = oauthErrorSchema.safeParse(payload)
    if (providerError.success && reconnectErrors.has(providerError.data.error)) {
      throw new GitHubIntegrationError('reconnect-required')
    }
    if (!response.ok) throw new Error('github.oauthRequestFailed')
    return payload
  }

  function toTokens(payload: unknown): GitHubTokenSet {
    const token = tokenResponseSchema.parse(payload)
    const issuedAt = now().getTime()
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessTokenExpiresAt: new Date(issuedAt + token.expires_in * 1_000).toISOString(),
      refreshTokenExpiresAt: new Date(
        issuedAt + token.refresh_token_expires_in * 1_000
      ).toISOString()
    }
  }

  return {
    async requestDeviceCode(clientId, signal) {
      const payload = deviceGrantSchema.parse(
        await postOAuth(DEVICE_CODE_URL, new URLSearchParams({ client_id: clientId }), signal)
      )
      return {
        deviceCode: payload.device_code,
        userCode: payload.user_code,
        verificationUri: payload.verification_uri,
        expiresInSeconds: payload.expires_in,
        intervalSeconds: payload.interval
      }
    },

    async pollDeviceCode(clientId, deviceCode, signal): Promise<GitHubDevicePollResult> {
      const payload = await postOAuth(
        ACCESS_TOKEN_URL,
        new URLSearchParams({
          client_id: clientId,
          device_code: deviceCode,
          grant_type: OAUTH_GRANT_TYPE
        }),
        signal
      )
      const error = oauthErrorSchema.safeParse(payload)
      if (error.success) {
        if (error.data.error === 'authorization_pending') return { status: 'pending' }
        if (error.data.error === 'slow_down') return { status: 'slow_down' }
        if (error.data.error === 'access_denied') return { status: 'denied' }
        if (error.data.error === 'expired_token') return { status: 'expired' }
        throw new Error('github.oauthAuthorizationFailed')
      }
      return { status: 'authorized', tokens: toTokens(payload) }
    },

    async refreshAccessToken(clientId, refreshToken, signal) {
      return toTokens(
        await postOAuth(
          ACCESS_TOKEN_URL,
          new URLSearchParams({
            client_id: clientId,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
          }),
          signal,
          INVALID_REFRESH_GRANT_ERRORS
        )
      )
    },

    async getIdentity(accessToken, signal) {
      const octokit = new Octokit({ auth: accessToken })
      const response = await octokit.request('GET /user', { request: { signal } })
      return {
        id: String(response.data.id),
        login: response.data.login,
        avatarUrl: response.data.avatar_url,
        profileUrl: response.data.html_url
      }
    }
  }
}
