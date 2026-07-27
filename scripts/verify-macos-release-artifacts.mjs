#!/usr/bin/env node
import console from 'node:console'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

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

export async function verifyMacosReleaseArtifacts(directory = artifactDir) {
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

  return {
    directory,
    dmgFiles,
    dmgBlockmaps,
    zipFiles,
    zipBlockmaps,
    metadataFile: join(directory, 'beta-mac.yml')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyMacosReleaseArtifacts()
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
