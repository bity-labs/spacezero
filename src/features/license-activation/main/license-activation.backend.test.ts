import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLicenseActivationBackend } from './license-activation.backend'
import { LicenseActivationConfigurationError } from './license-activation.service'

const response = {
  licenseState: 'active',
  versionSupported: true,
  recheckAfter: '2026-01-02T00:00:00.000Z',
  graceEndsAt: '2026-01-08T00:00:00.000Z'
}

describe('license activation backend', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends valid keys to the configured packaged status endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const backend = createLicenseActivationBackend({ endpointUrl: 'https://license.test/status' })

    await expect(
      backend.checkStatus({ licenseKey: 'license-key', appVersion: '0.1.0-beta.1' })
    ).resolves.toEqual(response)

    expect(fetchMock).toHaveBeenCalledWith('https://license.test/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'license-key', appVersion: '0.1.0-beta.1' })
    })
  })

  it('fails missing endpoint configuration explicitly instead of treating every key as invalid', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const backend = createLicenseActivationBackend({ endpointUrl: undefined })

    await expect(
      backend.checkStatus({ licenseKey: 'license-key', appVersion: '0.1.0-beta.1' })
    ).rejects.toBeInstanceOf(LicenseActivationConfigurationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
