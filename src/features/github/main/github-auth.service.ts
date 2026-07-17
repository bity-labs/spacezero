import { nanoid } from 'nanoid'

import type {
  GitHubConnection,
  GitHubDeviceAuthorization,
  GitHubFlowRequest,
  GitHubIdentity
} from '../shared'

export type GitHubDeviceGrant = {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresInSeconds: number
  intervalSeconds: number
}

export type GitHubTokenSet = {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
}

export type StoredGitHubCredential = GitHubTokenSet & {
  identity: GitHubIdentity
}

export type GitHubDevicePollResult =
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'authorized'; tokens: GitHubTokenSet }

export type GitHubAuthAdapter = {
  requestDeviceCode: (clientId: string, signal?: AbortSignal) => Promise<GitHubDeviceGrant>
  pollDeviceCode: (
    clientId: string,
    deviceCode: string,
    signal?: AbortSignal
  ) => Promise<GitHubDevicePollResult>
  refreshAccessToken: (
    clientId: string,
    refreshToken: string,
    signal?: AbortSignal
  ) => Promise<GitHubTokenSet>
  getIdentity: (accessToken: string, signal?: AbortSignal) => Promise<GitHubIdentity>
}

export type GitHubCredentialStore = {
  read: () => Promise<StoredGitHubCredential | undefined>
  write: (credential: StoredGitHubCredential) => Promise<void>
  clear: () => Promise<void>
}

type AuthorizationFlow = GitHubDeviceGrant & {
  flowId: string
  expiresAt: Date
  intervalSeconds: number
  cancelled: boolean
  abortController: AbortController
}

type Sleep = (milliseconds: number, signal?: AbortSignal) => Promise<void>

export type GitHubAuthService = ReturnType<typeof createGitHubAuthService>

export class GitHubIntegrationError extends Error {
  readonly code: GitHubIntegrationErrorCode

  constructor(code: GitHubIntegrationErrorCode) {
    super(`github.${code}`)
    this.name = 'GitHubIntegrationError'
    this.code = code
  }
}

export type GitHubIntegrationErrorCode =
  | 'configuration-missing'
  | 'authorization-cancelled'
  | 'authorization-denied'
  | 'authorization-expired'
  | 'authorization-flow-not-found'
  | 'authorization-failed'
  | 'authorization-required'
  | 'reconnect-required'
  | 'credentials-unavailable'
  | 'network-error'

