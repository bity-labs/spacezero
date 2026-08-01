#!/usr/bin/env node
import { createHash } from 'node:crypto'
import console from 'node:console'
import { createReadStream } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

import YAML from 'yaml'

const artifactDir = process.argv[2] ?? 'dist'

async function listArtifacts(directory) {
  try {
    return await readdir(directory)
  } catch (error) {
    throw new Error(`release artifact directory is not readable: ${directory}`, { cause: error })
  }
}

function requireArtifact(files, label, predicate) {
  const matches = files.filter(predicate)

  if (matches.length === 0) {
    throw new Error(`missing required macOS release artifact: ${label}`)
  }

  return matches
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

function expectedMultiArchNames(version, architectures) {
  return architectures.flatMap((architecture) => [
    `Space-Zero-${version}-${architecture}-mac.zip`,
    `Space-Zero-${version}-${architecture}.dmg`
  ])
}

async function verifyMultiArchitectureMetadata(directory, files, { version, architectures }) {
  const expectedNames = expectedMultiArchNames(version, architectures)
  const releaseArtifacts = files.filter(
    (file) =>
      (file.endsWith('.dmg') || file.endsWith('.zip')) &&
      !file.endsWith('.dmg.blockmap') &&
      !file.endsWith('.zip.blockmap')
  )
  const unexpected = releaseArtifacts.filter((file) => !expectedNames.includes(file))
  const missing = expectedNames.filter((file) => !releaseArtifacts.includes(file))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `multi-architecture artifact set mismatch; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`
    )
  }

  for (const name of expectedNames) {
    if (!files.includes(`${name}.blockmap`)) {
      throw new Error(`missing required macOS release artifact: ${name}.blockmap`)
    }
  }

  const metadataPath = join(directory, 'beta-mac.yml')
  const metadata = YAML.parse(await readFile(metadataPath, 'utf8'))
  if (metadata.version !== version || !Array.isArray(metadata.files)) {
    throw new Error('beta-mac.yml has the wrong version or files structure')
  }
  if (metadata.files.length !== expectedNames.length) {
    throw new Error('beta-mac.yml does not describe exactly the final multi-architecture artifacts')
  }

  for (const name of expectedNames) {
    const entries = metadata.files.filter((entry) => entry?.url === name)
    if (entries.length !== 1) {
      throw new Error(`beta-mac.yml must contain exactly one entry for ${name}`)
    }
    const artifactPath = join(directory, name)
    const artifactStat = await stat(artifactPath)
    const actualSha512 = await hashFile(artifactPath, 'sha512', 'base64')
    if (entries[0].size !== artifactStat.size || entries[0].sha512 !== actualSha512) {
      throw new Error(`metadata does not match final artifact: ${name}`)
    }
  }

  const x64Zip = `Space-Zero-${version}-x64-mac.zip`
  const x64ZipEntry = metadata.files.find((entry) => entry.url === x64Zip)
  if (metadata.path !== x64Zip || metadata.sha512 !== x64ZipEntry.sha512) {
    throw new Error('beta-mac.yml compatibility fields must reference the x64 updater ZIP')
  }

  const checksumNames = [
    ...expectedNames,
    ...expectedNames.map((name) => `${name}.blockmap`),
    'beta-mac.yml'
  ]
  const checksumText = await readFile(join(directory, 'SHA256SUMS.txt'), 'utf8')
  const checksums = new Map(
    checksumText
      .trim()
      .split('\n')
      .map((line) => {
        const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line)
        if (!match) throw new Error('SHA256SUMS.txt contains an invalid line')
        return [match[2], match[1]]
      })
  )
  if (checksums.size !== checksumNames.length) {
    throw new Error('SHA256SUMS.txt does not describe exactly the final release files')
  }
  for (const name of checksumNames) {
    const actualSha256 = await hashFile(join(directory, name), 'sha256', 'hex')
    if (checksums.get(name) !== actualSha256) {
      throw new Error(`checksum does not match final release file: ${name}`)
    }
  }
}

export async function verifyMacosReleaseArtifacts(directory = artifactDir, options = {}) {
  const files = await listArtifacts(directory)

  const dmgFiles = requireArtifact(
    files,
    'DMG installer',
    (file) => file.endsWith('.dmg') && !file.endsWith('.dmg.blockmap')
  )
  const dmgBlockmaps = requireArtifact(files, 'DMG blockmap', (file) =>
    file.endsWith('.dmg.blockmap')
  )
  const zipFiles = requireArtifact(
    files,
    'ZIP updater archive',
    (file) => file.endsWith('.zip') && !file.endsWith('.zip.blockmap')
  )
  const zipBlockmaps = requireArtifact(files, 'ZIP blockmap', (file) =>
    file.endsWith('.zip.blockmap')
  )
  requireArtifact(files, 'beta-mac.yml updater metadata', (file) => file === 'beta-mac.yml')

  if (options.version && options.architectures) {
    await verifyMultiArchitectureMetadata(directory, files, options)
  }

  return {
    directory,
    dmgFiles,
    dmgBlockmaps,
    zipFiles,
    zipBlockmaps,
    metadataFile: join(directory, 'beta-mac.yml')
  }
}

function parseCliOptions(argv) {
  const options = {}
  for (let index = 1; index < argv.length; index += 2) {
    if (argv[index] === '--version') options.version = argv[index + 1]
    if (argv[index] === '--architectures') options.architectures = argv[index + 1].split(',')
  }
  if ((options.version && !options.architectures) || (!options.version && options.architectures)) {
    throw new Error('--version and --architectures must be provided together')
  }
  return options
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyMacosReleaseArtifacts(artifactDir, parseCliOptions(process.argv.slice(2)))
    .then((result) => {
      console.log(
        `Verified macOS release artifacts in ${result.directory}: DMG, ZIP, blockmaps, beta-mac.yml`
      )
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
