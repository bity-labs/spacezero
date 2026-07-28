import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

import { createLicenseActivationBackend } from './license-activation.backend'
import { createLicenseActivationService } from './license-activation.service'
import { createSafeStorageLicenseEntitlementStore } from './license-entitlement.store'

function getActivationMode(): 'required' | 'development-bypass' {
  if (process.env.SPACEZERO_REQUIRE_LICENSE_ACTIVATION === 'true') return 'required'
  if (is.dev || !app.isPackaged || process.env.NODE_ENV === 'test') return 'development-bypass'
  return 'required'
}

export const licenseActivationService = createLicenseActivationService({
  backend: createLicenseActivationBackend({ endpointUrl: process.env.SPACEZERO_LICENSE_STATUS_URL }),
  config: {
    mode: getActivationMode(),
    appVersion: app.getVersion()
  },
  store: createSafeStorageLicenseEntitlementStore()
})
