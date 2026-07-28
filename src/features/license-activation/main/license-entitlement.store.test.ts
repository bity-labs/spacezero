import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it, vi } from 'vitest'

import { createProtectedLicenseEntitlementStore } from './license-entitlement.store'

const entitlement = {
  licenseState: 'active' as const,
  versionSupported: true,
  recheckAfter: '2026-01-02T00:00:00.000Z',
  graceEndsAt: '2026-01-08T00:00:00.000Z',
  activatedAt: '2026-01-01T00:00:00.000Z',
  licenseKey: 'license-key'
}

describe('license entitlement store', () => {
  it('round-trips entitlement material through a protected encrypted backend', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-license-store-'))
    const filePath = join(root, 'license-entitlement.bin')
    const store = createProtectedLicenseEntitlementStore({
      entitlementPath: filePath,
      encryption: {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => 'keychain',
        encryptString: (value) => Buffer.from(`encrypted:${Buffer.from(value, 'utf8').toString('base64')}`, 'utf8'),
        decryptString: (value) => Buffer.from(value.toString('utf8').replace(/^encrypted:/, ''), 'base64').toString('utf8')
      }
    })

    await store.save(entitlement)

    await expect(readFile(filePath, 'utf8')).resolves.not.toContain('license-key')
    await expect(store.load()).resolves.toEqual(entitlement)
  })

  it('rejects the Linux basic_text backend without writing entitlement material', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-license-store-'))
    const filePath = join(root, 'license-entitlement.bin')
    const encryptString = vi.fn((value: string) => Buffer.from(value, 'utf8'))
    const store = createProtectedLicenseEntitlementStore({
      entitlementPath: filePath,
      encryption: {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => 'basic_text',
        encryptString,
        decryptString: (value) => value.toString('utf8')
      }
    })

    expect(store.isProtected()).toBe(false)
    await expect(store.save(entitlement)).rejects.toThrow(/storage-unavailable/)
    await expect(stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(encryptString).not.toHaveBeenCalled()
  })
})
