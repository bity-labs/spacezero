import { describe, expect, it } from 'vitest'

import {
  GitHubIntegrationError,
  createGitHubAuthService,
  type GitHubAuthAdapter,
  type GitHubCredentialStore,
  type StoredGitHubCredential
} from './github-auth.service'

const identity = {
  id: '42',
  login: 'octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
  profileUrl: 'https://github.com/octocat'
}

const deviceGrant = {
  deviceCode: 'provider-device-secret',
  userCode: 'ABCD-EFGH',
  verificationUri: 'https://github.com/login/device',
  expiresInSeconds: 900,
  intervalSeconds: 5
}

function createMemoryCredentialStore(
  initial?: StoredGitHubCredential
): GitHubCredentialStore & { value?: StoredGitHubCredential } {
  return {
    value: initial,
    async read() {
      return this.value
    },
    async write(value) {
      this.value = value
    },
    async clear() {
      this.value = undefined
    }
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function createAdapter(
  polls: Awaited<ReturnType<GitHubAuthAdapter['pollDeviceCode']>>[]
): GitHubAuthAdapter {
  return {
    async requestDeviceCode() {
      return deviceGrant
    },
    async pollDeviceCode() {
      const result = polls.shift()
      if (!result) throw new Error('Unexpected poll')
      return result
    },
    async refreshAccessToken() {
      throw new Error('Unexpected refresh')
    },
    async getIdentity() {
      return identity
    }
  }
}

describe('GitHub auth service', () => {
  it('keeps provider secrets in main while honoring pending and slow-down intervals', async () => {
    const sleeps: number[] = []
    const openedUrls: string[] = []
    const credentials = createMemoryCredentialStore()
    const adapter = createAdapter([
      { status: 'slow_down' },
      { status: 'pending' },
      {
        status: 'authorized',
        tokens: {
          accessToken: 'access-secret',
          refreshToken: 'refresh-secret',
          accessTokenExpiresAt: '2026-07-18T01:00:00.000Z',
          refreshTokenExpiresAt: '2026-08-18T00:00:00.000Z'
        }
      }
    ])
    const service = createGitHubAuthService({
      clientId: 'Iv1.public-client-id',
      adapter,
      credentialStore: credentials,
      createFlowId: () => 'flow-1',
      now: () => new Date('2026-07-18T00:00:00.000Z'),
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds)
      },
      openExternal: async (url) => {
        openedUrls.push(url)
      },
      copyText: () => undefined
    })

    const authorization = await service.startAuthorization()
    const connection = await service.waitForAuthorization({ flowId: authorization.flowId })

    expect(authorization).toEqual({
      flowId: 'flow-1',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://github.com/login/device',
      expiresAt: '2026-07-18T00:15:00.000Z'
    })
    expect(openedUrls).toEqual(['https://github.com/login/device'])
    expect(sleeps).toEqual([5_000, 10_000, 10_000])
    expect(connection).toEqual({ status: 'repository-access-required', identity })
    expect(JSON.stringify({ authorization, connection })).not.toContain('provider-device-secret')
    expect(JSON.stringify({ authorization, connection })).not.toContain('access-secret')
    expect(credentials.value).toMatchObject({
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      identity
    })
  })

  it('caps provider-requested polling slowdowns at 60 seconds', async () => {
    const sleeps: number[] = []
    const adapter = createAdapter([
      { status: 'slow_down' },
      { status: 'slow_down' },
      {
        status: 'authorized',
        tokens: {
          accessToken: 'access-secret',
          refreshToken: 'refresh-secret',
          accessTokenExpiresAt: '2026-07-18T01:00:00.000Z',
          refreshTokenExpiresAt: '2026-08-18T00:00:00.000Z'
        }
      }
    ])
    adapter.requestDeviceCode = async () => ({ ...deviceGrant, intervalSeconds: 58 })
    const service = createGitHubAuthService({
      clientId: 'Iv1.public-client-id',
      adapter,
      credentialStore: createMemoryCredentialStore(),
      createFlowId: () => 'flow-1',
      now: () => new Date('2026-07-18T00:00:00.000Z'),
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds)
      },
      openExternal: async () => undefined,
      copyText: () => undefined
    })

    await service.startAuthorization()
    await service.waitForAuthorization({ flowId: 'flow-1' })

    expect(sleeps).toEqual([58_000, 60_000, 60_000])
  })

  it('cancels an unfinished flow without persisting a partial connection', async () => {
    const credentials = createMemoryCredentialStore()
    const service = createGitHubAuthService({
      clientId: 'Iv1.public-client-id',
      adapter: createAdapter([{ status: 'pending' }]),
      credentialStore: credentials,
      createFlowId: () => 'flow-1',
      now: () => new Date('2026-07-18T00:00:00.000Z'),
      sleep: async () => undefined,
      openExternal: async () => undefined,
      copyText: () => undefined
    })

    await service.startAuthorization()
    await service.cancelAuthorization({ flowId: 'flow-1' })

    await expect(service.waitForAuthorization({ flowId: 'flow-1' })).rejects.toMatchObject({
      code: 'authorization-cancelled'
    })
    await expect(service.getConnection()).resolves.toEqual({ status: 'disconnected' })
    expect(credentials.value).toBeUndefined()
  })

  it('rolls back a completed device grant when cancellation arrives during credential persistence', async () => {
    const writeStarted = deferred<void>()
    const allowWrite = deferred<void>()
    const credentials = createMemoryCredentialStore()
    credentials.write = async (value) => {
      writeStarted.resolve()
      await allowWrite.promise
      credentials.value = value
    }
    const service = createGitHubAuthService({
      clientId: 'Iv1.public-client-id',
      adapter: createAdapter([
        {
          status: 'authorized',
          tokens: {
            accessToken: 'access-secret',
            refreshToken: 'refresh-secret',
            accessTokenExpiresAt: '2026-07-18T01:00:00.000Z',
            refreshTokenExpiresAt: '2026-08-18T00:00:00.000Z'
          }
        }
      ]),
      credentialStore: credentials,
      createFlowId: () => 'flow-1',
      now: () => new Date('2026-07-18T00:00:00.000Z'),
      sleep: async () => undefined,
      openExternal: async () => undefined,
      copyText: () => undefined
    })

    await service.startAuthorization()
    const completion = service.waitForAuthorization({ flowId: 'flow-1' })
    await writeStarted.promise
    const cancellation = service.cancelAuthorization({ flowId: 'flow-1' })
    allowWrite.resolve()
    await cancellation

    await expect(completion).rejects.toMatchObject({ code: 'authorization-cancelled' })
    expect(credentials.value).toBeUndefined()
  })

  it('reports denial without exposing the provider response', async () => {
    const service = createGitHubAuthService({
      clientId: 'Iv1.public-client-id',
      adapter: createAdapter([{ status: 'denied' }]),
      credentialStore: createMemoryCredentialStore(),
      createFlowId: () => 'flow-1',
      now: () => new Date('2026-07-18T00:00:00.000Z'),
      sleep: async () => undefined,
      openExternal: async () => undefined,
      copyText: () => undefined
    })

    await service.startAuthorization()

    await expect(service.waitForAuthorization({ flowId: 'flow-1' })).rejects.toEqual(
      new GitHubIntegrationError('authorization-denied')
    )
  })

  it('refreshes an expired access token without returning either token to the renderer', async () => {
    const credentials = createMemoryCredentialStore({
      accessToken: 'expired-access-secret',
      refreshToken: 'refresh-secret',
      accessTokenExpiresAt: '2026-07-17T23:00:00.000Z',
      refreshTokenExpiresAt: '2026-08-18T00:00:00.000Z',
      identity
    })
    const adapter = createAdapter([])
    adapter.refreshAccessToken = async () => ({
      accessToken: 'new-access-secret',
      refreshToken: 'new-refresh-secret',
      accessTokenExpiresAt: '2026-07-18T01:00:00.000Z',
      refreshTokenExpiresAt: '2026-08-18T00:00:00.000Z'
    })
    const service = createGitHubAuthService({
      clientId: 'Iv1.public-client-id',
      adapter,
      credentialStore: credentials,
      now: () => new Date('2026-07-18T00:00:00.000Z'),
      sleep: async () => undefined,
      openExternal: async () => undefined,
      copyText: () => undefined
    })

    const connection = await service.getConnection()

    expect(connection).toEqual({ status: 'repository-access-required', identity })
    expect(JSON.stringify(connection)).not.toContain('secret')
    expect(credentials.value).toMatchObject({
      accessToken: 'new-access-secret',
      refreshToken: 'new-refresh-secret'
    })
  })

  it('refreshes one rotating token only once for concurrent authorization reads', async () => {
    const credentials = createMemoryCredentialStore({
      accessToken: 'expired-access-secret',
      refreshToken: 'rotating-refresh-secret',
      accessTokenExpiresAt: '2026-07-17T23:00:00.000Z',
      refreshTokenExpiresAt: '2026-08-18T00:00:00.000Z',
      identity
    })
    const refreshStarted = deferred<void>()
    const allowRefresh = deferred<void>()
    const adapter = createAdapter([])
    let refreshCalls = 0
    adapter.refreshAccessToken = async () => {
      refreshCalls += 1
      refreshStarted.resolve()
      await allowRefresh.promise
      return {
        accessToken: 'new-access-secret',
        refreshToken: 'new-rotating-refresh-secret',
        accessTokenExpiresAt: '2026-07-18T01:00:00.000Z',
        refreshTokenExpiresAt: '2026-08-18T00:00:00.000Z'
      }
    }
    const service = createGitHubAuthService({
      clientId: 'Iv1.public-client-id',
      adapter,
      credentialStore: credentials,
      now: () => new Date('2026-07-18T00:00:00.000Z'),
      sleep: async () => undefined,
      openExternal: async () => undefined,
      copyText: () => undefined
    })

    const first = service.getAuthorizedCredential()
    const second = service.getAuthorizedCredential()
    await refreshStarted.promise
    allowRefresh.resolve()

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ accessToken: 'new-access-secret' }),
      expect.objectContaining({ accessToken: 'new-access-secret' })
    ])
    expect(refreshCalls).toBe(1)
  })

  it('disconnects locally by clearing protected credentials', async () => {
    const credentials = createMemoryCredentialStore({
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      accessTokenExpiresAt: '2026-07-18T01:00:00.000Z',
      refreshTokenExpiresAt: '2026-08-18T00:00:00.000Z',
      identity
    })
    const service = createGitHubAuthService({
      clientId: 'Iv1.public-client-id',
      adapter: createAdapter([]),
      credentialStore: credentials,
      now: () => new Date('2026-07-18T00:00:00.000Z'),
      sleep: async () => undefined,
      openExternal: async () => undefined,
      copyText: () => undefined
    })

    await service.disconnect()

    expect(credentials.value).toBeUndefined()
    await expect(service.getConnection()).resolves.toEqual({ status: 'disconnected' })
  })

  it('fails closed when the refresh grant has expired', async () => {
    const credentials = createMemoryCredentialStore({
      accessToken: 'expired-access-secret',
      refreshToken: 'expired-refresh-secret',
      accessTokenExpiresAt: '2026-07-17T23:00:00.000Z',
      refreshTokenExpiresAt: '2026-07-17T23:30:00.000Z',
      identity
    })
    const service = createGitHubAuthService({
      clientId: 'Iv1.public-client-id',
      adapter: createAdapter([]),
      credentialStore: credentials,
      now: () => new Date('2026-07-18T00:00:00.000Z'),
      sleep: async () => undefined,
      openExternal: async () => undefined,
      copyText: () => undefined
    })

    await expect(service.getConnection()).resolves.toEqual({
      status: 'reconnect-required',
      identity
    })
  })
})
