import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

interface WorkflowStep {
  name?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  if?: string
  with?: Record<string, string | number | boolean>
}

interface WorkflowJob {
  permissions?: Record<string, string>
  'runs-on'?: string
  env?: Record<string, string>
  if?: string
  needs?: string
  steps?: WorkflowStep[]
}

interface Workflow {
  on?: {
    push?: {
      tags?: string[]
    }
    workflow_dispatch?: null | Record<string, never>
  }
  permissions?: Record<string, string>
  jobs?: Record<string, WorkflowJob>
}

async function readWorkflow() {
  return parse(await readFile('.github/workflows/macos-beta-release.yml', 'utf8')) as Workflow
}

function steps(job?: WorkflowJob) {
  return job?.steps ?? []
}

function stepNamed(job: WorkflowJob | undefined, name: string) {
  return steps(job).find((step) => step.name === name)
}

const fullShaPattern = /^[a-f0-9]{40}$/

describe('public macOS beta release workflow', () => {
  it('runs for beta tags or manual package-only verification and defaults to read-only access', async () => {
    const workflow = await readWorkflow()
    const packageJob = workflow.jobs?.['package-macos-beta']
    const publishJob = workflow.jobs?.['publish-macos-beta']

    expect(workflow.on?.push?.tags).toEqual(['v*-beta.*'])
    expect(workflow.on).toHaveProperty('workflow_dispatch')
    expect(stepNamed(packageJob, 'Validate beta release tag matches package version')?.if).toBe(
      "github.event_name == 'push'"
    )
    expect(publishJob?.if).toBe("github.event_name == 'push'")
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(Object.keys(workflow.permissions ?? {})).toEqual(['contents'])
  })

  it('pins pnpm deterministically and asserts the installed version', async () => {
    const workflow = await readWorkflow()
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      packageManager?: string
    }
    const packageJob = workflow.jobs?.['package-macos-beta']
    const setupPnpm = stepNamed(packageJob, 'Set up pnpm')
    const assertPnpm = stepNamed(packageJob, 'Assert pnpm version')

    expect(packageJson.packageManager).toBe('pnpm@10.28.1')
    expect(setupPnpm?.uses?.split('@')[1]).toMatch(fullShaPattern)
    expect(setupPnpm?.with).toMatchObject({ version: '10.28.1', run_install: false })
    expect(assertPnpm?.run).toBe('test "$(pnpm --version)" = "10.28.1"')
  })

  it('keeps setup, install, validation, and build free of release write authority and private signing secrets', async () => {
    const workflow = await readWorkflow()
    const packageJob = workflow.jobs?.['package-macos-beta']
    const publishJob = workflow.jobs?.['publish-macos-beta']

    expect(packageJob?.permissions).toEqual({ contents: 'read' })
    expect(publishJob?.permissions).toEqual({ contents: 'write' })
    expect(packageJob?.env).toEqual({
      SPACEZERO_GITHUB_CLIENT_ID: '${{ vars.SPACEZERO_GITHUB_CLIENT_ID }}',
      SPACEZERO_GITHUB_APP_SLUG: '${{ vars.SPACEZERO_GITHUB_APP_SLUG }}',
      NODE_OPTIONS: '--max-old-space-size=4096'
    })

    const prepublicationStepNames = [
      'Check out release tag',
      'Set up pnpm',
      'Assert pnpm version',
      'Set up Node.js',
      'Install dependencies',
      'Validate beta release tag matches package version',
      'Prepare public GitHub App config',
      'Build renderer and main bundles'
    ]

    for (const name of prepublicationStepNames) {
      expect(stepNamed(packageJob, name)?.env ?? {}).toEqual({})
    }

    expect(stepNamed(packageJob, 'Check out release tag')?.with).toMatchObject({
      'persist-credentials': false
    })
    expect(stepNamed(publishJob, 'Check out release scripts')?.with).toMatchObject({
      'persist-credentials': false
    })
  })

  it('pins every external action reference to a full immutable commit SHA', async () => {
    const workflow = await readWorkflow()
    const actionSteps = Object.values(workflow.jobs ?? {}).flatMap((job) =>
      steps(job).filter((step) => step.uses)
    )

    expect(actionSteps.length).toBeGreaterThan(0)
    for (const step of actionSteps) {
      expect(step.uses).toMatch(/^[^@]+@[a-f0-9]{40}$/)
    }
  })

  it('uses the approved public variables and exact signing/notarization secret names at the minimum steps', async () => {
    const workflow = await readWorkflow()
    const packageJob = workflow.jobs?.['package-macos-beta']
    const publishJob = workflow.jobs?.['publish-macos-beta']
    const packageStep = stepNamed(
      packageJob,
      'Package, Developer ID sign, and notarize artifacts without publishing'
    )
    const publishStep = stepNamed(publishJob, 'Publish GitHub prerelease')

    expect(packageStep?.env).toEqual({
      CSC_LINK: '${{ secrets.CSC_LINK }}',
      CSC_KEY_PASSWORD: '${{ secrets.CSC_KEY_PASSWORD }}',
      APPLE_API_KEY_ID: '${{ secrets.APPLE_API_KEY_ID }}',
      APPLE_API_KEY_P8: '${{ secrets.APPLE_API_KEY_P8 }}',
      APPLE_ISSUER: '${{ secrets.APPLE_ISSUER }}'
    })
    expect(publishStep?.env).toEqual({ GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}' })
    expect(workflow.permissions).not.toHaveProperty('actions')
    expect(workflow.permissions).not.toHaveProperty('id-token')
  })

  it('installs G2 in the login keychain and makes electron-builder use the prepared signing keychain', async () => {
    const workflow = await readWorkflow()
    const packageJob = workflow.jobs?.['package-macos-beta']
    const packageRun =
      stepNamed(packageJob, 'Package, Developer ID sign, and notarize artifacts without publishing')
        ?.run ?? ''
    const verifyRun =
      stepNamed(packageJob, 'Verify Developer ID signature and notarization')?.run ?? ''

    expect(packageRun).toContain('https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer')
    expect(packageRun).toContain('f16cd3c54c7f83cea4bf1a3e6a0819c8aaa8e4a1528fd144715f350643d2df3a')
    expect(packageRun).toContain('security import "$g2_path" -k "$login_keychain"')
    expect(packageRun).toContain('security import "$cert_path"')
    expect(packageRun).toContain('-S apple-tool:,apple:')
    expect(packageRun).toContain('export CSC_KEYCHAIN="$signing_keychain"')
    expect(packageRun).toContain("export CSC_NAME='bitylabs (XFC6SG6TLY)'")
    expect(packageRun).toContain('unset CSC_LINK CSC_KEY_PASSWORD')
    expect(packageRun.indexOf('unset CSC_LINK CSC_KEY_PASSWORD')).toBeLessThan(
      packageRun.indexOf('pnpm exec electron-builder')
    )
    expect(verifyRun).toContain('codesign --verify --deep --strict')
    expect(verifyRun).toContain('spctl --assess --type execute')
    expect(verifyRun).toContain('xcrun stapler validate')
  })

  it('removes the plaintext App Store Connect key through a trap when packaging fails immediately after creation', async () => {
    const workflow = await readWorkflow()
    const packageStep = stepNamed(
      workflow.jobs?.['package-macos-beta'],
      'Package, Developer ID sign, and notarize artifacts without publishing'
    )
    const originalRun = packageStep?.run ?? ''
    const keyWrite = `printf '%s' "$APPLE_API_KEY_P8" > "$api_key_path"`
    const runWithFailureAfterKeyCreation = originalRun.replace(keyWrite, `${keyWrite}\nexit 42`)
    const tempDir = await mkdtemp(join(tmpdir(), 'spacezero-key-cleanup-'))
    const binDir = join(tempDir, 'bin')
    const loginKeychain = join(tempDir, 'login.keychain-db')

    expect(runWithFailureAfterKeyCreation).not.toBe(originalRun)
    await import('node:fs/promises').then(({ mkdir }) => mkdir(binDir))
    await writeFile(loginKeychain, '')
    await writeFile(
      join(binDir, 'security'),
      `#!/usr/bin/env bash
if [[ "$1" == "default-keychain" ]]; then
  printf '    "%s"\\n' "$TEST_LOGIN_KEYCHAIN"
elif [[ "$1" == "list-keychains" && "$*" != *" -s "* ]]; then
  printf '    "%s"\\n' "$TEST_LOGIN_KEYCHAIN"
fi
exit 0
`,
      { mode: 0o700 }
    )
    await writeFile(join(binDir, 'openssl'), '#!/usr/bin/env bash\nprintf "test-password\\n"\n', {
      mode: 0o700
    })

    const result = spawnSync('bash', ['-c', runWithFailureAfterKeyCreation], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        RUNNER_TEMP: tempDir,
        TEST_LOGIN_KEYCHAIN: loginKeychain,
        APPLE_API_KEY_ID: 'TESTKEY',
        APPLE_API_KEY_P8: 'PRIVATE KEY CONTENTS',
        APPLE_ISSUER: 'issuer',
        CSC_LINK: 'certificate',
        CSC_KEY_PASSWORD: 'password'
      },
      encoding: 'utf8'
    })

    expect(result.status).toBe(42)
    expect(await readFile(join(tempDir, 'AuthKey_TESTKEY.p8'), 'utf8').catch(() => null)).toBeNull()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('packages with publishing disabled, verifies the complete artifact set, and only then publishes', async () => {
    const workflow = await readWorkflow()
    const packageJob = workflow.jobs?.['package-macos-beta']
    const publishJob = workflow.jobs?.['publish-macos-beta']
    const packageRuns = steps(packageJob).map((step) => step.run ?? step.name ?? '')
    const publishRuns = steps(publishJob).map((step) => step.run ?? step.name ?? '')

    expect(
      stepNamed(packageJob, 'Package, Developer ID sign, and notarize artifacts without publishing')
        ?.run
    ).toContain('pnpm exec electron-builder --mac --publish never -c.forceCodeSigning=true')
    expect(packageRuns.indexOf('node scripts/verify-macos-release-artifacts.mjs')).toBeGreaterThan(
      packageRuns.findIndex((run) => run.includes('--publish never'))
    )
    expect(publishJob?.needs).toBe('package-macos-beta')
    expect(publishRuns).toContain('node scripts/verify-macos-release-artifacts.mjs')
    expect(publishRuns).toContain('node scripts/publish-macos-beta-release.mjs')
    expect(publishRuns.indexOf('node scripts/publish-macos-beta-release.mjs')).toBeGreaterThan(
      publishRuns.indexOf('node scripts/verify-macos-release-artifacts.mjs')
    )
  })

  it('does not invoke the GitHub publisher when artifact verification fails', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'spacezero-publish-gate-'))
    const binDir = join(tempDir, 'bin')
    const ghMarker = join(tempDir, 'gh-invoked')

    await import('node:fs/promises').then(({ mkdir }) => mkdir(binDir))
    await writeFile(
      join(binDir, 'gh'),
      `#!/usr/bin/env bash\ntouch ${JSON.stringify(ghMarker)}\nexit 0\n`,
      { mode: 0o700 }
    )

    const result = spawnSync('node', ['scripts/publish-macos-beta-release.mjs'], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        MACOS_RELEASE_ARTIFACT_DIR: tempDir,
        GITHUB_REF_NAME: 'v0.1.0-beta.1',
        GITHUB_SHA: '08b48da86f44c1d3a152a4a54e43c48eda008825'
      },
      encoding: 'utf8'
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('missing required macOS release artifact')
    expect(await readFile(ghMarker, 'utf8').catch(() => null)).toBeNull()
    await rm(tempDir, { recursive: true, force: true })
  })
})
