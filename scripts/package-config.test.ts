import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

interface PackageJson {
  build?: {
    files?: string[]
    afterPack?: unknown
    mac?: {
      icon?: string
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

function readIcnsChunkTypes(icon: Buffer): string[] {
  expect(icon.subarray(0, 4).toString('ascii')).toBe('icns')

  const chunkTypes: string[] = []
  let offset = 8

  while (offset + 8 <= icon.length) {
    const type = icon.subarray(offset, offset + 4).toString('ascii')
    const length = icon.readUInt32BE(offset + 4)
    if (length < 8 || offset + length > icon.length) throw new Error(`Invalid ICNS chunk: ${type}`)
    chunkTypes.push(type)
    offset += length
  }

  return chunkTypes
}

describe('electron-builder release metadata', () => {
  it('packages the authored macOS icon with dedicated small-size representations', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as PackageJson

    expect(packageJson.build?.mac?.icon).toBe('resources/icon.icns')

    const icon = await readFile('resources/icon.icns')
    expect(readIcnsChunkTypes(icon)).toEqual(
      expect.arrayContaining([
        'ic04',
        'ic05',
        'ic07',
        'ic08',
        'ic09',
        'ic10',
        'ic11',
        'ic12',
        'ic13',
        'ic14'
      ])
    )
  })

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
