import type {
  ActivateLicenseRequest,
  LicenseActivationMode,
  LicenseActivationStatus,
  LicenseBackendStatusResponse
} from '../shared'

type StoredEntitlement = LicenseBackendStatusResponse & {
  activatedAt: string
  licenseKey: string
}

export type LicenseEntitlementStore = {
  load: () => Promise<StoredEntitlement | null>
  save: (entitlement: StoredEntitlement) => Promise<void>
  isProtected: () => boolean
}

export type LicenseActivationBackend = {
  checkStatus: (request: {
    licenseKey: string
    appVersion: string
  }) => Promise<LicenseBackendStatusResponse>
}

export type LicenseActivationConfig = {
  mode: LicenseActivationMode
  appVersion: string
  now?: () => Date
}

export class LicenseActivationConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LicenseActivationConfigurationError'
  }
}

export class LicenseActivationTransportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LicenseActivationTransportError'
  }
}

const DEVELOPMENT_MESSAGE = 'Development build activation bypass is enabled.'
const INACTIVE_MESSAGE = 'Enter a license key to activate Space Zero.'
const MAX_OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000
const OFFLINE_RETRY_MS = 5 * 60 * 1000

export function createLicenseActivationService({
  backend,
  config,
  store
}: {
  backend: LicenseActivationBackend
  config: LicenseActivationConfig
  store: LicenseEntitlementStore
}) {
  const now = config.now ?? (() => new Date())

  function developmentStatus(): LicenseActivationStatus {
    return {
      mode: 'development-bypass',
      state: 'active',
      canEnterWorkspace: true,
      message: DEVELOPMENT_MESSAGE
    }
  }

  function statusFromBackendResponse(response: LicenseBackendStatusResponse): LicenseActivationStatus {
    if (!response.versionSupported) {
      return {
        mode: config.mode,
        state: 'unsupported-version',
        canEnterWorkspace: false,
        message: 'This Space Zero build is no longer supported. Update to continue.',
        renewalUrl: response.renewalUrl,
        updateUrl: response.updateUrl,
        recheckAfter: response.recheckAfter,
        graceEndsAt: response.graceEndsAt
      }
    }

    if (response.licenseState !== 'active') {
      return {
        mode: config.mode,
        state: response.licenseState,
        canEnterWorkspace: false,
        message: licenseFailureMessage(response.licenseState),
        renewalUrl: response.renewalUrl,
        updateUrl: response.updateUrl,
        recheckAfter: response.recheckAfter,
        graceEndsAt: response.graceEndsAt
      }
    }

    return {
      mode: config.mode,
      state: 'active',
      canEnterWorkspace: true,
      message: 'Space Zero is activated.',
      renewalUrl: response.renewalUrl,
      updateUrl: response.updateUrl,
      recheckAfter: response.recheckAfter,
      graceEndsAt: response.graceEndsAt
    }
  }

  function statusFromFreshBackendResponse(
    response: LicenseBackendStatusResponse,
    validationBaseline: Date
  ): LicenseActivationStatus {
    const status = statusFromBackendResponse(response)
    if (!status.canEnterWorkspace) return status

    return hasValidActiveTiming(response, validationBaseline) ? status : configurationErrorStatus(status.mode)
  }

  function offlineStatusFromStoredEntitlement(entitlement: StoredEntitlement): LicenseActivationStatus {
    const backendStatus = statusFromBackendResponse(entitlement)
    if (!backendStatus.canEnterWorkspace) return backendStatus

    const currentTime = now().getTime()
    const effectiveGraceEndsAt = effectiveGraceDeadline(entitlement)
    if (effectiveGraceEndsAt === null) return graceExpiredStatus(backendStatus, entitlement.graceEndsAt)

    if (currentTime < effectiveGraceEndsAt) {
      const nextRetryAt = Math.min(currentTime + OFFLINE_RETRY_MS, effectiveGraceEndsAt)
      return {
        ...backendStatus,
        state: 'grace-period',
        canEnterWorkspace: true,
        message: 'Space Zero is using cached activation while offline.',
        recheckAfter: new Date(nextRetryAt).toISOString(),
        graceEndsAt: new Date(effectiveGraceEndsAt).toISOString()
      }
    }

    return graceExpiredStatus(backendStatus, new Date(effectiveGraceEndsAt).toISOString())
  }

  async function refreshStoredEntitlement(entitlement: StoredEntitlement): Promise<LicenseActivationStatus> {
    let response: LicenseBackendStatusResponse
    try {
      response = await backend.checkStatus({
        licenseKey: entitlement.licenseKey,
        appVersion: config.appVersion
      })
    } catch (error) {
      if (error instanceof LicenseActivationConfigurationError) return configurationErrorStatus(config.mode)
      if (error instanceof LicenseActivationTransportError) return offlineStatusFromStoredEntitlement(entitlement)
      return configurationErrorStatus(config.mode)
    }

    const validationBaseline = now()
    const status = statusFromFreshBackendResponse(response, validationBaseline)
    if (!status.canEnterWorkspace) return status

    try {
      await store.save({ ...response, activatedAt: validationBaseline.toISOString(), licenseKey: entitlement.licenseKey })
    } catch {
      return storageUnavailableStatus(config.mode)
    }

    return status
  }

  return {
    async getStatus(): Promise<LicenseActivationStatus> {
      if (config.mode === 'development-bypass') return developmentStatus()
      if (!store.isProtected()) return storageUnavailableStatus(config.mode)

      const entitlement = await store.load()
      if (!entitlement) {
        return {
          mode: config.mode,
          state: 'inactive',
          canEnterWorkspace: false,
          message: INACTIVE_MESSAGE
        }
      }

      const backendStatus = statusFromBackendResponse(entitlement)
      if (!backendStatus.canEnterWorkspace) return backendStatus

      const currentTime = now().getTime()
      const effectiveGraceEndsAt = effectiveGraceDeadline(entitlement)
      const recheckAfter = parseTimestamp(entitlement.recheckAfter)
      if (effectiveGraceEndsAt === null || recheckAfter === null) {
        return graceExpiredStatus(backendStatus, entitlement.graceEndsAt)
      }
      if (currentTime >= recheckAfter || currentTime >= effectiveGraceEndsAt) {
        return refreshStoredEntitlement(entitlement)
      }

      return backendStatus
    },

    async activate(request: unknown): Promise<LicenseActivationStatus> {
      if (config.mode === 'development-bypass') return developmentStatus()
      if (!store.isProtected()) return storageUnavailableStatus(config.mode)

      const licenseKey = parseLicenseKey(request)
      if (!licenseKey) return invalidActivationRequestStatus(config.mode)

      try {
        const response = await backend.checkStatus({ licenseKey, appVersion: config.appVersion })
        const validationBaseline = now()
        const status = statusFromFreshBackendResponse(response, validationBaseline)
        if (!status.canEnterWorkspace) return status

        try {
          await store.save({ ...response, activatedAt: validationBaseline.toISOString(), licenseKey })
        } catch {
          return storageUnavailableStatus(config.mode)
        }

        return status
      } catch (error) {
        if (error instanceof LicenseActivationConfigurationError) return configurationErrorStatus(config.mode)
        if (error instanceof LicenseActivationTransportError) throw error
        return configurationErrorStatus(config.mode)
      }
    }
  }
}

