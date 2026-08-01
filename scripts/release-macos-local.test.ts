import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

describe('local macOS release entrypoint', () => {
  it('exposes a non-publishing two-architecture release plan without requesting credentials', async () => {
    const { stdout } = await execFileAsync('bash', ['scripts/release-macos-local.sh', '--plan'])

    expect(stdout).toContain('arm64 app: sign -> notarize -> staple')
    expect(stdout).toContain('arm64 DMG: sign -> notarize -> staple')
    expect(stdout).toContain('x64 app: sign -> notarize -> staple')
    expect(stdout).toContain('x64 DMG: sign -> notarize -> staple')
    expect(stdout).toContain('Publishing: disabled')
  })

  it('structurally disables Electron Builder publishing and has no release upload command', async () => {
    const script = await readFile('scripts/release-macos-local.sh', 'utf8')

    expect(script.match(/--publish never/g)).toHaveLength(2)
    expect(script).not.toContain('gh release')
    expect(script).not.toContain('publish-macos-beta-release')
  })
})
