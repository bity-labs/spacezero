import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import { IPC_CHANNELS, type SpaceZeroAPI } from '../shared/ipc'

const api: SpaceZeroAPI = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.app.getInfo),
    ping: () => ipcRenderer.invoke(IPC_CHANNELS.app.ping)
  },
  db: {
    health: () => ipcRenderer.invoke(IPC_CHANNELS.db.health)
  },
  files: {
    listDirectory: (request) => ipcRenderer.invoke(IPC_CHANNELS.files.listDirectory, request),
    openDocument: (request) => ipcRenderer.invoke(IPC_CHANNELS.files.openDocument, request),
    saveDocument: (request) => ipcRenderer.invoke(IPC_CHANNELS.files.saveDocument, request)
  },
  git: {
    getProjectSessionReview: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.git.getProjectSessionReview, request)
  },
  knowledgeBase: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.getStatus),
    getCurrentSession: () => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.getCurrentSession),
    startNewChat: () => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.startNewChat),
    reset: () => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.reset),
    createNew: () => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.createNew),
    cloneFromGit: (request) => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.cloneFromGit, request),
    getTree: () => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.getTree),
    openDocument: (request) => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.openDocument, request),
    search: (request) => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.search, request),
    importImage: (request) => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.importImage, request),
    loadImage: (request) => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.loadImage, request),
    createItem: (request) => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.createItem, request),
    renameItem: (request) => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.renameItem, request),
    moveItem: (request) => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.moveItem, request),
    deleteItem: (request) => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.deleteItem, request),
    saveDocument: (request) => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.saveDocument, request),
    checkDocument: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.checkDocument, request),
    getSyncStatus: () => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.getSyncStatus),
    addRemote: (request) => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.addRemote, request),
    syncNow: () => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.syncNow),
    openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.openFolder),
    openRemote: () => ipcRenderer.invoke(IPC_CHANNELS.knowledgeBase.openRemote)
  },
  onboarding: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.onboarding.getStatus),
    complete: () => ipcRenderer.invoke(IPC_CHANNELS.onboarding.complete)
  },
  agents: {
    getGlobalDefinitions: () => ipcRenderer.invoke(IPC_CHANNELS.agents.getGlobalDefinitions),
    openDefinitionsFolder: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.agents.openDefinitionsFolder, request)
  },
  github: {
    getConnection: () => ipcRenderer.invoke(IPC_CHANNELS.github.getConnection),
    refreshConnection: () => ipcRenderer.invoke(IPC_CHANNELS.github.refreshConnection),
    startAuthorization: () => ipcRenderer.invoke(IPC_CHANNELS.github.startAuthorization),
    waitForAuthorization: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.waitForAuthorization, request),
    cancelAuthorization: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.cancelAuthorization, request),
    openAuthorization: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.openAuthorization, request),
    copyDeviceCode: (request) => ipcRenderer.invoke(IPC_CHANNELS.github.copyDeviceCode, request),
    openInstallation: () => ipcRenderer.invoke(IPC_CHANNELS.github.openInstallation),
    openManageAccess: () => ipcRenderer.invoke(IPC_CHANNELS.github.openManageAccess),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.github.disconnect),
    listAuthorizedRepositories: () =>
      ipcRenderer.invoke(IPC_CHANNELS.github.listAuthorizedRepositories),
    getProjectLinkOptions: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.getProjectLinkOptions, request),
    linkProjectRepository: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.linkProjectRepository, request),
    getProjectRepository: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.getProjectRepository, request),
    listRepositorySetupOptions: () =>
      ipcRenderer.invoke(IPC_CHANNELS.github.listRepositorySetupOptions),
    startClone: (request) => ipcRenderer.invoke(IPC_CHANNELS.github.startClone, request),
    cancelClone: (request) => ipcRenderer.invoke(IPC_CHANNELS.github.cancelClone, request),
    onCloneProgress: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload as Parameters<typeof listener>[0])
      }
      ipcRenderer.on(IPC_CHANNELS.github.cloneProgress, handler)
      return () => ipcRenderer.off(IPC_CHANNELS.github.cloneProgress, handler)
    },
    listIssues: (request) => ipcRenderer.invoke(IPC_CHANNELS.github.listIssues, request),
    getIssue: (request) => ipcRenderer.invoke(IPC_CHANNELS.github.getIssue, request),
    listIssueComments: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.listIssueComments, request),
    createIssueComment: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.createIssueComment, request),
    updateIssueState: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.updateIssueState, request),
    listPullRequests: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.listPullRequests, request),
    getPullRequest: (request) => ipcRenderer.invoke(IPC_CHANNELS.github.getPullRequest, request),
    listPullRequestComments: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.listPullRequestComments, request),
    listPullRequestCommits: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.listPullRequestCommits, request),
    listPullRequestFiles: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.listPullRequestFiles, request),
    listPullRequestCheckRuns: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.listPullRequestCheckRuns, request),
    listPullRequestCommitStatuses: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.listPullRequestCommitStatuses, request),
    listPullRequestReviews: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.listPullRequestReviews, request),
    createPullRequestComment: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.createPullRequestComment, request),
    createPullRequestReview: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.createPullRequestReview, request),
    startIssueSession: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.startIssueSession, request),
    startPullRequestSession: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.github.startPullRequestSession, request)
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projects.list),
    createEmpty: (request) => ipcRenderer.invoke(IPC_CHANNELS.projects.createEmpty, request),
    addFromFolder: () => ipcRenderer.invoke(IPC_CHANNELS.projects.addFromFolder),
    update: (request) => ipcRenderer.invoke(IPC_CHANNELS.projects.update, request),
    archive: (request) => ipcRenderer.invoke(IPC_CHANNELS.projects.archive, request),
    delete: (request) => ipcRenderer.invoke(IPC_CHANNELS.projects.delete, request)
  },
  sessions: {
    listProjectSessions: () => ipcRenderer.invoke(IPC_CHANNELS.sessions.listProjectSessions),
    listWorkspaceSessions: () => ipcRenderer.invoke(IPC_CHANNELS.sessions.listWorkspaceSessions),
    createProjectSession: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.sessions.createProjectSession, request),
    archive: (request) => ipcRenderer.invoke(IPC_CHANNELS.sessions.archive, request),
    delete: (request) => ipcRenderer.invoke(IPC_CHANNELS.sessions.delete, request)
  },
  terminal: {
    listTabs: (request) => ipcRenderer.invoke(IPC_CHANNELS.terminal.listTabs, request),
    create: (request) => ipcRenderer.invoke(IPC_CHANNELS.terminal.create, request),
    selectTab: (request) => ipcRenderer.invoke(IPC_CHANNELS.terminal.selectTab, request),
    reorderTabs: (request) => ipcRenderer.invoke(IPC_CHANNELS.terminal.reorderTabs, request),
    subscribe: (request) => ipcRenderer.invoke(IPC_CHANNELS.terminal.subscribe, request),
    unsubscribe: (request) => ipcRenderer.invoke(IPC_CHANNELS.terminal.unsubscribe, request),
    writeInput: (request) => ipcRenderer.invoke(IPC_CHANNELS.terminal.writeInput, request),
    resize: (request) => ipcRenderer.invoke(IPC_CHANNELS.terminal.resize, request),
    close: (request) => ipcRenderer.invoke(IPC_CHANNELS.terminal.close, request),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload as Parameters<typeof listener>[0])
      }
      ipcRenderer.on(IPC_CHANNELS.terminal.event, handler)
      return () => ipcRenderer.off(IPC_CHANNELS.terminal.event, handler)
    }
  },
  browser: {
    getState: (request) => ipcRenderer.invoke(IPC_CHANNELS.browser.getState, request),
    navigate: (request) => ipcRenderer.invoke(IPC_CHANNELS.browser.navigate, request),
    goBack: (request) => ipcRenderer.invoke(IPC_CHANNELS.browser.goBack, request),
    goForward: (request) => ipcRenderer.invoke(IPC_CHANNELS.browser.goForward, request),
    reload: (request) => ipcRenderer.invoke(IPC_CHANNELS.browser.reload, request),
    stop: (request) => ipcRenderer.invoke(IPC_CHANNELS.browser.stop, request),
    openInDefaultBrowser: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.browser.openInDefaultBrowser, request),
    openUrlInDefaultBrowser: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.browser.openUrlInDefaultBrowser, request),
    show: (request) => ipcRenderer.invoke(IPC_CHANNELS.browser.show, request),
    hide: (request) => ipcRenderer.invoke(IPC_CHANNELS.browser.hide, request),
    createTab: (request) => ipcRenderer.invoke(IPC_CHANNELS.browser.createTab, request),
    selectTab: (request) => ipcRenderer.invoke(IPC_CHANNELS.browser.selectTab, request),
    closeTab: (request) => ipcRenderer.invoke(IPC_CHANNELS.browser.closeTab, request),
    reorderTabs: (request) => ipcRenderer.invoke(IPC_CHANNELS.browser.reorderTabs, request),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload as Parameters<typeof listener>[0])
      }
      ipcRenderer.on(IPC_CHANNELS.browser.event, handler)
      return () => ipcRenderer.off(IPC_CHANNELS.browser.event, handler)
    }
  },
  agent: {
    ping: () => ipcRenderer.invoke(IPC_CHANNELS.agent.ping),
    createSession: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.createSession, request),
    createWorkspaceSession: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.agent.createWorkspaceSession, request),
    applyDefinitionToFreshSession: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.agent.applyDefinitionToFreshSession, request),
    getGlobalSkills: () => ipcRenderer.invoke(IPC_CHANNELS.agent.getGlobalSkills),
    setGlobalSkillEnabled: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.agent.setGlobalSkillEnabled, request),
    getState: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.getState, request),
    listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.agent.listSessions),
    prompt: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.prompt, request),
    abort: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.abort, request),
    onEvent: (handler) => {
      const listener = (_event: IpcRendererEvent, payload: unknown): void => {
        handler(payload as Parameters<typeof handler>[0])
      }
      ipcRenderer.on(IPC_CHANNELS.agent.event, listener)
      return () => ipcRenderer.off(IPC_CHANNELS.agent.event, listener)
    },
    onSessionProjectionEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload as Parameters<typeof listener>[0])
      }
      ipcRenderer.on(IPC_CHANNELS.agent.sessionProjectionEvent, handler)
      return () => ipcRenderer.off(IPC_CHANNELS.agent.sessionProjectionEvent, handler)
    },
    onToolExecution: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload as Parameters<typeof listener>[0])
      }
      ipcRenderer.on(IPC_CHANNELS.agent.toolExecution, handler)
      return () => ipcRenderer.off(IPC_CHANNELS.agent.toolExecution, handler)
    },
    onToolConfirmationRequest: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload as Parameters<typeof listener>[0])
      }
      ipcRenderer.on(IPC_CHANNELS.agent.toolConfirmationRequest, handler)
      return () => ipcRenderer.off(IPC_CHANNELS.agent.toolConfirmationRequest, handler)
    },
    resolveToolConfirmation: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.agent.resolveToolConfirmation, request),
    getModelAuthSettings: () => ipcRenderer.invoke(IPC_CHANNELS.agent.getModelAuthSettings),
    getAuthStatus: () => ipcRenderer.invoke(IPC_CHANNELS.agent.getAuthStatus),
    getAvailableModels: () => ipcRenderer.invoke(IPC_CHANNELS.agent.getAvailableModels),
    setModel: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.setModel, request),
    setThinkingLevel: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.setThinkingLevel, request),
    addApiKey: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.addApiKey, request),
    removeApiKey: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.removeApiKey, request),
    testAuth: (request) => ipcRenderer.invoke(IPC_CHANNELS.agent.testAuth, request),
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
    getStorageSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getStorageSettings),
    chooseSpaceZeroHome: () => ipcRenderer.invoke(IPC_CHANNELS.settings.chooseSpaceZeroHome),
    getModelDefaults: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getModelDefaults),
    updateModelDefaults: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.updateModelDefaults, request),
    getChatLinkSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getChatLinkSettings),
    updateChatLinkSettings: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.updateChatLinkSettings, request),
    getTerminalSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getTerminalSettings),
    updateTerminalSettings: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.updateTerminalSettings, request)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('spacezero', api)
} else {
  // This branch should not be used in production; context isolation is enabled in main/index.ts.
  ;(window as Window & typeof globalThis & { spacezero: SpaceZeroAPI }).spacezero = api
}