export function createGitHubAuthService({
  clientId,
  adapter,
  credentialStore,
  createFlowId = nanoid,
  now = () => new Date(),
  sleep = cancellableSleep,
  openExternal,
  copyText
}: {
  clientId: string | undefined
  adapter: GitHubAuthAdapter
  credentialStore: GitHubCredentialStore
  createFlowId?: () => string
  now?: () => Date
  sleep?: Sleep
  openExternal: (url: string) => Promise<void>
  copyText: (text: string) => void
}) {
  const flows = new Map<string, AuthorizationFlow>()

  async function getConnection(): Promise<GitHubConnection> {
    const credential = await credentialStore.read()
    if (!credential) return { status: 'disconnected' }

    if (isAfter(now(), credential.refreshTokenExpiresAt)) {
      return { status: 'reconnect-required', identity: credential.identity }
    }

    if (isAfter(now(), credential.accessTokenExpiresAt)) {
      try {
        const tokens = await adapter.refreshAccessToken(
          requireClientId(clientId),
          credential.refreshToken
        )
        await credentialStore.write({ ...tokens, identity: credential.identity })
      } catch {
        return { status: 'reconnect-required', identity: credential.identity }
      }
    }

    return { status: 'repository-access-required', identity: credential.identity }
  }

  async function getAuthorizedCredential(): Promise<StoredGitHubCredential> {
    const credential = await credentialStore.read()
    if (!credential) throw new GitHubIntegrationError('authorization-required')
    if (isAfter(now(), credential.refreshTokenExpiresAt)) {
      throw new GitHubIntegrationError('reconnect-required')
    }
    if (!isAfter(now(), credential.accessTokenExpiresAt)) return credential

    try {
      const tokens = await adapter.refreshAccessToken(
        requireClientId(clientId),
        credential.refreshToken
      )
      const refreshed = { ...tokens, identity: credential.identity }
      await credentialStore.write(refreshed)
      return refreshed
    } catch {
      throw new GitHubIntegrationError('reconnect-required')
    }
  }

  async function disconnect(): Promise<void> {
    for (const flow of flows.values()) {
      flow.cancelled = true
      flow.abortController.abort()
    }
    flows.clear()
    await credentialStore.clear()
  }

  async function startAuthorization(): Promise<GitHubDeviceAuthorization> {
    const configuredClientId = requireClientId(clientId)
    const grant = await safelyRequest(() => adapter.requestDeviceCode(configuredClientId))
    assertGitHubDeviceUrl(grant.verificationUri)

    const flowId = createFlowId()
    const expiresAt = new Date(now().getTime() + grant.expiresInSeconds * 1_000)
    const flow: AuthorizationFlow = {
      ...grant,
      flowId,
      expiresAt,
      intervalSeconds: Math.max(1, grant.intervalSeconds),
      cancelled: false,
      abortController: new AbortController()
    }
    flows.set(flowId, flow)

    try {
      await openExternal(flow.verificationUri)
    } catch {
      flows.delete(flowId)
      throw new GitHubIntegrationError('authorization-failed')
    }

    return toDeviceAuthorization(flow)
  }

  async function waitForAuthorization(request: GitHubFlowRequest): Promise<GitHubConnection> {
    const flow = requireFlow(request.flowId)
    const configuredClientId = requireClientId(clientId)

    try {
      while (true) {
        assertFlowActive(flow)
        await sleep(flow.intervalSeconds * 1_000, flow.abortController.signal)
        assertFlowActive(flow)

        const result = await safelyRequest(() =>
          adapter.pollDeviceCode(configuredClientId, flow.deviceCode, flow.abortController.signal)
        )

        if (result.status === 'pending') continue
        if (result.status === 'slow_down') {
          flow.intervalSeconds += 5
          continue
        }
        if (result.status === 'denied') {
          throw new GitHubIntegrationError('authorization-denied')
        }
        if (result.status === 'expired') {
          throw new GitHubIntegrationError('authorization-expired')
        }

        const identity = await safelyRequest(() =>
          adapter.getIdentity(result.tokens.accessToken, flow.abortController.signal)
        )
        await credentialStore.write({ ...result.tokens, identity })
        return { status: 'repository-access-required', identity }
      }
    } catch (error) {
      if (flow.cancelled || flow.abortController.signal.aborted) {
        throw new GitHubIntegrationError('authorization-cancelled')
      }
      throw sanitizeError(error)
    } finally {
      flows.delete(flow.flowId)
    }
  }

  async function cancelAuthorization(request: GitHubFlowRequest): Promise<void> {
    const flow = flows.get(request.flowId.trim())
    if (!flow) return
    flow.cancelled = true
    flow.abortController.abort()
  }

  async function openAuthorization(request: GitHubFlowRequest): Promise<void> {
    const flow = requireFlow(request.flowId)
    assertFlowActive(flow)
    await openExternal(flow.verificationUri)
  }

  function copyDeviceCode(request: GitHubFlowRequest): void {
    const flow = requireFlow(request.flowId)
    assertFlowActive(flow)
    copyText(flow.userCode)
  }

  return {
    getConnection,
    getAuthorizedCredential,
    disconnect,
    startAuthorization,
    waitForAuthorization,
    cancelAuthorization,
    openAuthorization,
    copyDeviceCode
  }

  function requireFlow(flowId: string): AuthorizationFlow {
    const flow = flows.get(flowId.trim())
    if (!flow) throw new GitHubIntegrationError('authorization-flow-not-found')
    return flow
  }

  function assertFlowActive(flow: AuthorizationFlow): void {
    if (flow.cancelled || flow.abortController.signal.aborted) {
      throw new GitHubIntegrationError('authorization-cancelled')
    }
    if (now().getTime() >= flow.expiresAt.getTime()) {
      throw new GitHubIntegrationError('authorization-expired')
    }
  }
}

function requireClientId(clientId: string | undefined): string {
  const value = clientId?.trim()
  if (!value) throw new GitHubIntegrationError('configuration-missing')
  return value
}

function toDeviceAuthorization(flow: AuthorizationFlow): GitHubDeviceAuthorization {
  return {
    flowId: flow.flowId,
    userCode: flow.userCode,
    verificationUri: flow.verificationUri,
    expiresAt: flow.expiresAt.toISOString()
  }
}

function isAfter(now: Date, expiresAt: string): boolean {
  const expiration = Date.parse(expiresAt)
  return !Number.isFinite(expiration) || now.getTime() >= expiration
}

function assertGitHubDeviceUrl(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') throw new Error()
  } catch {
    throw new GitHubIntegrationError('authorization-failed')
  }
}

async function safelyRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request()
  } catch (error) {
    throw sanitizeError(error)
  }
}

function sanitizeError(error: unknown): GitHubIntegrationError {
  if (error instanceof GitHubIntegrationError) return error
  return new GitHubIntegrationError('network-error')
}

function cancellableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GitHubIntegrationError('authorization-cancelled'))
      return
    }

    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new GitHubIntegrationError('authorization-cancelled'))
      },
      { once: true }
    )
  })
}
