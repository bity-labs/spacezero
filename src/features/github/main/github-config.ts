import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

const githubAppConfigSchema = z.object({
  clientId: z.string().trim().min(1),
  appSlug: z.string().trim().min(1).optional()
})

export type GitHubAppConfig = z.infer<typeof githubAppConfigSchema>

export function loadGitHubAppConfig({
  environment = process.env,
  appPath,
  resourcesPath = process.resourcesPath
}: {
  environment?: NodeJS.ProcessEnv
  appPath: string
  resourcesPath?: string
}): GitHubAppConfig | undefined {
  const clientId = environment.SPACEZERO_GITHUB_CLIENT_ID?.trim()
  if (clientId) {
    return githubAppConfigSchema.parse({
      clientId,
      appSlug: environment.SPACEZERO_GITHUB_APP_SLUG?.trim() || undefined
    })
  }

  for (const path of [
    resourcesPath ? join(resourcesPath, 'github-app.json') : undefined,
    join(appPath, 'resources', 'github-app.json')
  ]) {
    if (!path) continue
    try {
      return githubAppConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    } catch {
      // Missing or invalid deployment config is represented as an unavailable integration.
    }
  }

  return undefined
}
