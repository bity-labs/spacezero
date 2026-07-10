import type { LanguagePreference, LanguageSettings } from './i18n'
import type { AddApiKeyRequest, ModelAuthSettings, ProviderRequest } from './model-auth'
import type { AvailableModel, ModelDefaults, UpdateModelDefaultsRequest } from './model-settings'
import type { ThemePreference, ThemeSettings } from './theme'

export const IPC_CHANNELS = {
  app: {
    getInfo: 'app:getInfo',
    ping: 'app:ping'
  },
  db: {
    health: 'db:health'
  },
  agent: {
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
  agent: {
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
