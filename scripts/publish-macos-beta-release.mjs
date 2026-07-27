#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import console from 'node:console'
import process from 'node:process'

import { verifyMacosReleaseArtifacts } from './verify-macos-release-artifacts.mjs'

const artifactDir = process.env.MACOS_RELEASE_ARTIFACT_DIR ?? 'dist'
const tagName = process.env.GITHUB_REF_NAME
const targetSha = process.env.GITHUB_SHA
const repository = process.env.GITHUB_REPOSITORY ?? 'bity-labs/spacezero'

if (!tagName) {
  console.error('GITHUB_REF_NAME is required to publish a macOS beta release')
  process.exit(1)
}

if (!targetSha) {
  console.error('GITHUB_SHA is required to publish a macOS beta release')
  process.exit(1)
}

let verifiedArtifacts
try {
  verifiedArtifacts = await verifyMacosReleaseArtifacts(artifactDir)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const artifactPaths = [
  ...verifiedArtifacts.dmgFiles,
  ...verifiedArtifacts.dmgBlockmaps,
  ...verifiedArtifacts.zipFiles,
  ...verifiedArtifacts.zipBlockmaps,
  'beta-mac.yml'
].map((file) => `${artifactDir}/${file}`)

const result = spawnSync(
  'gh',
  [
    'release',
    'create',
    tagName,
    ...artifactPaths,
    '--repo',
    repository,
    '--target',
    targetSha,
    '--title',
    tagName,
    '--notes',
    `Space Zero ${tagName}`,
    '--prerelease'
  ],
  { stdio: 'inherit', shell: false }
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
