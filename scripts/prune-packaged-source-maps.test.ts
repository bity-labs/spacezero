import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { prunePackagedSourceMaps } = require('./prune-packaged-source-maps.cjs') as {
  prunePackagedSourceMaps: (contextOrDirectory: string | { appOutDir: string }) => Promise<number>
}

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('packaged source map pruning', () => {
  it('removes source maps from packaged app output without removing updater blockmaps', async () => {
    const root = await createTemporaryDirectory('spacezero-packaged-maps-')
    await mkdir(join(root, 'Space Zero.app', 'Contents', 'Resources', 'app.asar.unpacked'), {
      recursive: true
    })

    const sourceMap = join(root, 'Space Zero.app', 'Contents', 'Resources', 'app.asar.unpacked', 'index.js.map')
    const declarationSourceMap = join(
      root,
      'Space Zero.app',
      'Contents',
      'Resources',
      'app.asar.unpacked',
      'index.d.ts.map'
    )
    const blockmap = join(root, 'Space Zero-0.1.0-beta.1-arm64.dmg.blockmap')
    const javascript = join(root, 'Space Zero.app', 'Contents', 'Resources', 'app.asar.unpacked', 'index.js')

    await writeFile(sourceMap, '{}')
    await writeFile(declarationSourceMap, '{}')
    await writeFile(blockmap, 'blockmap metadata')
    await writeFile(javascript, 'console.log("runtime")')

    await expect(prunePackagedSourceMaps(root)).resolves.toBe(2)

    await expect(readFile(sourceMap, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(declarationSourceMap, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(blockmap, 'utf8')).resolves.toBe('blockmap metadata')
    await expect(readFile(javascript, 'utf8')).resolves.toBe('console.log("runtime")')
  })

  it('accepts the electron-builder afterPack context shape', async () => {
    const root = await createTemporaryDirectory('spacezero-packaged-context-')
    const sourceMap = join(root, 'renderer.js.map')
    await writeFile(sourceMap, '{}')

    await expect(prunePackagedSourceMaps({ appOutDir: root })).resolves.toBe(1)
    await expect(readFile(sourceMap, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}
