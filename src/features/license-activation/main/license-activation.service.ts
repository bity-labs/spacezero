import type {
  ActivateLicenseRequest,
  LicenseActivationMode,
  LicenseActivationStatus,
  LicenseBackendStatusResponse
} from '../shared'

type StoredEntitlement = LicenseBackendStatusResponse & {
  activatedAt: string
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

const DEVELOPMENT_MESSAGE = 'Development build activation bypass is enabled.'
const INACTIVE_MESSAGE = 'Enter a license key to activate Space Zero.'

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

  function statusFromStoredEntitlement(entitlement: StoredEntitlement): LicenseActivationStatus {
    const backendStatus = statusFromBackendResponse(entitlement)
    if (!backendStatus.canEnterWorkspace) return backendStatus

    const currentTime = now().getTime()
    const recheckAfter = Date.parse(entitlement.recheckAfter)
    if (Number.isFinite(recheckAfter) && currentTime <= recheckAfter) return backendStatus

    const graceEndsAt = Date.parse(entitlement.graceEndsAt)
    if (Number.isFinite(graceEndsAt) && currentTime <= graceEndsAt) {
      return {
        ...backendStatus,
        state: 'grace-period',
        canEnterWorkspace: true,
        message: 'Space Zero is using cached activation while offline.',
        graceEndsAt: entitlement.graceEndsAt
      }
    }

    return {
      ...backendStatus,
      state: 'grace-expired',
      canEnterWorkspace: false,
      message: 'Cached activation has expired. Reconnect and reactivate Space Zero.',
      graceEndsAt: entitlement.graceEndsAt
    }
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

      return statusFromStoredEntitlement(entitlement)
    },

    async activate(request: ActivateLicenseRequest): Promise<LicenseActivationStatus> {
      if (config.mode === 'development-bypass') return developmentStatus()
      if (!store.isProtected()) return storageUnavailableStatus(config.mode)

      const licenseKey = request.licenseKey.trim()
      if (!licenseKey) {
        return {
          mode: config.mode,
          state: 'invalid',
          canEnterWorkspace: false,
          message: 'Enter a license key to activate Space Zero.'
        }
      }

      const response = await backend.checkStatus({ licenseKey, appVersion: config.appVersion })
      const status = statusFromBackendResponse(response)
      if (status.canEnterWorkspace) await store.save({ ...response, activatedAt: now().toISOString() })
      return status
    }
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
