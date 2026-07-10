import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS, type SpaceZeroAPI } from '../shared/ipc'

const api: SpaceZeroAPI = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.app.getInfo),
    ping: () => ipcRenderer.invoke(IPC_CHANNELS.app.ping)
  },
  db: {
    health: () => ipcRenderer.invoke(IPC_CHANNELS.db.health)
  },
  settings: {
    getLanguageSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getLanguageSettings),
    updateLanguagePreference: (preference) => ipcRenderer.invoke(IPC_CHANNELS.settings.updateLanguagePreference, preference),
    getThemeSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getThemeSettings),
    updateThemePreference: (preference) => ipcRenderer.invoke(IPC_CHANNELS.settings.updateThemePreference, preference)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('spacezero', api)
} else {
  // This branch should not be used in production; context isolation is enabled in main/index.ts.
  ;(window as Window & typeof globalThis & { spacezero: SpaceZeroAPI }).spacezero = api
}
