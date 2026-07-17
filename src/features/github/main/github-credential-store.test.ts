import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { createProtectedGitHubCredentialStore } from './github-credential-store'

const temporaryDirectories: string[] = []

function xor(value: string | Buffer): Buffer {
  return Buffer.from([...Buffer.from(value)].map((byte) => byte ^ 0xaa))
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('protected GitHub credential store', () => {
  it('persists credentials encrypted and restores them across service instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'spacezero-github-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'github-credentials.bin')
    const encryption = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'kwallet6',
      encryptString: (value: string) => xor(value),
      decryptString: (value: Buffer) => xor(value).toString('utf8')
    }
    const credential = {
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      accessTokenExpiresAt: '2026-07-18T01:00:00.000Z',
      refreshTokenExpiresAt: '2026-08-18T00:00:00.000Z',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
        profileUrl: 'https://github.com/octocat'
      }
    }

    await createProtectedGitHubCredentialStore({ filePath, encryption }).write(credential)

    const storedBytes = await readFile(filePath)
    expect(storedBytes.toString('utf8')).not.toContain('access-secret')
    expect(storedBytes.toString('utf8')).not.toContain('refresh-secret')
    await expect(
      createProtectedGitHubCredentialStore({ filePath, encryption }).read()
    ).resolves.toEqual(credential)
  })

  it('refuses plaintext fallback storage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'spacezero-github-'))
    temporaryDirectories.push(directory)
    const store = createProtectedGitHubCredentialStore({
      filePath: join(directory, 'github-credentials.bin'),
      encryption: {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => 'basic_text',
        encryptString: (value) => Buffer.from(value),
        decryptString: (value) => value.toString('utf8')
      }
    })

    await expect(store.write({} as never)).rejects.toMatchObject({
      code: 'credentials-unavailable'
    })
  })

  it('clears the local credential without failing when no file exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'spacezero-github-'))
    temporaryDirectories.push(directory)
    const store = createProtectedGitHubCredentialStore({
      filePath: join(directory, 'github-credentials.bin'),
      encryption: {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => 'keychain',
        encryptString: (value) => Buffer.from(value),
        decryptString: (value) => value.toString('utf8')
      }
    })

    await expect(store.clear()).resolves.toBeUndefined()
  })
})
