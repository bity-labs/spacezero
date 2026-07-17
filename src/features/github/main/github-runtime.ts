import { app, clipboard, safeStorage, shell } from 'electron'
import { join } from 'node:path'

import { createGitHubAuthAdapter } from './github-auth.adapter'
import { createGitHubAuthService, type GitHubAuthService } from './github-auth.service'
import { loadGitHubAppConfig } from './github-config'
import { createProtectedGitHubCredentialStore } from './github-credential-store'

let authService: GitHubAuthService | undefined

export function getGitHubAuthService(): GitHubAuthService {
  if (authService) return authService

  const config = loadGitHubAppConfig({ appPath: app.getAppPath() })
  authService = createGitHubAuthService({
    clientId: config?.clientId,
    adapter: createGitHubAuthAdapter(),
    credentialStore: createProtectedGitHubCredentialStore({
      filePath: join(app.getPath('userData'), 'github-credentials.bin'),
      encryption: safeStorage
    }),
    openExternal: (url) => shell.openExternal(url),
    copyText: (text) => clipboard.writeText(text)
  })

  return authService
}
