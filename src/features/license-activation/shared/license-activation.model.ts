export type LicenseActivationMode = 'required' | 'development-bypass'

export type LicenseActivationState =
  | 'inactive'
  | 'active'
  | 'invalid'
  | 'expired'
  | 'revoked'
  | 'grace-period'
  | 'grace-expired'
  | 'unsupported-version'
  | 'storage-unavailable'

export type LicenseActivationStatus = {
  mode: LicenseActivationMode
  state: LicenseActivationState
  canEnterWorkspace: boolean
  message: string
  renewalUrl?: string
  updateUrl?: string
  recheckAfter?: string
  graceEndsAt?: string
}

export type ActivateLicenseRequest = {
  licenseKey: string
}

export type LicenseActivationAPI = {
  getStatus: () => Promise<LicenseActivationStatus>
  activate: (request: ActivateLicenseRequest) => Promise<LicenseActivationStatus>
}

export type LicenseBackendStatusResponse = {
  licenseState: 'active' | 'invalid' | 'expired' | 'revoked'
  versionSupported: boolean
  recheckAfter: string
  graceEndsAt: string
  renewalUrl?: string
  updateUrl?: string
}
