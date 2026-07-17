import type {
  AgentSessionProjectionEvent,
  AgentToolConfirmationRequest,
  ResolveAgentToolConfirmationRequest
} from './agent-session-projection.model'
import type { AgentPingResponse, AgentSessionState, AgentUtilityEvent } from './agent-protocol'
import type { AgentToolExecutionEvent } from './workspace-tool-protocol'
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
import type {
  CreateEmptyProjectRequest,
  Project,
  UpdateProjectRequest
} from '../features/projects/shared/project.model'
import type {
  GitHubConnection,
  GitHubDeviceAuthorization,
  GitHubFlowRequest,
  GitHubRepository
} from '../features/github/shared/github.model'
import type {
  CreateProjectSessionRequest,
  ProjectSession,
  WorkspaceSession
} from '../features/sessions/shared/session.model'
import type { ThemePreference, ThemeSettings } from './theme'
import type { StorageSettings } from './storage-settings'
import type {
  AgentGlobalSkill,
  SetGlobalAgentSkillEnabledRequest
} from '../features/agent-workspace/shared/agent-skill.model'

export const IPC_CHANNELS = {
  app: {
    getInfo: 'app:getInfo',
    ping: 'app:ping'
  },
  db: {
    health: 'db:health'
  },
  knowledgeBase: KNOWLEDGE_BASE_IPC_CHANNELS,
  github: {
    getConnection: 'github:getConnection',
    startAuthorization: 'github:startAuthorization',
    waitForAuthorization: 'github:waitForAuthorization',
    cancelAuthorization: 'github:cancelAuthorization',
    openAuthorization: 'github:openAuthorization',
    copyDeviceCode: 'github:copyDeviceCode',
    openInstallation: 'github:openInstallation',
    listAuthorizedRepositories: 'github:listAuthorizedRepositories'
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
  agent: {
    ping: 'agent:ping',
    createSession: 'agent:createSession',
    createWorkspaceSession: 'agent:createWorkspaceSession',
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
  settings: {
    getLanguageSettings: 'settings:getLanguageSettings',
    updateLanguagePreference: 'settings:updateLanguagePreference',
    getThemeSettings: 'settings:getThemeSettings',
    updateThemePreference: 'settings:updateThemePreference',
    getStorageSettings: 'settings:getStorageSettings',
    chooseSpaceZeroHome: 'settings:chooseSpaceZeroHome',
    getModelDefaults: 'settings:getModelDefaults',
    updateModelDefaults: 'settings:updateModelDefaults'
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
  knowledgeBase: KnowledgeBaseAPI
  github: {
    getConnection: () => Promise<GitHubConnection>
    startAuthorization: () => Promise<GitHubDeviceAuthorization>
    waitForAuthorization: (request: GitHubFlowRequest) => Promise<GitHubConnection>
    cancelAuthorization: (request: GitHubFlowRequest) => Promise<void>
    openAuthorization: (request: GitHubFlowRequest) => Promise<void>
    copyDeviceCode: (request: GitHubFlowRequest) => Promise<void>
    openInstallation: () => Promise<void>
    listAuthorizedRepositories: () => Promise<GitHubRepository[]>
  }
  projects: {
    list: () => Promise<Project[]>
    createEmpty: (request: CreateEmptyProjectRequest) => Promise<Project>
    addFromFolder: () => Promise<Project | null>
    update: (request: UpdateProjectRequest) => Promise<Project>
    archive: (request: { projectId: string }) => Promise<void>
    delete: (request: { projectId: string }) => Promise<void>
  }
  sessions: {
    listProjectSessions: () => Promise<ProjectSession[]>
    listWorkspaceSessions: () => Promise<WorkspaceSession[]>
    createProjectSession: (request: CreateProjectSessionRequest) => Promise<ProjectSession>
    archive: (request: { sessionId: string }) => Promise<void>
    delete: (request: { sessionId: string }) => Promise<void>
  }
  agent: {
    ping: () => Promise<AgentPingResponse>
    createSession: (request: { projectId: string; cwd: string }) => Promise<AgentSessionState>
    createWorkspaceSession: () => Promise<WorkspaceSession>
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
  settings: {
    getLanguageSettings: () => Promise<LanguageSettings>
    updateLanguagePreference: (preference: LanguagePreference) => Promise<LanguageSettings>
    getThemeSettings: () => Promise<ThemeSettings>
    updateThemePreference: (preference: ThemePreference) => Promise<ThemeSettings>
    getStorageSettings: () => Promise<StorageSettings>
    chooseSpaceZeroHome: () => Promise<StorageSettings | null>
    getModelDefaults: () => Promise<ModelDefaults>
    updateModelDefaults: (request: UpdateModelDefaultsRequest) => Promise<ModelDefaults>
  }
}
