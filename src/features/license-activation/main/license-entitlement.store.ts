import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { LicenseEntitlementStore } from './license-activation.service'

const ENTITLEMENT_FILE = 'license-entitlement.bin'

type ProtectedStorageAdapter = {
  isEncryptionAvailable: () => boolean
  getSelectedStorageBackend?: () => string
  encryptString: (value: string) => Buffer
  decryptString: (value: Buffer) => string
}

export function createSafeStorageLicenseEntitlementStore(): LicenseEntitlementStore {
  return createProtectedLicenseEntitlementStore({
    entitlementPath: join(app.getPath('userData'), 'license-activation', ENTITLEMENT_FILE),
    encryption: safeStorage
  })
}

export function createProtectedLicenseEntitlementStore({
  entitlementPath,
  encryption
}: {
  entitlementPath: string
  encryption: ProtectedStorageAdapter
}): LicenseEntitlementStore {
  function isProtected(): boolean {
    return encryption.isEncryptionAvailable() && encryption.getSelectedStorageBackend?.() !== 'basic_text'
  }

  return {
    isProtected,

    async load() {
      try {
        if (!isProtected()) throw new Error('storage-unavailable')
        const encrypted = await readFile(entitlementPath)
        const decrypted = encryption.decryptString(encrypted)
        return JSON.parse(decrypted) as Awaited<ReturnType<LicenseEntitlementStore['load']>>
      } catch (error) {
        if (isMissingFileError(error)) return null
        throw error
      }
    },

    async save(entitlement) {
      if (!isProtected()) throw new Error('storage-unavailable')
      await mkdir(dirname(entitlementPath), { recursive: true })
      const encrypted = encryption.encryptString(JSON.stringify(entitlement))
      await writeFile(entitlementPath, encrypted, { mode: 0o600 })
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
