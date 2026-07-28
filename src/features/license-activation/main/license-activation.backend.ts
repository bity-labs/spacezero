import { z } from 'zod'

import type { LicenseActivationBackend } from './license-activation.service'

const backendResponseSchema = z.object({
  licenseState: z.enum(['active', 'invalid', 'expired', 'revoked']),
  versionSupported: z.boolean(),
  recheckAfter: z.string(),
  graceEndsAt: z.string(),
  renewalUrl: z.string().url().optional(),
  updateUrl: z.string().url().optional()
})

export function createLicenseActivationBackend({ endpointUrl }: { endpointUrl?: string }): LicenseActivationBackend {
  return {
    async checkStatus({ licenseKey, appVersion }) {
      if (!endpointUrl) {
        return {
          licenseState: 'invalid',
          versionSupported: true,
          recheckAfter: new Date(0).toISOString(),
          graceEndsAt: new Date(0).toISOString()
        }
      }

      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ licenseKey, appVersion })
      })

      if (!response.ok) throw new Error(`License status request failed: ${response.status}`)
      return backendResponseSchema.parse(await response.json())
    }
  }
}
