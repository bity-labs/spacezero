import { describe, expect, it, vi } from 'vitest'

import { createLicenseActivationService, type LicenseEntitlementStore } from './license-activation.service'
import type { LicenseBackendStatusResponse } from '../shared'

function createStore({ protectedStorage = true }: { protectedStorage?: boolean } = {}): LicenseEntitlementStore {
  let entitlement: Awaited<ReturnType<LicenseEntitlementStore['load']>> = null
  return {
    isProtected: () => protectedStorage,
    load: async () => entitlement,
    save: async (nextEntitlement) => {
      entitlement = nextEntitlement
    }
  }
}

const activeResponse: LicenseBackendStatusResponse = {
  licenseState: 'active',
  versionSupported: true,
  recheckAfter: '2026-01-02T00:00:00.000Z',
  graceEndsAt: '2026-01-08T00:00:00.000Z'
}

describe('license activation service', () => {
  it('allows development builds through the explicit bypass without calling the backend', async () => {
    const backend = { checkStatus: vi.fn() }
    const service = createLicenseActivationService({
      backend,
      config: { mode: 'development-bypass', appVersion: '0.0.0-test' },
      store: createStore()
    })

    await expect(service.getStatus()).resolves.toMatchObject({
      mode: 'development-bypass',
      state: 'active',
      canEnterWorkspace: true
    })
    expect(backend.checkStatus).not.toHaveBeenCalled()
  })

  it('activates a public-like build through the backend and caches entitlement', async () => {
    const service = createLicenseActivationService({
      backend: { checkStatus: async () => activeResponse },
      config: {
        mode: 'required',
        appVersion: '0.1.0-beta.1',
        now: () => new Date('2026-01-01T00:00:00.000Z')
      },
      store: createStore()
    })

    await expect(service.activate({ licenseKey: 'license-key' })).resolves.toMatchObject({
      state: 'active',
      canEnterWorkspace: true
    })
    await expect(service.getStatus()).resolves.toMatchObject({
      state: 'active',
      canEnterWorkspace: true
    })
  })

  it('rejects failed backend activation without allowing workspace entry', async () => {
    const service = createLicenseActivationService({
      backend: {
        checkStatus: async () => ({
          ...activeResponse,
          licenseState: 'revoked'
        })
      },
      config: { mode: 'required', appVersion: '0.1.0-beta.1' },
      store: createStore()
    })

    await expect(service.activate({ licenseKey: 'revoked-key' })).resolves.toMatchObject({
      state: 'revoked',
      canEnterWorkspace: false
    })
  })

  it('allows cached entitlement during grace and blocks after grace expires', async () => {
    const store = createStore()
    await store.save({ ...activeResponse, activatedAt: '2026-01-01T00:00:00.000Z' })

    const graceService = createLicenseActivationService({
      backend: { checkStatus: async () => activeResponse },
      config: {
        mode: 'required',
        appVersion: '0.1.0-beta.1',
        now: () => new Date('2026-01-04T00:00:00.000Z')
      },
      store
    })
    await expect(graceService.getStatus()).resolves.toMatchObject({
      state: 'grace-period',
      canEnterWorkspace: true
    })

    const expiredService = createLicenseActivationService({
      backend: { checkStatus: async () => activeResponse },
      config: {
        mode: 'required',
        appVersion: '0.1.0-beta.1',
        now: () => new Date('2026-01-09T00:00:00.000Z')
      },
      store
    })
    await expect(expiredService.getStatus()).resolves.toMatchObject({
      state: 'grace-expired',
      canEnterWorkspace: false
    })
  })

  it('fails closed when secure storage is unavailable in a public-like build', async () => {
    const service = createLicenseActivationService({
      backend: { checkStatus: async () => activeResponse },
      config: { mode: 'required', appVersion: '0.1.0-beta.1' },
      store: createStore({ protectedStorage: false })
    })

    await expect(service.getStatus()).resolves.toMatchObject({
      state: 'storage-unavailable',
      canEnterWorkspace: false
    })
  })

  it('blocks unsupported versions even with an active license', async () => {
    const service = createLicenseActivationService({
      backend: {
        checkStatus: async () => ({
          ...activeResponse,
          versionSupported: false,
          updateUrl: 'https://spacezero.dev/download'
        })
      },
      config: { mode: 'required', appVersion: '0.1.0-beta.1' },
      store: createStore()
    })

    await expect(service.activate({ licenseKey: 'license-key' })).resolves.toMatchObject({
      state: 'unsupported-version',
      canEnterWorkspace: false,
      updateUrl: 'https://spacezero.dev/download'
    })
  })
})
