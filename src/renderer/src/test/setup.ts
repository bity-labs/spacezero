import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

import { i18n } from '../i18n'
import { resetSessionWorkspaceStore } from '../../../features/sessions/renderer'
import { resetUiLayoutStore } from '../stores/ui-layout-store'

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = TestResizeObserver
Element.prototype.scrollIntoView = vi.fn()

let prefersDark = false
const mediaListeners = new Set<() => void>()

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return query === '(prefers-color-scheme: dark)' ? prefersDark : false
    },
    media: query,
    onchange: null,
    addEventListener: (_event: 'change', listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_event: 'change', listener: () => void) =>
      mediaListeners.delete(listener),
    addListener: (listener: () => void) => mediaListeners.add(listener),
    removeListener: (listener: () => void) => mediaListeners.delete(listener),
    dispatchEvent: vi.fn()
  }))
})

window.setTestPrefersDark = (matches: boolean): void => {
  prefersDark = matches
  mediaListeners.forEach((listener) => listener())
}

beforeEach(async () => {
  window.scrollTo = vi.fn()
  prefersDark = false
  mediaListeners.clear()
  window.localStorage.clear()
  resetUiLayoutStore()
  resetSessionWorkspaceStore()
  window.location.hash = ''
  await i18n.changeLanguage('en')

  window.spacezero = {
    app: {
      getInfo: async () => ({ name: 'Space Zero', version: '0.0.0-test', platform: 'darwin' }),
      ping: async () => 'pong'
    },
    db: {
      health: async () => ({ ok: true, path: '/tmp/spacezero-test.sqlite3', projectCount: 0 })
    },
    projects: {
      list: async () => [],
      createEmpty: async ({ name }) => ({
        id: 'project-test',
        name,
        path: `/tmp/${name}`,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      addFromFolder: async () => ({
        id: 'folder-project-test',
        name: 'Existing Folder',
        path: '/tmp/existing-folder',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      update: async (request) => ({
        id: request.id,
        name: request.name,
        path: request.path,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(1).toISOString()
      }),
      archive: async () => undefined,
      delete: async () => undefined
    },
    sessions: {
      listProjectSessions: async () => [],
      listWorkspaceSessions: async () => [],
      createProjectSession: async ({ projectId, title }) => ({
        id: 'session-test',
        kind: 'project',
        projectId,
        title: title ?? 'Session 1',
        status: 'idle',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      archive: async () => undefined,
      delete: async () => undefined
    },
    agent: {
      ping: async () => ({
        sessionId: 'agent-ping',
        message: 'pong-from-agent-utility',
        utilityProcessId: 1234
      }),
      createSession: async ({ projectId, cwd }) => ({
        sessionId: 'agent-session-test',
        kind: 'project',
        projectId,
        cwd,
        status: 'idle',
        live: true,
        transcriptPath: '/tmp/agent-session-test.jsonl',
        modelProvider: 'faux',
        modelId: 'faux-1'
      }),
      createWorkspaceSession: async () => ({
        id: 'workspace-session-test',
        kind: 'workspace',
        title: 'Workspace Session 1',
        status: 'idle',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      getState: async ({ sessionId }) => ({
        sessionId,
        kind: sessionId.startsWith('workspace') ? 'workspace' : 'project',
        projectId: sessionId.startsWith('workspace') ? null : 'project-test',
        cwd: '/tmp/project-test',
        status: 'idle',
        live: true,
        transcriptPath: '/tmp/agent-session-test.jsonl',
        modelProvider: 'faux',
        modelId: 'faux-1'
      }),
      listSessions: async () => [],
      prompt: async () => undefined,
      abort: async () => undefined,
      onEvent: () => () => undefined,
      onSessionProjectionEvent: () => () => undefined,
      onToolExecution: () => () => undefined,
      onToolConfirmationRequest: () => () => undefined,
      resolveToolConfirmation: async () => undefined,
      getModelAuthSettings: async () => ({
        subscriptions: {
          connected: [],
          availableProviders: [
            { providerId: 'chatgpt', label: 'ChatGPT Plus/Pro' },
            { providerId: 'claude', label: 'Claude Pro/Max' }
          ]
        },
        apiKeys: {
          configured: [],
          availableProviders: [
            { providerId: 'anthropic', label: 'Anthropic' },
            { providerId: 'openai', label: 'OpenAI' }
          ]
        }
      }),
      getAuthStatus: async () => ({
        subscriptions: { connected: [], availableProviders: [] },
        apiKeys: { configured: [], availableProviders: [{ providerId: 'anthropic', label: 'Anthropic' }] }
      }),
      getAvailableModels: async () => [],
      setModel: async ({ sessionId }) => ({
        sessionId,
        projectId: 'project-test',
        cwd: '/tmp/project-test',
        status: 'idle',
        live: true,
        transcriptPath: '/tmp/agent-session-test.jsonl',
        modelProvider: 'faux',
        modelId: 'faux-1',
        thinkingLevel: 'medium'
      }),
      setThinkingLevel: async ({ sessionId, level }) => ({
        sessionId,
        projectId: 'project-test',
        cwd: '/tmp/project-test',
        status: 'idle',
        live: true,
        transcriptPath: '/tmp/agent-session-test.jsonl',
        modelProvider: 'faux',
        modelId: 'faux-1',
        thinkingLevel: level
      }),
      addApiKey: async () => undefined,
      removeApiKey: async () => undefined,
      testAuth: async () => ({ ok: true }),
      loginOAuth: async () => undefined,
      logoutOAuth: async () => undefined
    },
    settings: {
      getLanguageSettings: async () => ({
        preference: 'system',
        resolvedLanguage: 'en',
        systemLanguage: 'en-US'
      }),
      updateLanguagePreference: async (preference) => ({
        preference,
        resolvedLanguage: preference === 'system' ? 'en' : preference,
        systemLanguage: 'en-US'
      }),
      getThemeSettings: async () => ({
        preference: 'system',
        resolvedTheme: prefersDark ? 'dark' : 'light'
      }),
      updateThemePreference: async (preference) => ({
        preference,
        resolvedTheme: preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference
      }),
      getStorageSettings: async () => ({
        spaceZeroHome: '/tmp/SpaceZero',
        projectsPath: '/tmp/SpaceZero/projects'
      }),
      chooseSpaceZeroHome: async () => ({
        spaceZeroHome: '/tmp/SpaceZero',
        projectsPath: '/tmp/SpaceZero/projects'
      }),
      getModelDefaults: async () => ({ defaultThinking: 'medium' }),
      updateModelDefaults: async (request) => ({
        defaultThinking: request.defaultThinking ?? 'medium',
        defaultModel: request.defaultModel
      })
    }
  }
})
