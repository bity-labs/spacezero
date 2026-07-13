import type { AgentPingResponse, AgentSessionState, AgentUtilityEvent } from './agent-protocol'
import type { AgentToolExecutionEvent } from './workspace-tool-protocol'
import type { LanguagePreference, LanguageSettings } from './i18n'
import type { AddApiKeyRequest, ModelAuthSettings, ProviderRequest } from './model-auth'
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
    event: 'agent:event',
    toolExecution: 'agent:toolExecution',
    getModelAuthSettings: 'agent:getModelAuthSettings',
    getAvailableModels: 'agent:getAvailableModels',
    addApiKey: 'agent:addApiKey',
    removeApiKey: 'agent:removeApiKey',
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
    onEvent: (handler: (event: AgentUtilityEvent) => void) => () => void
    onToolExecution: (listener: (event: AgentToolExecutionEvent) => void) => () => void
    getModelAuthSettings: () => Promise<ModelAuthSettings>
    getAvailableModels: () => Promise<AvailableModel[]>
    addApiKey: (request: AddApiKeyRequest) => Promise<void>
    removeApiKey: (request: ProviderRequest) => Promise<void>
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
