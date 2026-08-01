import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'

import { finalizeLocalMacosRelease } from './finalize-local-macos-release.mjs'
import { verifyMacosReleaseArtifacts } from './verify-macos-release-artifacts.mjs'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'spacezero-macos-release-'))
  temporaryDirectories.push(directory)
  return directory
}

function sha512(value: Buffer): string {
  return createHash('sha512').update(value).digest('base64')
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
})

describe('finalizeLocalMacosRelease', () => {
  it('writes one architecture-aware beta metadata file from final artifact bytes', async () => {
    const directory = await createTemporaryDirectory()
    const version = '0.1.0-beta.5'
    const artifactContents = new Map([
      [`Space-Zero-${version}-arm64-mac.zip`, Buffer.from('arm zip')],
      [`Space-Zero-${version}-x64-mac.zip`, Buffer.from('intel zip')],
      [`Space-Zero-${version}-arm64.dmg`, Buffer.from('arm dmg')],
      [`Space-Zero-${version}-x64.dmg`, Buffer.from('intel dmg')]
    ])

    for (const [name, content] of artifactContents) {
      await writeFile(join(directory, name), content)
    }

    await finalizeLocalMacosRelease({
      artifactDirectory: directory,
      version,
      releaseDate: '2026-08-01T12:00:00.000Z',
      buildBlockmap: async (artifactPath, blockmapPath) => {
        await writeFile(blockmapPath, `blockmap:${artifactPath}`)
      }
    })

    const metadata = YAML.parse(await readFile(join(directory, 'beta-mac.yml'), 'utf8'))

    expect(metadata.version).toBe(version)
    expect(metadata.path).toBe(`Space-Zero-${version}-x64-mac.zip`)
    expect(metadata.files.map((file: { url: string }) => file.url)).toEqual([
      `Space-Zero-${version}-arm64-mac.zip`,
      `Space-Zero-${version}-x64-mac.zip`,
      `Space-Zero-${version}-arm64.dmg`,
      `Space-Zero-${version}-x64.dmg`
    ])

    for (const file of metadata.files as Array<{ url: string; sha512: string; size: number }>) {
      const content = artifactContents.get(file.url)
      expect(content).toBeDefined()
      expect(file.sha512).toBe(sha512(content!))
      expect(file.size).toBe(content!.length)
      await expect(readFile(join(directory, `${file.url}.blockmap`), 'utf8')).resolves.toContain(
        'blockmap:'
      )
    }
  })

  it('rejects final bytes that no longer match multi-architecture updater metadata', async () => {
    const directory = await createTemporaryDirectory()
    const version = '0.1.0-beta.5'
    for (const name of [
      `Space-Zero-${version}-arm64-mac.zip`,
      `Space-Zero-${version}-x64-mac.zip`,
      `Space-Zero-${version}-arm64.dmg`,
      `Space-Zero-${version}-x64.dmg`
    ]) {
      await writeFile(join(directory, name), name)
    }

    await finalizeLocalMacosRelease({
      artifactDirectory: directory,
      version,
      buildBlockmap: async (_artifactPath, blockmapPath) => writeFile(blockmapPath, 'blockmap')
    })
    await writeFile(join(directory, `Space-Zero-${version}-arm64.dmg`), 'changed after metadata')

    await expect(
      verifyMacosReleaseArtifacts(directory, { version, architectures: ['arm64', 'x64'] })
    ).rejects.toThrow('metadata does not match final artifact')
  })

  it('rejects a blockmap changed after final checksums were written', async () => {
    const directory = await createTemporaryDirectory()
    const version = '0.1.0-beta.5'
    for (const name of [
      `Space-Zero-${version}-arm64-mac.zip`,
      `Space-Zero-${version}-x64-mac.zip`,
      `Space-Zero-${version}-arm64.dmg`,
      `Space-Zero-${version}-x64.dmg`
    ]) {
      await writeFile(join(directory, name), name)
    }

    await finalizeLocalMacosRelease({
      artifactDirectory: directory,
      version,
      buildBlockmap: async (_artifactPath, blockmapPath) => writeFile(blockmapPath, 'blockmap')
    })
    await writeFile(join(directory, `Space-Zero-${version}-x64.dmg.blockmap`), 'corrupt')

    await expect(
      verifyMacosReleaseArtifacts(directory, { version, architectures: ['arm64', 'x64'] })
    ).rejects.toThrow('checksum does not match final release file')
  })
})