function hasValidActiveTiming(response: LicenseBackendStatusResponse, validationBaseline: Date): boolean {
  const baseline = validationBaseline.getTime()
  const recheckAfter = parseTimestamp(response.recheckAfter)
  const graceEndsAt = parseTimestamp(response.graceEndsAt)
  if (!Number.isFinite(baseline) || recheckAfter === null || graceEndsAt === null) return false
  if (recheckAfter > graceEndsAt) return false

  const effectiveGraceEndsAt = Math.min(graceEndsAt, baseline + MAX_OFFLINE_GRACE_MS)
  return Number.isFinite(effectiveGraceEndsAt) && baseline < effectiveGraceEndsAt
}

function parseTimestamp(value: string): number | null {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function effectiveGraceDeadline(entitlement: StoredEntitlement): number | null {
  const activatedAt = parseTimestamp(entitlement.activatedAt)
  const graceEndsAt = parseTimestamp(entitlement.graceEndsAt)
  if (activatedAt === null || graceEndsAt === null) return null

  const maxGraceEndsAt = activatedAt + MAX_OFFLINE_GRACE_MS
  if (!Number.isFinite(maxGraceEndsAt)) return null
  return Math.min(graceEndsAt, maxGraceEndsAt)
}

function graceExpiredStatus(status: LicenseActivationStatus, graceEndsAt: string): LicenseActivationStatus {
  return {
    ...status,
    state: 'grace-expired',
    canEnterWorkspace: false,
    message: 'Cached activation has expired. Reconnect and reactivate Space Zero.',
    graceEndsAt
  }
}

function parseLicenseKey(request: unknown): string | null {
  if (!request || typeof request !== 'object' || !('licenseKey' in request)) return null
  const licenseKey = (request as ActivateLicenseRequest).licenseKey
  if (typeof licenseKey !== 'string' || licenseKey.length > 4096) return null
  const trimmed = licenseKey.trim()
  return trimmed.length > 0 ? trimmed : null
}

function invalidActivationRequestStatus(mode: LicenseActivationMode): LicenseActivationStatus {
  return {
    mode,
    state: 'invalid',
    canEnterWorkspace: false,
    message: 'Enter a license key to activate Space Zero.'
  }
}

function licenseFailureMessage(state: 'invalid' | 'expired' | 'revoked'): string {
  if (state === 'expired') return 'This license is expired. Renew or reactivate to continue.'
  if (state === 'revoked') return 'This license was revoked. Reactivate with a valid license.'
  return 'This license key is invalid. Check the key and try again.'
}

function storageUnavailableStatus(mode: LicenseActivationMode): LicenseActivationStatus {
  return {
    mode,
    state: 'storage-unavailable',
    canEnterWorkspace: false,
    message: 'Secure license storage is unavailable on this device.'
  }
}

function configurationErrorStatus(mode: LicenseActivationMode): LicenseActivationStatus {
  return {
    mode,
    state: 'configuration-error',
    canEnterWorkspace: false,
    message: 'License Activation is not configured for this Space Zero build.'
  }
}
