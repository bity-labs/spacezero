import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { validateReleaseTag } from './validate-release-tag.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('validateReleaseTag', () => {
  it('accepts a v-prefixed beta prerelease tag that matches package.json', async () => {
    const packageJsonPath = await writePackageJson({ version: '0.1.0-beta.1' })

    expect(await validateReleaseTag({ tagName: 'v0.1.0-beta.1', packageJsonPath })).toEqual({
      ok: true,
      version: '0.1.0-beta.1'
    })
  })

  it('rejects a tag that does not match package.json', async () => {
    const packageJsonPath = await writePackageJson({ version: '0.1.0-beta.1' })

    await expect(validateReleaseTag({ tagName: 'v0.1.0-beta.2', packageJsonPath })).rejects.toThrow(
      'Release tag v0.1.0-beta.2 does not match package.json version 0.1.0-beta.1'
    )
  })

  it('rejects a matching tag without the v prefix', async () => {
    const packageJsonPath = await writePackageJson({ version: '0.1.0-beta.1' })

    await expect(validateReleaseTag({ tagName: '0.1.0-beta.1', packageJsonPath })).rejects.toThrow(
      'Release tag must use a v-prefixed SemVer beta prerelease format, such as v0.1.0-beta.1'
    )
  })

  it('rejects a matching non-beta release tag', async () => {
    const packageJsonPath = await writePackageJson({ version: '0.1.0' })

    await expect(validateReleaseTag({ tagName: 'v0.1.0', packageJsonPath })).rejects.toThrow(
      'Release tag must use a v-prefixed SemVer beta prerelease format, such as v0.1.0-beta.1'
    )
  })
})

async function writePackageJson(packageJson: { version: string }): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'spacezero-release-tag-'))
  temporaryDirectories.push(directory)
  const packageJsonPath = join(directory, 'package.json')
  await writeFile(packageJsonPath, JSON.stringify(packageJson), 'utf8')
  return packageJsonPath
}
