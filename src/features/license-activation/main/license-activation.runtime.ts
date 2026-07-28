import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { z } from 'zod'

import { createLicenseActivationBackend } from './license-activation.backend'
import { createLicenseActivationService } from './license-activation.service'
import { createSafeStorageLicenseEntitlementStore } from './license-entitlement.store'

const packagedConfigSchema = z.object({
  statusEndpointUrl: z.string().url()
})

function getActivationMode(): 'required' | 'development-bypass' {
  if (process.env.SPACEZERO_REQUIRE_LICENSE_ACTIVATION === 'true') return 'required'
  if (is.dev || !app.isPackaged || process.env.NODE_ENV === 'test') return 'development-bypass'
  return 'required'
}

export function getLicenseStatusEndpointUrl(): string | undefined {
  if (process.env.SPACEZERO_LICENSE_STATUS_URL) return process.env.SPACEZERO_LICENSE_STATUS_URL
  if (!app.isPackaged) return undefined

  try {
    const configPath = join(process.resourcesPath, 'license-activation.json')
    const config = packagedConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')))
    return config.statusEndpointUrl
  } catch {
    return undefined
  }
}

export const licenseActivationService = createLicenseActivationService({
  backend: createLicenseActivationBackend({ endpointUrl: getLicenseStatusEndpointUrl() }),
  config: {
    mode: getActivationMode(),
    appVersion: app.getVersion()
  },
  store: createSafeStorageLicenseEntitlementStore()
})
