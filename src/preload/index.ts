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
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projects.list),
    createEmpty: (request) => ipcRenderer.invoke(IPC_CHANNELS.projects.createEmpty, request),
    addFromFolder: () => ipcRenderer.invoke(IPC_CHANNELS.projects.addFromFolder),
    update: (request) => ipcRenderer.invoke(IPC_CHANNELS.projects.update, request)
  },
  agent: {
    getModelAuthSettings: () => ipcRenderer.invoke(IPC_CHANNELS.agent.getModelAuthSettings),
    getAvailableModels: () => ipcRenderer.invoke(IPC_CHANNELS.agent.getAvailableModels),
    addApiKey: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.addApiKey, request),
    removeApiKey: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.removeApiKey, request),
    loginOAuth: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.loginOAuth, request),
    logoutOAuth: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.logoutOAuth, request)
  },
  settings: {
    getLanguageSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getLanguageSettings),
    updateLanguagePreference: (preference) =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.updateLanguagePreference, preference),
    getThemeSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getThemeSettings),
    updateThemePreference: (preference) =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.updateThemePreference, preference),
    getModelDefaults: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getModelDefaults),
    updateModelDefaults: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.updateModelDefaults, request)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('spacezero', api)
} else {
  // This branch should not be used in production; context isolation is enabled in main/index.ts.
  ;(window as Window & typeof globalThis & { spacezero: SpaceZeroAPI }).spacezero = api
}
