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
import { createGitHubIssuesAdapter } from './github-issues.adapter'
import { createGitHubIssuesService } from './github-issues.service'
import { createGitHubProjectsService } from './github-projects.service'
import { createGitHubPullRequestsAdapter } from './github-pull-requests.adapter'
import { createGitHubPullRequestsService } from './github-pull-requests.service'
import { createGitHubRepositorySetupService } from './github-repository-setup.service'
import { createGitHubSourceSessionsService } from './github-source-sessions.service'
import { createManagedProjectAgentSession } from '../../agent-workspace/main/agent-session-handler'
import { getDisabledGlobalSkillPaths } from '../../agent-workspace/main/agent-skill-settings.service'
import { resolveAgentSkillPaths } from '../../agent-workspace/main/agent-skill-paths'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import { getManagedWorktreeService } from '../../sessions/main/managed-worktree.runtime'
import { createSessionsRepository } from '../../sessions/main/sessions.repository'

let authService: GitHubAuthService | undefined
let connectionService: ReturnType<typeof createGitHubConnectionService> | undefined
let projectsService: ReturnType<typeof createGitHubProjectsService> | undefined
let repositorySetupService: ReturnType<typeof createGitHubRepositorySetupService> | undefined
let issuesService: ReturnType<typeof createGitHubIssuesService> | undefined
let pullRequestsService: ReturnType<typeof createGitHubPullRequestsService> | undefined
let sourceSessionsService: ReturnType<typeof createGitHubSourceSessionsService> | undefined

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

export function getGitHubIssuesService(): ReturnType<typeof createGitHubIssuesService> {
  if (issuesService) return issuesService
  issuesService = createGitHubIssuesService({
    projects: getGitHubProjectsService(),
    auth: getGitHubAuthService(),
    adapter: createGitHubIssuesAdapter()
  })
  return issuesService
}

export function getGitHubPullRequestsService(): ReturnType<typeof createGitHubPullRequestsService> {
  if (pullRequestsService) return pullRequestsService
  pullRequestsService = createGitHubPullRequestsService({
    projects: getGitHubProjectsService(),
    auth: getGitHubAuthService(),
    adapter: createGitHubPullRequestsAdapter()
  })
  return pullRequestsService
}

export function getGitHubSourceSessionsService(): ReturnType<
  typeof createGitHubSourceSessionsService
> {
  if (sourceSessionsService) return sourceSessionsService
  sourceSessionsService = createGitHubSourceSessionsService({
    projects: getGitHubProjectsService(),
    issues: getGitHubIssuesService(),
    createSession: (request) =>
      createManagedProjectAgentSession(request, {
        repository: createSessionsRepository(),
        utilityHost: getAgentUtilityProcessHost(),
        worktrees: getManagedWorktreeService(),
        readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
        resolveSkillPaths: resolveAgentSkillPaths
      })
  })
  return sourceSessionsService
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
