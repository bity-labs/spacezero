#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { rename, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'

import YAML from 'yaml'

const require = createRequire(import.meta.url)

export function expectedLocalMacosArtifactNames(version) {
  return [
    `Space-Zero-${version}-arm64-mac.zip`,
    `Space-Zero-${version}-x64-mac.zip`,
    `Space-Zero-${version}-arm64.dmg`,
    `Space-Zero-${version}-x64.dmg`
  ]
}

async function hashFile(path, algorithm, encoding) {
  const hash = createHash(algorithm)
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  return hash.digest(encoding)
}

async function defaultBuildBlockmap(artifactPath, blockmapPath) {
  const electronBuilderPackage = require.resolve('electron-builder/package.json')
  const electronBuilderRequire = createRequire(electronBuilderPackage)
  const blockmapModule = electronBuilderRequire('app-builder-lib/out/targets/blockmap/blockmap.js')
  await blockmapModule.buildBlockMap(artifactPath, 'gzip', blockmapPath)
}

async function writeAtomically(path, content) {
  const temporaryPath = `${path}.tmp-${process.pid}`
  await writeFile(temporaryPath, content, { mode: 0o600 })
  await rename(temporaryPath, path)
}

export async function finalizeLocalMacosRelease({
  artifactDirectory,
  version,
  releaseDate = new Date().toISOString(),
  buildBlockmap = defaultBuildBlockmap
}) {
  const artifactNames = expectedLocalMacosArtifactNames(version)
  const files = []

  for (const name of artifactNames) {
    const artifactPath = join(artifactDirectory, name)
    const fileStat = await stat(artifactPath)
    if (!fileStat.isFile()) {
      throw new Error(`expected release artifact is not a file: ${artifactPath}`)
    }

    await buildBlockmap(artifactPath, `${artifactPath}.blockmap`)
    files.push({
      url: name,
      sha512: await hashFile(artifactPath, 'sha512', 'base64'),
      size: fileStat.size
    })
  }

  const compatibilityZip = files.find((file) => file.url.endsWith('-x64-mac.zip'))
  if (!compatibilityZip) {
    throw new Error('x64 updater ZIP is required for compatibility metadata')
  }

  const metadata = {
    version,
    files,
    path: compatibilityZip.url,
    sha512: compatibilityZip.sha512,
    releaseDate
  }
  await writeAtomically(join(artifactDirectory, 'beta-mac.yml'), YAML.stringify(metadata))

  const checksumNames = [
    ...artifactNames,
    ...artifactNames.map((name) => `${name}.blockmap`),
    'beta-mac.yml'
  ]
  const checksumLines = []
  for (const name of checksumNames) {
    checksumLines.push(`${await hashFile(join(artifactDirectory, name), 'sha256', 'hex')}  ${name}`)
  }
  await writeAtomically(join(artifactDirectory, 'SHA256SUMS.txt'), `${checksumLines.join('\n')}\n`)

  return {
    artifactDirectory,
    metadataFile: join(artifactDirectory, 'beta-mac.yml'),
    checksumFile: join(artifactDirectory, 'SHA256SUMS.txt'),
    files: files.map((file) => basename(file.url))
  }
}

function parseCliArguments(argv) {
  const argumentsByName = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    argumentsByName.set(argv[index], argv[index + 1])
  }
  const artifactDirectory = argumentsByName.get('--artifact-dir')
  const version = argumentsByName.get('--version')
  if (!artifactDirectory || !version) {
    throw new Error('Usage: finalize-local-macos-release.mjs --artifact-dir DIR --version VERSION')
  }
  return { artifactDirectory, version }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  finalizeLocalMacosRelease(parseCliArguments(process.argv.slice(2)))
    .then((result) => {
      process.stdout.write(
        `Finalized multi-architecture release metadata in ${result.artifactDirectory}\n`
      )
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
