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
  discardCredentialOnCancel: boolean
  waitStarted: boolean
  settled: Promise<void>
  markSettled: () => void
  abortController: AbortController
}

type Sleep = (milliseconds: number, signal?: AbortSignal) => Promise<void>

const MAX_DEVICE_POLL_INTERVAL_SECONDS = 60

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
  let refreshInFlight:
    { refreshToken: string; promise: Promise<StoredGitHubCredential> } | undefined
  let credentialGeneration = 0
  let credentialMutationQueue = Promise.resolve()

  function serializeCredentialMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = credentialMutationQueue.then(operation, operation)
    credentialMutationQueue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  async function getConnection(): Promise<GitHubConnection> {
    const credential = await credentialStore.read()
    if (!credential) return { status: 'disconnected' }

    try {
      const authorized = await ensureAuthorizedCredential(credential)
      return { status: 'repository-access-required', identity: authorized.identity }
    } catch {
      return { status: 'reconnect-required', identity: credential.identity }
    }
  }

  async function getAuthorizedCredential(): Promise<StoredGitHubCredential> {
    const credential = await credentialStore.read()
    if (!credential) throw new GitHubIntegrationError('authorization-required')
    return ensureAuthorizedCredential(credential)
  }

  async function ensureAuthorizedCredential(
    credential: StoredGitHubCredential
  ): Promise<StoredGitHubCredential> {
    if (isAfter(now(), credential.refreshTokenExpiresAt)) {
      throw new GitHubIntegrationError('reconnect-required')
    }
    if (!isAfter(now(), credential.accessTokenExpiresAt)) return credential

    try {
      return await refreshCredential(credential)
    } catch {
      throw new GitHubIntegrationError('reconnect-required')
    }
  }

  async function refreshCredential(
    credential: StoredGitHubCredential
  ): Promise<StoredGitHubCredential> {
    if (refreshInFlight?.refreshToken === credential.refreshToken) {
      return refreshInFlight.promise
    }

    const generation = credentialGeneration
    const promise = (async () => {
      const tokens = await adapter.refreshAccessToken(
        requireClientId(clientId),
        credential.refreshToken
      )
      return serializeCredentialMutation(async () => {
        if (generation !== credentialGeneration) {
          throw new GitHubIntegrationError('reconnect-required')
        }
        const currentCredential = await credentialStore.read()
        if (!currentCredential || currentCredential.refreshToken !== credential.refreshToken) {
          throw new GitHubIntegrationError('reconnect-required')
        }
        const refreshed = { ...tokens, identity: credential.identity }
        await credentialStore.write(refreshed)
        if (generation !== credentialGeneration) {
          throw new GitHubIntegrationError('reconnect-required')
        }
        credentialGeneration += 1
        return refreshed
      })
    })()
    refreshInFlight = { refreshToken: credential.refreshToken, promise }

    try {
      return await promise
    } finally {
      if (refreshInFlight?.promise === promise) refreshInFlight = undefined
    }
  }

  async function disconnect(): Promise<void> {
    credentialGeneration += 1
    const pendingFlows: Promise<void>[] = []
    for (const flow of flows.values()) {
      flow.cancelled = true
      flow.discardCredentialOnCancel = true
      flow.abortController.abort()
      if (flow.waitStarted) pendingFlows.push(flow.settled)
    }
    flows.clear()
    await Promise.all(pendingFlows)
    await serializeCredentialMutation(() => credentialStore.clear())
  }

  async function startAuthorization(): Promise<GitHubDeviceAuthorization> {
    const configuredClientId = requireClientId(clientId)
    const grant = await safelyRequest(() => adapter.requestDeviceCode(configuredClientId))
    assertGitHubDeviceUrl(grant.verificationUri)

    const flowId = createFlowId()
    const expiresAt = new Date(now().getTime() + grant.expiresInSeconds * 1_000)
    const settled = createSettledSignal()
    const flow: AuthorizationFlow = {
      ...grant,
      flowId,
      expiresAt,
      intervalSeconds: Math.max(1, grant.intervalSeconds),
      cancelled: false,
      discardCredentialOnCancel: false,
      waitStarted: false,
      settled: settled.promise,
      markSettled: settled.resolve,
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
    flow.waitStarted = true
    let previousCredential: StoredGitHubCredential | undefined
    let credentialWriteStarted = false

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
          if (flow.intervalSeconds < MAX_DEVICE_POLL_INTERVAL_SECONDS) {
            flow.intervalSeconds = Math.min(
              flow.intervalSeconds + 5,
              MAX_DEVICE_POLL_INTERVAL_SECONDS
            )
          }
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
        assertFlowActive(flow)
        previousCredential = await serializeCredentialMutation(async () => {
          assertFlowActive(flow)
          const storedCredential = await credentialStore.read()
          assertFlowActive(flow)
          credentialWriteStarted = true
          await credentialStore.write({ ...result.tokens, identity })
          assertFlowActive(flow)
          credentialGeneration += 1
          return storedCredential
        })
        return { status: 'repository-access-required', identity }
      }
    } catch (error) {
      if (credentialWriteStarted) {
        await serializeCredentialMutation(async () => {
          if (flow.discardCredentialOnCancel || !previousCredential) {
            await credentialStore.clear()
          } else {
            await credentialStore.write(previousCredential)
          }
          credentialGeneration += 1
        })
      }
      if (flow.cancelled || flow.abortController.signal.aborted) {
        throw new GitHubIntegrationError('authorization-cancelled')
      }
      throw sanitizeError(error)
    } finally {
      flows.delete(flow.flowId)
      flow.markSettled()
    }
  }

  async function cancelAuthorization(request: GitHubFlowRequest): Promise<void> {
    const flow = flows.get(request.flowId.trim())
    if (!flow) return
    flow.cancelled = true
    flow.abortController.abort()
    if (flow.waitStarted) await flow.settled
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
    getAuthorizationGeneration: () => credentialGeneration,
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

function createSettledSignal(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
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
