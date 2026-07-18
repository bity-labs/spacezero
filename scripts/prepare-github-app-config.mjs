import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const outputPath = resolve(process.cwd(), 'resources/github-app.json')
const environmentConfig = {
  clientId: process.env.SPACEZERO_GITHUB_CLIENT_ID?.trim(),
  appSlug: process.env.SPACEZERO_GITHUB_APP_SLUG?.trim()
}

let config = environmentConfig
if (!config.clientId && !config.appSlug) {
  try {
    config = JSON.parse(await readFile(outputPath, 'utf8'))
  } catch {
    // The validation below reports the release-owner action that is required.
  }
}

if (
  typeof config.clientId !== 'string' ||
  !config.clientId.trim() ||
  typeof config.appSlug !== 'string' ||
  !/^[A-Za-z0-9_-]+$/.test(config.appSlug.trim())
) {
  throw new Error(
    'Packaged builds require SPACEZERO_GITHUB_CLIENT_ID and a valid SPACEZERO_GITHUB_APP_SLUG (or an ignored resources/github-app.json).'
  )
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(
  outputPath,
  `${JSON.stringify(
    { clientId: config.clientId.trim(), appSlug: config.appSlug.trim() },
    null,
    2
  )}\n`,
  { mode: 0o600 }
)

process.stdout.write('Prepared public GitHub App configuration for packaging.\n')
