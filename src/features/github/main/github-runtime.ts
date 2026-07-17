import { app, clipboard, safeStorage, shell } from 'electron'
import { join } from 'node:path'

import { createProjectPathAdapter } from '../../projects/main/project-path.adapter'
import { getSpaceZeroProjectsPath } from '../../settings/main/storage-settings.service'
import { createProjectsRepository } from '../../projects/main/projects.repository'
import { createProjectsService } from '../../projects/main/projects.service'
import { createGitHubAuthAdapter } from './github-auth.adapter'
import { createGitHubAuthService, type GitHubAuthService } from './github-auth.service'
import { createGitHubCloneAdapter } from './github-clone.adapter'
import { createGitHubConnectionService } from './github-connection.service'
import { loadGitHubAppConfig } from './github-config'
import { createProtectedGitHubCredentialStore } from './github-credential-store'
import { createGitHubRemoteAdapter } from './github-git.adapter'
import { createGitHubInstallationsAdapter } from './github-installations.adapter'
import { createGitHubProjectsService } from './github-projects.service'
import { createGitHubRepositorySetupService } from './github-repository-setup.service'

let authService: GitHubAuthService | undefined
let connectionService: ReturnType<typeof createGitHubConnectionService> | undefined
let projectsService: ReturnType<typeof createGitHubProjectsService> | undefined
let repositorySetupService: ReturnType<typeof createGitHubRepositorySetupService> | undefined

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

export function getGitHubProjectsService(): ReturnType<typeof createGitHubProjectsService> {
  if (projectsService) return projectsService

  projectsService = createGitHubProjectsService({
    projects: createProjectsService({
      repository: createProjectsRepository(),
      pathAdapter: createProjectPathAdapter()
    }),
    repositories: getGitHubConnectionService(),
    git: createGitHubRemoteAdapter()
  })
  return projectsService
}

export function getGitHubRepositorySetupService(): ReturnType<
  typeof createGitHubRepositorySetupService
> {
  if (repositorySetupService) return repositorySetupService

  repositorySetupService = createGitHubRepositorySetupService({
    repositories: getGitHubConnectionService(),
    auth: getGitHubAuthService(),
    projects: createProjectsService({
      repository: createProjectsRepository(),
      pathAdapter: createProjectPathAdapter()
    }),
    clone: createGitHubCloneAdapter(),
    getProjectsPath: getSpaceZeroProjectsPath
  })
  return repositorySetupService
}
