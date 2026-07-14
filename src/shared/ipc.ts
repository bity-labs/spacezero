import type {
  AgentSessionProjectionEvent,
  ResolveAgentToolConfirmationRequest
} from './agent-session-projection.model'
import type { AgentPingResponse, AgentSessionState, AgentUtilityEvent } from './agent-protocol'
import type { AgentToolExecutionEvent } from './workspace-tool-protocol'
import type { LanguagePreference, LanguageSettings } from './i18n'
import type { AddApiKeyRequest, AuthTestResult, ModelAuthSettings, ProviderRequest } from './model-auth'
import type { AvailableModel, ModelDefaults, UpdateModelDefaultsRequest } from './model-settings'
import type {
  CreateEmptyProjectRequest,
  Project,
  UpdateProjectRequest
} from '../features/projects/shared/project.model'
import type {
  CreateProjectSessionRequest,
  ProjectSession
} from '../features/sessions/shared/session.model'
import type { ThemePreference, ThemeSettings } from './theme'

export const IPC_CHANNELS = {
  app: {
    getInfo: 'app:getInfo',
    ping: 'app:ping'
  },
  db: {
    health: 'db:health'
  },
  projects: {
    list: 'projects:list',
    createEmpty: 'projects:createEmpty',
    addFromFolder: 'projects:addFromFolder',
    update: 'projects:update'
  },
  sessions: {
    listProjectSessions: 'sessions:listProjectSessions',
    createProjectSession: 'sessions:createProjectSession'
  },
  agent: {
    ping: 'agent:ping',
    createSession: 'agent:createSession',
    getState: 'agent:getState',
    listSessions: 'agent:listSessions',
    prompt: 'agent:prompt',
    abort: 'agent:abort',
    event: 'agent:event',
    sessionProjectionEvent: 'agent:sessionProjectionEvent',
    toolExecution: 'agent:toolExecution',
    resolveToolConfirmation: 'agent:resolveToolConfirmation',
    getModelAuthSettings: 'agent:getModelAuthSettings',
    getAuthStatus: 'agent:getAuthStatus',
    getAvailableModels: 'agent:getAvailableModels',
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
  projects: {
    list: () => Promise<Project[]>
    createEmpty: (request: CreateEmptyProjectRequest) => Promise<Project>
    addFromFolder: () => Promise<Project | null>
    update: (request: UpdateProjectRequest) => Promise<Project>
  }
  sessions: {
    listProjectSessions: () => Promise<ProjectSession[]>
    createProjectSession: (request: CreateProjectSessionRequest) => Promise<ProjectSession>
  }
  agent: {
    ping: () => Promise<AgentPingResponse>
    createSession: (request: { projectId: string; cwd: string }) => Promise<AgentSessionState>
    getState: (request: { sessionId: string }) => Promise<AgentSessionState>
    listSessions: () => Promise<AgentSessionState[]>
    prompt: (request: { sessionId: string; message: string }) => Promise<void>
    abort: (request: { sessionId: string }) => Promise<void>
    onEvent: (handler: (event: AgentUtilityEvent) => void) => () => void
    onSessionProjectionEvent: (listener: (event: AgentSessionProjectionEvent) => void) => () => void
    onToolExecution: (listener: (event: AgentToolExecutionEvent) => void) => () => void
    resolveToolConfirmation: (request: ResolveAgentToolConfirmationRequest) => Promise<void>
    getModelAuthSettings: () => Promise<ModelAuthSettings>
    getAuthStatus: () => Promise<ModelAuthSettings>
    getAvailableModels: () => Promise<AvailableModel[]>
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
    getModelDefaults: () => Promise<ModelDefaults>
    updateModelDefaults: (request: UpdateModelDefaultsRequest) => Promise<ModelDefaults>
  }
}
