import { z } from 'zod'

import {
  LicenseActivationConfigurationError,
  type LicenseActivationBackend
} from './license-activation.service'

const backendResponseSchema = z.object({
  licenseState: z.enum(['active', 'invalid', 'expired', 'revoked']),
  versionSupported: z.boolean(),
  recheckAfter: z.string(),
  graceEndsAt: z.string(),
  renewalUrl: z.string().url().optional(),
  updateUrl: z.string().url().optional()
})

export function createLicenseActivationBackend({ endpointUrl }: { endpointUrl?: string }): LicenseActivationBackend {
  const parsedEndpointUrl = parseEndpointUrl(endpointUrl)

  return {
    async checkStatus({ licenseKey, appVersion }) {
      if (!parsedEndpointUrl) {
        throw new LicenseActivationConfigurationError('License status endpoint is not configured.')
      }

      const response = await fetch(parsedEndpointUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ licenseKey, appVersion })
      })

      if (!response.ok) throw new Error(`License status request failed: ${response.status}`)
      return backendResponseSchema.parse(await response.json())
    }
  }
}

function parseEndpointUrl(endpointUrl: string | undefined): string | null {
  if (!endpointUrl) return null
  try {
    const parsed = new URL(endpointUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed.toString()
  } catch {
    return null
  }
}
