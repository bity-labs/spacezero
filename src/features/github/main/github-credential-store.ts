import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { nanoid } from 'nanoid'
import { z } from 'zod'

import { GitHubIntegrationError, type GitHubCredentialStore } from './github-auth.service'

export type ProtectedStorageAdapter = {
  isEncryptionAvailable: () => boolean
  getSelectedStorageBackend?: () => string
  encryptString: (value: string) => Buffer
  decryptString: (value: Buffer) => string
}

const storedCredentialSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessTokenExpiresAt: z.string().min(1),
  refreshTokenExpiresAt: z.string().min(1),
  identity: z.object({
    id: z.string().min(1),
    login: z.string().min(1),
    avatarUrl: z.string().url(),
    profileUrl: z.string().url()
  })
})

export function createProtectedGitHubCredentialStore({
  filePath,
  encryption
}: {
  filePath: string
  encryption: ProtectedStorageAdapter
}): GitHubCredentialStore {
  function assertProtectedStorage(): void {
    const backend = encryption.getSelectedStorageBackend?.()
    if (!encryption.isEncryptionAvailable() || backend === 'basic_text') {
      throw new GitHubIntegrationError('credentials-unavailable')
    }
  }

  return {
    async read() {
      try {
        const encrypted = await readFile(filePath)
        assertProtectedStorage()
        return storedCredentialSchema.parse(JSON.parse(encryption.decryptString(encrypted)))
      } catch (error) {
        if (isFileMissing(error)) return undefined
        if (error instanceof GitHubIntegrationError) throw error
        throw new GitHubIntegrationError('credentials-unavailable')
      }
    },

    async write(credential) {
      assertProtectedStorage()
      const encrypted = encryption.encryptString(
        JSON.stringify(storedCredentialSchema.parse(credential))
      )
      const directory = dirname(filePath)
      const temporaryPath = `${filePath}.${nanoid()}.tmp`
      await mkdir(directory, { recursive: true, mode: 0o700 })

      try {
        await writeFile(temporaryPath, encrypted, { mode: 0o600, flag: 'wx' })
        await chmod(temporaryPath, 0o600)
        await rename(temporaryPath, filePath)
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => undefined)
        if (error instanceof GitHubIntegrationError) throw error
        throw new GitHubIntegrationError('credentials-unavailable')
      }
    },

    async clear() {
      try {
        await rm(filePath, { force: true })
      } catch {
        throw new GitHubIntegrationError('credentials-unavailable')
      }
    }
  }
}

function isFileMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}
