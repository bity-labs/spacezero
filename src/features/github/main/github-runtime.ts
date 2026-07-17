import { app, clipboard, safeStorage, shell } from 'electron'
import { join } from 'node:path'

import { createGitHubAuthAdapter } from './github-auth.adapter'
import { createGitHubAuthService, type GitHubAuthService } from './github-auth.service'
import { createGitHubConnectionService } from './github-connection.service'
import { loadGitHubAppConfig } from './github-config'
import { createProtectedGitHubCredentialStore } from './github-credential-store'
import { createGitHubInstallationsAdapter } from './github-installations.adapter'

let authService: GitHubAuthService | undefined
let connectionService: ReturnType<typeof createGitHubConnectionService> | undefined

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

export function getGitHubConnectionService(): ReturnType<typeof createGitHubConnectionService> {
  if (connectionService) return connectionService

  const config = loadGitHubAppConfig({ appPath: app.getAppPath() })
  connectionService = createGitHubConnectionService({
    auth: getGitHubAuthService(),
    adapter: createGitHubInstallationsAdapter(),
    appSlug: config?.appSlug,
    openExternal: (url) => shell.openExternal(url)
  })
  return connectionService
}
