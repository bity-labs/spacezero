import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { LicenseEntitlementStore } from './license-activation.service'

const ENTITLEMENT_FILE = 'license-entitlement.bin'

export function createSafeStorageLicenseEntitlementStore(): LicenseEntitlementStore {
  const entitlementPath = join(app.getPath('userData'), 'license-activation', ENTITLEMENT_FILE)

  return {
    isProtected: () => safeStorage.isEncryptionAvailable(),

    async load() {
      try {
        const encrypted = await readFile(entitlementPath)
        const decrypted = safeStorage.decryptString(encrypted)
        return JSON.parse(decrypted) as Awaited<ReturnType<LicenseEntitlementStore['load']>>
      } catch (error) {
        if (isMissingFileError(error)) return null
        throw error
      }
    },

    async save(entitlement) {
      await mkdir(dirname(entitlementPath), { recursive: true })
      const encrypted = safeStorage.encryptString(JSON.stringify(entitlement))
      await writeFile(entitlementPath, encrypted, { mode: 0o600 })
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
