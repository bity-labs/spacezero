export const IPC_CHANNELS = {
  app: {
    getInfo: 'app:getInfo',
    ping: 'app:ping'
  },
  db: {
    health: 'db:health'
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
}
