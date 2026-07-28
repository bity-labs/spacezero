import type {
  AgentSessionProjectionEvent,
  AgentToolConfirmationRequest,
  ResolveAgentToolConfirmationRequest
} from './agent-session-projection.model'
import type {
  AgentDefinitionReference,
  AgentPingResponse,
  AgentSessionState,
  AgentUtilityEvent,
  ApplyAgentDefinitionToFreshSessionRequest
} from './agent-protocol'
import type { AgentToolExecutionEvent } from './workspace-tool-protocol'
import type { ChatLinkSettings, UpdateChatLinkSettingsRequest } from './chat-link-settings'
import type { GitActionSettings, UpdateGitActionSettingsRequest } from './git-action-settings'
import type { LanguagePreference, LanguageSettings } from './i18n'
import type {
  AddApiKeyRequest,
  AuthTestResult,
  ModelAuthSettings,
  ProviderRequest
} from './model-auth'
import type {
  AvailableModel,
  ModelDefaults,
  SetAgentModelRequest,
  SetAgentThinkingLevelRequest,
  UpdateModelDefaultsRequest
} from './model-settings'
import {
  KNOWLEDGE_BASE_IPC_CHANNELS,
  type KnowledgeBaseAPI
} from '../features/knowledge-base/shared/knowledge-base.contract'
import type { LicenseActivationAPI } from '../features/license-activation/shared'
import { FILES_IPC_CHANNELS, type FilesAPI } from '../features/files/shared/files.contract'
import { GIT_IPC_CHANNELS, type GitAPI } from '../features/git/shared/git.contract'
import type { OnboardingStatus } from '../features/onboarding/shared/onboarding.model'
import type {
  AddProjectFromFolderRequest,
  CreateEmptyProjectRequest,
  DeleteProjectResult,
  Project,
  UpdateProjectRequest
} from '../features/projects/shared/project.model'
import type {
  CancelGitHubCloneRequest,
  GitHubCheckRun,
  GitHubCloneProgress,
  GitHubCommitStatus,
  GitHubConnection,
  GitHubDeviceAuthorization,
  GitHubFlowRequest,
  GitHubIssue,
  GitHubIssueComment,
  GitHubIssueCommentCreateRequest,
  GitHubIssueCommentsRequest,
  GitHubIssueListRequest,
  GitHubIssueRequest,
  GitHubIssueStateUpdateRequest,
  GitHubPage,
  GitHubProjectLinkOptions,
  GitHubProjectRequest,
  GitHubPullRequest,
  GitHubPullRequestCommentCreateRequest,
  GitHubPullRequestCommentsRequest,
  GitHubPullRequestCommit,
  GitHubPullRequestFile,
  GitHubPullRequestListRequest,
  GitHubPullRequestPageRequest,
  GitHubPullRequestRequest,
  GitHubPullRequestReview,
  GitHubPullRequestReviewCreateRequest,
  GitHubPullRequestSummary,
  GitHubRepository,
  GitHubRepositorySetupOption,
  LinkGitHubProjectRequest,
  StartGitHubCloneRequest,
  StartGitHubCloneResult
} from '../features/github/shared/github.model'
import type {
  CreateProjectSessionRequest,
  ProjectSession,
  WorkspaceSession
} from '../features/sessions/shared/session.model'
import type { ThemePreference, ThemeSettings } from './theme'
import type { StorageSettings } from './storage-settings'
import type { TerminalSettings, UpdateTerminalSettingsRequest } from './terminal-settings'
import type {
  AgentGlobalSkill,
  SetGlobalAgentSkillEnabledRequest
} from '../features/agent-workspace/shared/agent-skill.model'
import type {
  AgentDefinitionCatalogEntry,
  OpenAgentDefinitionsFolderRequest
} from '../features/agents/shared'
import {
  TERMINAL_IPC_CHANNELS,
  type TerminalAPI
} from '../features/terminal/shared/terminal.contract'
import { BROWSER_IPC_CHANNELS, type BrowserAPI } from '../features/browser/shared/browser.contract'
import type { UpdateStatus } from '../features/updates/shared'

