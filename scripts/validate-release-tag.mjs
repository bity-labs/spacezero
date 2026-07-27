#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const BETA_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)(?:\.[0-9A-Za-z-]+)*$/
const BETA_TAG_MESSAGE =
  'Release tag must use a v-prefixed SemVer beta prerelease format, such as v0.1.0-beta.1'

export async function validateReleaseTag({
  tagName = process.env.GITHUB_REF_NAME,
  packageJsonPath = resolve('package.json')
} = {}) {
  if (!tagName) {
    throw new Error('Release tag is required. Pass a tag argument or set GITHUB_REF_NAME.')
  }

  const match = BETA_TAG_PATTERN.exec(tagName)
  if (!match) {
    throw new Error(BETA_TAG_MESSAGE)
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  const packageVersion = packageJson.version
  if (typeof packageVersion !== 'string' || packageVersion.length === 0) {
    throw new Error('package.json version must be a non-empty string')
  }

  const tagVersion = tagName.slice(1)
  if (tagVersion !== packageVersion) {
    throw new Error(`Release tag ${tagName} does not match package.json version ${packageVersion}`)
  }

  return { ok: true, version: packageVersion }
}

async function main() {
  const tagName = process.argv[2] ?? process.env.GITHUB_REF_NAME
  const result = await validateReleaseTag({ tagName })
  process.stdout.write(`Validated public macOS beta release tag v${result.version}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
