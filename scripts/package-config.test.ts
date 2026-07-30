import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

interface PackageJson {
  build?: {
    files?: string[]
    afterPack?: unknown
    mac?: {
      target?: string[]
      publish?: Array<{
        provider?: string
        owner?: string
        repo?: string
        releaseType?: string
        channel?: string
      }>
    }
    win?: { publish?: unknown }
    linux?: { publish?: unknown }
  }
}

describe('electron-builder release metadata', () => {
  it('publishes macOS prereleases to the explicit GitHub beta update channel only', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as PackageJson

    expect(packageJson.build?.files).toEqual(['out/**', '!**/*.map'])
    expect(packageJson.build?.afterPack).toBeUndefined()
    expect(packageJson.build?.mac?.target).toEqual(['dmg', 'zip'])
    expect(packageJson.build?.mac?.publish).toEqual([
      {
        provider: 'github',
        owner: 'bity-labs',
        repo: 'spacezero',
        releaseType: 'prerelease',
        channel: 'beta'
      }
    ])
    expect(packageJson.build?.win?.publish).toBeUndefined()
    expect(packageJson.build?.linux?.publish).toBeUndefined()
  })
})
