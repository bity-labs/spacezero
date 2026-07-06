import type { LanguagePreference, LanguageSettings } from './i18n'

export const IPC_CHANNELS = {
  app: {
    getInfo: 'app:getInfo',
    ping: 'app:ping'
  },
  db: {
    health: 'db:health'
  },
  settings: {
    getLanguageSettings: 'settings:getLanguageSettings',
    updateLanguagePreference: 'settings:updateLanguagePreference'
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
  settings: {
    getLanguageSettings: () => Promise<LanguageSettings>
    updateLanguagePreference: (preference: LanguagePreference) => Promise<LanguageSettings>
  }
}