export const IPC_CHANNELS = {
  app: {
    getInfo: 'app:getInfo',
    ping: 'app:ping'
  },
  db: {
    health: 'db:health'
  },
  files: FILES_IPC_CHANNELS,
  git: GIT_IPC_CHANNELS,
  knowledgeBase: KNOWLEDGE_BASE_IPC_CHANNELS,
  licenseActivation: {
    getStatus: 'licenseActivation:getStatus',
    activate: 'licenseActivation:activate'
  },
  onboarding: {
    getStatus: 'onboarding:getStatus',
    complete: 'onboarding:complete'
  },
  github: {
    getConnection: 'github:getConnection',
    refreshConnection: 'github:refreshConnection',
    startAuthorization: 'github:startAuthorization',
    waitForAuthorization: 'github:waitForAuthorization',
    cancelAuthorization: 'github:cancelAuthorization',
    openAuthorization: 'github:openAuthorization',
    copyDeviceCode: 'github:copyDeviceCode',
    openInstallation: 'github:openInstallation',
    openManageAccess: 'github:openManageAccess',
    disconnect: 'github:disconnect',
    listAuthorizedRepositories: 'github:listAuthorizedRepositories',
    getProjectLinkOptions: 'github:getProjectLinkOptions',
    linkProjectRepository: 'github:linkProjectRepository',
    getProjectRepository: 'github:getProjectRepository',
    listRepositorySetupOptions: 'github:listRepositorySetupOptions',
    startClone: 'github:startClone',
    cancelClone: 'github:cancelClone',
    cloneProgress: 'github:cloneProgress',
    listIssues: 'github:listIssues',
    getIssue: 'github:getIssue',
    listIssueComments: 'github:listIssueComments',
    createIssueComment: 'github:createIssueComment',
    updateIssueState: 'github:updateIssueState',
    listPullRequests: 'github:listPullRequests',
    getPullRequest: 'github:getPullRequest',
    listPullRequestComments: 'github:listPullRequestComments',
    listPullRequestCommits: 'github:listPullRequestCommits',
    listPullRequestFiles: 'github:listPullRequestFiles',
    listPullRequestCheckRuns: 'github:listPullRequestCheckRuns',
    listPullRequestCommitStatuses: 'github:listPullRequestCommitStatuses',
    listPullRequestReviews: 'github:listPullRequestReviews',
    createPullRequestComment: 'github:createPullRequestComment',
    createPullRequestReview: 'github:createPullRequestReview',
    startIssueSession: 'github:startIssueSession',
    startPullRequestSession: 'github:startPullRequestSession'
  },
  projects: {
    list: 'projects:list',
    createEmpty: 'projects:createEmpty',
    addFromFolder: 'projects:addFromFolder',
    update: 'projects:update',
    archive: 'projects:archive',
    delete: 'projects:delete'
  },
  sessions: {
    listProjectSessions: 'sessions:listProjectSessions',
    listWorkspaceSessions: 'sessions:listWorkspaceSessions',
    createProjectSession: 'sessions:createProjectSession',
    archive: 'sessions:archive',
    delete: 'sessions:delete'
  },
  agents: {
    getGlobalDefinitions: 'agents:getGlobalDefinitions',
    getSessionDefinitions: 'agents:getSessionDefinitions',
    openDefinitionsFolder: 'agents:openDefinitionsFolder'
  },
  agent: {
    ping: 'agent:ping',
    createSession: 'agent:createSession',
    createWorkspaceSession: 'agent:createWorkspaceSession',
    applyDefinitionToFreshSession: 'agent:applyDefinitionToFreshSession',
    getGlobalSkills: 'agent:getGlobalSkills',
    setGlobalSkillEnabled: 'agent:setGlobalSkillEnabled',
    getState: 'agent:getState',
    listSessions: 'agent:listSessions',
    prompt: 'agent:prompt',
    abort: 'agent:abort',
    event: 'agent:event',
    sessionProjectionEvent: 'agent:sessionProjectionEvent',
    toolExecution: 'agent:toolExecution',
    toolConfirmationRequest: 'agent:toolConfirmationRequest',
    resolveToolConfirmation: 'agent:resolveToolConfirmation',
    getModelAuthSettings: 'agent:getModelAuthSettings',
    getAuthStatus: 'agent:getAuthStatus',
    getAvailableModels: 'agent:getAvailableModels',
    setModel: 'agent:setModel',
    setThinkingLevel: 'agent:setThinkingLevel',
    addApiKey: 'agent:addApiKey',
    removeApiKey: 'agent:removeApiKey',
    testAuth: 'agent:testAuth',
    loginOAuth: 'agent:loginOAuth',
    logoutOAuth: 'agent:logoutOAuth'
  },
  terminal: TERMINAL_IPC_CHANNELS,
  browser: BROWSER_IPC_CHANNELS,
  update: {
    getStatus: 'update:getStatus',
    checkForUpdates: 'update:checkForUpdates',
    statusChanged: 'update:statusChanged'
  },
  settings: {
    getLanguageSettings: 'settings:getLanguageSettings',
    updateLanguagePreference: 'settings:updateLanguagePreference',
    getThemeSettings: 'settings:getThemeSettings',
    updateThemePreference: 'settings:updateThemePreference',
    getStorageSettings: 'settings:getStorageSettings',
    chooseSpaceZeroHome: 'settings:chooseSpaceZeroHome',
    getModelDefaults: 'settings:getModelDefaults',
    updateModelDefaults: 'settings:updateModelDefaults',
    getChatLinkSettings: 'settings:getChatLinkSettings',
    updateChatLinkSettings: 'settings:updateChatLinkSettings',
    getGitActionSettings: 'settings:getGitActionSettings',
    updateGitActionSettings: 'settings:updateGitActionSettings',
    getTerminalSettings: 'settings:getTerminalSettings',
    updateTerminalSettings: 'settings:updateTerminalSettings'
  }
} as const

