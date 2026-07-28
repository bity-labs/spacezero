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

const appVersion = '0.1.0-beta.1'

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

  it('activates a public-like build through the backend and caches entitlement with the key for later refresh', async () => {
    const backend = { checkStatus: vi.fn(async () => activeResponse) }
    const service = createLicenseActivationService({
      backend,
      config: {
        mode: 'required',
        appVersion,
        now: () => new Date('2026-01-01T00:00:00.000Z')
      },
      store: createStore()
    })

    await expect(service.activate({ licenseKey: ' license-key ' })).resolves.toMatchObject({
      state: 'active',
      canEnterWorkspace: true
    })
    await expect(service.getStatus()).resolves.toMatchObject({
      state: 'active',
      canEnterWorkspace: true
    })
    expect(backend.checkStatus).toHaveBeenCalledWith({ licenseKey: 'license-key', appVersion })
  })

  it('rejects failed backend activation without allowing workspace entry', async () => {
    const service = createLicenseActivationService({
      backend: {
        checkStatus: async () => ({
          ...activeResponse,
          licenseState: 'revoked'
        })
      },
      config: { mode: 'required', appVersion },
      store: createStore()
    })

    await expect(service.activate({ licenseKey: 'revoked-key' })).resolves.toMatchObject({
      state: 'revoked',
      canEnterWorkspace: false
    })
  })

  it('refreshes cached activation when recheck is due while the app remains open', async () => {
    const store = createStore()
    await store.save({ ...activeResponse, activatedAt: '2026-01-01T00:00:00.000Z', licenseKey: 'license-key' })
    const refreshedResponse = {
      ...activeResponse,
      recheckAfter: '2026-01-03T00:00:00.000Z',
      graceEndsAt: '2026-01-08T00:00:00.000Z'
    }
    const backend = { checkStatus: vi.fn(async () => refreshedResponse) }
    const service = createLicenseActivationService({
      backend,
      config: {
        mode: 'required',
        appVersion,
        now: () => new Date('2026-01-02T00:00:01.000Z')
      },
      store
    })

    await expect(service.getStatus()).resolves.toMatchObject({
      state: 'active',
      canEnterWorkspace: true,
      recheckAfter: '2026-01-03T00:00:00.000Z'
    })
    expect(backend.checkStatus).toHaveBeenCalledWith({ licenseKey: 'license-key', appVersion })
  })

  it('applies revoked and unsupported backend refresh responses immediately', async () => {
    const revokedStore = createStore()
    await revokedStore.save({ ...activeResponse, activatedAt: '2026-01-01T00:00:00.000Z', licenseKey: 'revoked-key' })
    const revokedService = createLicenseActivationService({
      backend: { checkStatus: async () => ({ ...activeResponse, licenseState: 'revoked' }) },
      config: { mode: 'required', appVersion, now: () => new Date('2026-01-02T00:00:01.000Z') },
      store: revokedStore
    })

    await expect(revokedService.getStatus()).resolves.toMatchObject({
      state: 'revoked',
      canEnterWorkspace: false
    })

    const unsupportedStore = createStore()
    await unsupportedStore.save({ ...activeResponse, activatedAt: '2026-01-01T00:00:00.000Z', licenseKey: 'old-build-key' })
    const unsupportedService = createLicenseActivationService({
      backend: {
        checkStatus: async () => ({
          ...activeResponse,
          versionSupported: false,
          updateUrl: 'https://spacezero.dev/download'
        })
      },
      config: { mode: 'required', appVersion, now: () => new Date('2026-01-02T00:00:01.000Z') },
      store: unsupportedStore
    })

    await expect(unsupportedService.getStatus()).resolves.toMatchObject({
      state: 'unsupported-version',
      canEnterWorkspace: false,
      updateUrl: 'https://spacezero.dev/download'
    })
  })

  it('uses cached grace only for transport failures and blocks after grace expires', async () => {
    const store = createStore()
    await store.save({ ...activeResponse, activatedAt: '2026-01-01T00:00:00.000Z', licenseKey: 'license-key' })

    const graceService = createLicenseActivationService({
      backend: { checkStatus: async () => { throw new Error('offline') } },
      config: {
        mode: 'required',
        appVersion,
        now: () => new Date('2026-01-04T00:00:00.000Z')
      },
      store
    })
    await expect(graceService.getStatus()).resolves.toMatchObject({
      state: 'grace-period',
      canEnterWorkspace: true
    })

    const expiredService = createLicenseActivationService({
      backend: { checkStatus: async () => { throw new Error('offline') } },
      config: {
        mode: 'required',
        appVersion,
        now: () => new Date('2026-01-08T00:00:00.000Z')
      },
      store
    })
    await expect(expiredService.getStatus()).resolves.toMatchObject({
      state: 'grace-expired',
      canEnterWorkspace: false
    })
  })

  it('bounds offline cache validity to the earliest server grace and seven days from activation', async () => {
    const afterServerGraceStore = createStore()
    await afterServerGraceStore.save({
      ...activeResponse,
      recheckAfter: '2026-01-10T00:00:00.000Z',
      graceEndsAt: '2026-01-03T00:00:00.000Z',
      activatedAt: '2026-01-01T00:00:00.000Z',
      licenseKey: 'license-key'
    })
    const afterServerGraceService = createLicenseActivationService({
      backend: { checkStatus: async () => activeResponse },
      config: { mode: 'required', appVersion, now: () => new Date('2026-01-04T00:00:00.000Z') },
      store: afterServerGraceStore
    })
    await expect(afterServerGraceService.getStatus()).resolves.toMatchObject({
      state: 'grace-expired',
      canEnterWorkspace: false,
      graceEndsAt: '2026-01-03T00:00:00.000Z'
    })

    const longServerGraceStore = createStore()
    await longServerGraceStore.save({
      ...activeResponse,
      recheckAfter: '2026-01-02T00:00:00.000Z',
      graceEndsAt: '2026-02-01T00:00:00.000Z',
      activatedAt: '2026-01-01T00:00:00.000Z',
      licenseKey: 'license-key'
    })
    const longServerGraceService = createLicenseActivationService({
      backend: { checkStatus: async () => { throw new Error('offline') } },
      config: { mode: 'required', appVersion, now: () => new Date('2026-01-08T00:00:00.000Z') },
      store: longServerGraceStore
    })
    await expect(longServerGraceService.getStatus()).resolves.toMatchObject({
      state: 'grace-expired',
      canEnterWorkspace: false,
      graceEndsAt: '2026-01-08T00:00:00.000Z'
    })
  })

  it('fails closed for malformed cache timestamps', async () => {
    const store = createStore()
    await store.save({
      ...activeResponse,
      recheckAfter: 'not-a-date',
      graceEndsAt: '2026-01-08T00:00:00.000Z',
      activatedAt: '2026-01-01T00:00:00.000Z',
      licenseKey: 'license-key'
    })
    const service = createLicenseActivationService({
      backend: { checkStatus: async () => activeResponse },
      config: { mode: 'required', appVersion, now: () => new Date('2026-01-02T00:00:00.000Z') },
      store
    })

    await expect(service.getStatus()).resolves.toMatchObject({
      state: 'grace-expired',
      canEnterWorkspace: false
    })
  })

  it('rejects malformed activation payloads before the backend is called', async () => {
    const backend = { checkStatus: vi.fn(async () => activeResponse) }
    const service = createLicenseActivationService({
      backend,
      config: { mode: 'required', appVersion },
      store: createStore()
    })

    await expect(service.activate({})).resolves.toMatchObject({ state: 'invalid', canEnterWorkspace: false })
    await expect(service.activate({ licenseKey: 123 })).resolves.toMatchObject({ state: 'invalid', canEnterWorkspace: false })
    await expect(service.activate({ licenseKey: 'x'.repeat(4097) })).resolves.toMatchObject({
      state: 'invalid',
      canEnterWorkspace: false
    })
    expect(backend.checkStatus).not.toHaveBeenCalled()
  })

  it('fails closed when secure storage is unavailable in a public-like build', async () => {
    const service = createLicenseActivationService({
      backend: { checkStatus: async () => activeResponse },
      config: { mode: 'required', appVersion },
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
      config: { mode: 'required', appVersion },
      store: createStore()
    })

    await expect(service.activate({ licenseKey: 'license-key' })).resolves.toMatchObject({
      state: 'unsupported-version',
      canEnterWorkspace: false,
      updateUrl: 'https://spacezero.dev/download'
    })
  })
})
