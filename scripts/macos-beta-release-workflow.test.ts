import { readFile } from 'node:fs/promises'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

interface WorkflowStep {
  name?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  if?: string
}

interface WorkflowJob {
  permissions?: Record<string, string>
  'runs-on'?: string
  env?: Record<string, string>
  steps?: WorkflowStep[]
}

interface Workflow {
  on?: {
    push?: {
      tags?: string[]
    }
  }
  permissions?: Record<string, string>
  jobs?: Record<string, WorkflowJob>
}

async function readWorkflow() {
  return parse(await readFile('.github/workflows/macos-beta-release.yml', 'utf8')) as Workflow
}

describe('public macOS beta release workflow', () => {
  it('runs only for beta version tags with least required release permissions', async () => {
    const workflow = await readWorkflow()

    expect(workflow.on?.push?.tags).toEqual(['v*-beta.*'])
    expect(workflow.permissions).toEqual({ contents: 'write' })
    expect(Object.keys(workflow.permissions ?? {})).toEqual(['contents'])
  })

  it('validates version, prepares public GitHub App config, and builds before publishing', async () => {
    const workflow = await readWorkflow()
    const job = workflow.jobs?.['release-macos-beta']
    const runs =
      job?.steps?.map((step) => step.run).filter((run): run is string => Boolean(run)) ?? []

    expect(job?.['runs-on']).toBe('macos-latest')
    expect(runs).toContain('pnpm install --frozen-lockfile')
    expect(runs).toContain('pnpm release:validate-tag')
    expect(runs).toContain('pnpm package:prepare-github')
    expect(runs).toContain('pnpm build')
    expect(runs).toContain(
      'pnpm exec electron-builder --mac --publish always -c.forceCodeSigning=true'
    )
  })

  it('uses the approved public variables and signing/notarization secrets without broad token permissions', async () => {
    const workflow = await readWorkflow()
    const job = workflow.jobs?.['release-macos-beta']

    expect(job?.env).toMatchObject({
      GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
      CSC_LINK: '${{ secrets.CSC_LINK }}',
      CSC_KEY_PASSWORD: '${{ secrets.CSC_KEY_PASSWORD }}',
      APPLE_API_KEY_ID: '${{ secrets.APPLE_API_KEY_ID }}',
      APPLE_API_KEY_P8: '${{ secrets.APPLE_API_KEY_P8 }}',
      APPLE_ISSUER: '${{ secrets.APPLE_ISSUER }}',
      SPACEZERO_GITHUB_CLIENT_ID: '${{ vars.SPACEZERO_GITHUB_CLIENT_ID }}',
      SPACEZERO_GITHUB_APP_SLUG: '${{ vars.SPACEZERO_GITHUB_APP_SLUG }}'
    })
    expect(workflow.permissions).not.toHaveProperty('actions')
    expect(workflow.permissions).not.toHaveProperty('id-token')
  })

  it('stores the App Store Connect key in a temporary file and removes it after packaging', async () => {
    const workflowText = await readFile('.github/workflows/macos-beta-release.yml', 'utf8')
    const workflow = parse(workflowText) as Workflow
    const steps = workflow.jobs?.['release-macos-beta']?.steps ?? []
    const writeKeyStep = steps.find(
      (step) => step.name === 'Write temporary App Store Connect API key'
    )
    const cleanupStep = steps.find(
      (step) => step.name === 'Remove temporary App Store Connect API key'
    )

    expect(writeKeyStep?.run).toContain('umask 077')
    expect(writeKeyStep?.run).toContain('"$RUNNER_TEMP/AuthKey_${APPLE_API_KEY_ID}.p8"')
    expect(writeKeyStep?.run).toContain('printf')
    expect(writeKeyStep?.run).toContain('APPLE_API_ISSUER')
    expect(cleanupStep?.if).toBe('always()')
    expect(cleanupStep?.run).toContain('rm -f "$APPLE_API_KEY"')
    expect(workflowText).not.toContain('APPLE_API_KEY_P8: |')
  })
})