export type AppInfo = {
  name: string
  version: string
  platform: string
}

export type DbHealth = {
  ok: boolean
  path: string
  projectCount: number
}

export type SpaceZeroAPI = {
  app: {
    getInfo: () => Promise<AppInfo>
    ping: () => Promise<string>
  }
  db: {
    health: () => Promise<DbHealth>
  }
  files: FilesAPI
  git: GitAPI
  knowledgeBase: KnowledgeBaseAPI
  licenseActivation: LicenseActivationAPI
  onboarding: {
    getStatus: () => Promise<OnboardingStatus>
    complete: () => Promise<OnboardingStatus>
  }
  github: {
    getConnection: () => Promise<GitHubConnection>
    refreshConnection: () => Promise<GitHubConnection>
    startAuthorization: () => Promise<GitHubDeviceAuthorization>
    waitForAuthorization: (request: GitHubFlowRequest) => Promise<GitHubConnection>
    cancelAuthorization: (request: GitHubFlowRequest) => Promise<void>
    openAuthorization: (request: GitHubFlowRequest) => Promise<void>
    copyDeviceCode: (request: GitHubFlowRequest) => Promise<void>
    openInstallation: () => Promise<void>
    openManageAccess: () => Promise<void>
    disconnect: () => Promise<void>
    listAuthorizedRepositories: () => Promise<GitHubRepository[]>
    getProjectLinkOptions: (request: GitHubProjectRequest) => Promise<GitHubProjectLinkOptions>
    linkProjectRepository: (request: LinkGitHubProjectRequest) => Promise<Project>
    getProjectRepository: (request: GitHubProjectRequest) => Promise<GitHubRepository>
    listRepositorySetupOptions: () => Promise<GitHubRepositorySetupOption[]>
    startClone: (request: StartGitHubCloneRequest) => Promise<StartGitHubCloneResult>
    cancelClone: (request: CancelGitHubCloneRequest) => Promise<void>
    onCloneProgress: (listener: (event: GitHubCloneProgress) => void) => () => void
    listIssues: (request: GitHubIssueListRequest) => Promise<GitHubPage<GitHubIssue>>
    getIssue: (request: GitHubIssueRequest) => Promise<GitHubIssue>
    listIssueComments: (
      request: GitHubIssueCommentsRequest
    ) => Promise<GitHubPage<GitHubIssueComment>>
    createIssueComment: (request: GitHubIssueCommentCreateRequest) => Promise<GitHubIssueComment>
    updateIssueState: (request: GitHubIssueStateUpdateRequest) => Promise<GitHubIssue>
    listPullRequests: (
      request: GitHubPullRequestListRequest
    ) => Promise<GitHubPage<GitHubPullRequestSummary>>
    getPullRequest: (request: GitHubPullRequestRequest) => Promise<GitHubPullRequest>
    listPullRequestComments: (
      request: GitHubPullRequestCommentsRequest
    ) => Promise<GitHubPage<GitHubIssueComment>>
    listPullRequestCommits: (
      request: GitHubPullRequestPageRequest
    ) => Promise<GitHubPage<GitHubPullRequestCommit>>
    listPullRequestFiles: (
      request: GitHubPullRequestPageRequest
    ) => Promise<GitHubPage<GitHubPullRequestFile>>
    listPullRequestCheckRuns: (
      request: GitHubPullRequestPageRequest
    ) => Promise<GitHubPage<GitHubCheckRun>>
    listPullRequestCommitStatuses: (
      request: GitHubPullRequestPageRequest
    ) => Promise<GitHubPage<GitHubCommitStatus>>
    listPullRequestReviews: (
      request: GitHubPullRequestPageRequest
    ) => Promise<GitHubPage<GitHubPullRequestReview>>
    createPullRequestComment: (
      request: GitHubPullRequestCommentCreateRequest
    ) => Promise<GitHubIssueComment>
    createPullRequestReview: (
      request: GitHubPullRequestReviewCreateRequest
    ) => Promise<GitHubPullRequestReview>
    startIssueSession: (request: GitHubIssueRequest) => Promise<ProjectSession>
    startPullRequestSession: (request: GitHubPullRequestRequest) => Promise<ProjectSession>
  }
  projects: {
    list: () => Promise<Project[]>
    createEmpty: (request: CreateEmptyProjectRequest) => Promise<Project>
    addFromFolder: (request?: AddProjectFromFolderRequest) => Promise<Project | null>
    update: (request: UpdateProjectRequest) => Promise<Project>
    archive: (request: { projectId: string }) => Promise<void>
    delete: (request: { projectId: string }) => Promise<DeleteProjectResult>
  }
  sessions: {
    listProjectSessions: () => Promise<ProjectSession[]>
    listWorkspaceSessions: () => Promise<WorkspaceSession[]>
    createProjectSession: (request: CreateProjectSessionRequest) => Promise<ProjectSession>
    archive: (request: { sessionId: string }) => Promise<void>
    delete: (request: { sessionId: string }) => Promise<void>
  }
  agents: {
    getGlobalDefinitions: () => Promise<AgentDefinitionCatalogEntry[]>
    getSessionDefinitions: (request: { sessionId: string }) => Promise<AgentDefinitionCatalogEntry[]>
    openDefinitionsFolder: (request: OpenAgentDefinitionsFolderRequest) => Promise<void>
  }
  agent: {
    ping: () => Promise<AgentPingResponse>
    createSession: (request: {
      projectId: string
      cwd: string
      agentDefinition?: AgentDefinitionReference
    }) => Promise<AgentSessionState>
    createWorkspaceSession: (request?: {
      agentDefinition?: AgentDefinitionReference
    }) => Promise<WorkspaceSession>
    applyDefinitionToFreshSession: (
      request: ApplyAgentDefinitionToFreshSessionRequest
    ) => Promise<AgentSessionState>
    getGlobalSkills: () => Promise<AgentGlobalSkill[]>
    setGlobalSkillEnabled: (
      request: SetGlobalAgentSkillEnabledRequest
    ) => Promise<AgentGlobalSkill[]>
    getState: (request: { sessionId: string }) => Promise<AgentSessionState>
    listSessions: () => Promise<AgentSessionState[]>
    prompt: (request: { sessionId: string; message: string }) => Promise<void>
    abort: (request: { sessionId: string }) => Promise<void>
    onEvent: (handler: (event: AgentUtilityEvent) => void) => () => void
    onSessionProjectionEvent: (listener: (event: AgentSessionProjectionEvent) => void) => () => void
    onToolExecution: (listener: (event: AgentToolExecutionEvent) => void) => () => void
    onToolConfirmationRequest: (
      listener: (event: AgentToolConfirmationRequest) => void
    ) => () => void
    resolveToolConfirmation: (request: ResolveAgentToolConfirmationRequest) => Promise<void>
    getModelAuthSettings: () => Promise<ModelAuthSettings>
    getAuthStatus: () => Promise<ModelAuthSettings>
    getAvailableModels: () => Promise<AvailableModel[]>
    setModel: (request: SetAgentModelRequest) => Promise<AgentSessionState>
    setThinkingLevel: (request: SetAgentThinkingLevelRequest) => Promise<AgentSessionState>
    addApiKey: (request: AddApiKeyRequest) => Promise<void>
    removeApiKey: (request: ProviderRequest) => Promise<void>
    testAuth: (request: ProviderRequest) => Promise<AuthTestResult>
    loginOAuth: (request: ProviderRequest) => Promise<void>
    logoutOAuth: (request: ProviderRequest) => Promise<void>
  }
  terminal: TerminalAPI
  browser: BrowserAPI
  update: {
    getStatus: () => Promise<UpdateStatus>
    checkForUpdates: () => Promise<UpdateStatus>
    onStatusChange: (listener: (status: UpdateStatus) => void) => () => void
  }
  settings: {
    getLanguageSettings: () => Promise<LanguageSettings>
    updateLanguagePreference: (preference: LanguagePreference) => Promise<LanguageSettings>
    getThemeSettings: () => Promise<ThemeSettings>
    updateThemePreference: (preference: ThemePreference) => Promise<ThemeSettings>
    getStorageSettings: () => Promise<StorageSettings>
    chooseSpaceZeroHome: () => Promise<StorageSettings | null>
    getModelDefaults: () => Promise<ModelDefaults>
    updateModelDefaults: (request: UpdateModelDefaultsRequest) => Promise<ModelDefaults>
    getChatLinkSettings: () => Promise<ChatLinkSettings>
    updateChatLinkSettings: (request: UpdateChatLinkSettingsRequest) => Promise<ChatLinkSettings>
    getGitActionSettings: () => Promise<GitActionSettings>
    updateGitActionSettings: (request: UpdateGitActionSettingsRequest) => Promise<GitActionSettings>
    getTerminalSettings: () => Promise<TerminalSettings>
    updateTerminalSettings: (request: UpdateTerminalSettingsRequest) => Promise<TerminalSettings>
  }
}
