import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

import { i18n } from '../i18n'
import type {
  FilesEntry,
  FilesAPI,
  FilesTree,
  ListFilesTreeRequest
} from '../../../features/files/shared'
import { resetFilesStore } from '../../../features/files/renderer/files-store'
import { resetSessionWorkspaceStore } from '../../../features/sessions/renderer'
import { resetToolPaneStore } from '../../../features/tool-pane/renderer/tool-pane-store'
import { resetUiLayoutStore } from '../stores/ui-layout-store'

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = TestResizeObserver
Element.prototype.scrollIntoView = vi.fn()

const emptyDomRect = new DOMRect()
const emptyDomRectList = [] as unknown as DOMRectList

Object.defineProperties(Range.prototype, {
  getBoundingClientRect: { value: () => emptyDomRect },
  getClientRects: { value: () => emptyDomRectList }
})

let prefersDark = false
const mediaListeners = new Set<() => void>()

async function listTestFilesTree(request: ListFilesTreeRequest): Promise<FilesTree> {
  const listDirectory: FilesAPI['listDirectory'] = window.spacezero.files.listDirectory
  const visitedDirectories = new Set<string>()
  const visitedEntries = new Set<string>()
  const collect = async (relativePath: string): Promise<FilesEntry[]> => {
    if (visitedDirectories.has(relativePath)) return []
    visitedDirectories.add(relativePath)
    const entries = await listDirectory({ context: request.context, relativePath })
    const tree: FilesEntry[] = []
    for (const entry of entries) {
      if (!visitedEntries.has(entry.relativePath)) {
        visitedEntries.add(entry.relativePath)
        tree.push(entry)
      }
      if (entry.kind === 'directory') tree.push(...(await collect(entry.relativePath)))
    }
    return tree
  }
  const entries = await collect('')
  return {
    entries,
    presortedPaths: entries.map((entry) =>
      entry.kind === 'directory' ? `${entry.relativePath}/` : entry.relativePath
    )
  }
}

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
  resetFilesStore()
  resetSessionWorkspaceStore()
  resetToolPaneStore()
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
    files: {
      listTree: listTestFilesTree,
      listDirectory: async () => [],
      openDocument: async ({ relativePath }) => ({
        name: relativePath.split('/').at(-1) ?? relativePath,
        relativePath,
        contentKind: 'text',
        size: 0,
        modifiedAt: new Date(0).toISOString(),
        revision: 'test-revision',
        content: '',
        hasBom: false,
        lineEnding: 'lf'
      }),
      saveDocument: async ({ relativePath, content }) => ({
        status: 'saved',
        document: {
          name: relativePath.split('/').at(-1) ?? relativePath,
          relativePath,
          contentKind: 'text',
          size: content.length,
          modifiedAt: new Date(0).toISOString(),
          revision: 'saved-test-revision',
          content,
          hasBom: false,
          lineEnding: 'lf'
        }
      }),
      createEntry: async () => undefined,
      moveEntry: async () => undefined,
      trashEntry: async () => undefined,
      revealInSystemFileManager: async () => undefined,
      search: async () => [],
      cancelSearch: async () => undefined,
      observe: async ({ subscriptionId }) => ({ subscriptionId }),
      unobserve: async () => undefined,
      onObservationEvent: () => () => undefined
    },
    git: {
      getReview: async () => ({
        status: 'clean',
        branch: 'main',
        upstream: { kind: 'none' },
        files: []
      }),
      getProjectSessionReview: async () => ({
        status: 'clean',
        branch: 'main',
        upstream: { kind: 'none' },
        files: []
      }),
      observe: async () => ({ subscriptionId: 'git-observation-test' }),
      observeProjectSession: async () => ({ subscriptionId: 'git-observation-test' }),
      unobserveProjectSession: async () => undefined,
      onObservationEvent: () => () => undefined
    },
    knowledgeBase: {
      getStatus: async () => ({ setupState: 'unconfigured' }),
      getCurrentChatContext: async () => ({
        id: 'knowledge-base-chat-context-test',
        workspaceContext: { kind: 'knowledge-base', key: 'knowledge-base' },
        agentSession: {
          id: 'knowledge-base-session-test',
          kind: 'workspace',
          title: 'Knowledge Base Chat',
          status: 'idle',
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString()
        },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      listChatHistory: async () => [],
      resumeChatContext: async ({ chatContextId }) => ({
        id: chatContextId,
        workspaceContext: { kind: 'knowledge-base', key: 'knowledge-base' },
        agentSession: {
          id: 'knowledge-base-session-resumed',
          kind: 'workspace',
          title: 'Knowledge Base Chat',
          status: 'idle',
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString()
        },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      clearChat: async () => ({
        id: 'knowledge-base-chat-context-new',
        workspaceContext: { kind: 'knowledge-base', key: 'knowledge-base' },
        agentSession: {
          id: 'knowledge-base-session-new',
          kind: 'workspace',
          title: 'Knowledge Base Chat',
          status: 'idle',
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString()
        },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      reset: async () => ({ setupState: 'unconfigured' }),
      createNew: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      cloneFromGit: async () => ({
        setupState: 'configured',
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      }),
      importImage: async ({ fileName }) => ({
        assetRelativePath: `assets/img/${fileName}`,
        markdownPath: `../assets/img/${fileName}`,
        altText: fileName.replace(/\.[^.]+$/, '')
      }),
      loadImage: async () => ({ dataUrl: 'data:image/png;base64,' }),
      openFolder: async () => undefined
    },
    licenseActivation: {
      getStatus: async () => ({
        mode: 'development-bypass',
        state: 'active',
        canEnterWorkspace: true,
        message: 'Development build activation bypass is enabled.'
      }),
      activate: async () => ({
        mode: 'development-bypass',
        state: 'active',
        canEnterWorkspace: true,
        message: 'Development build activation bypass is enabled.'
      })
    },
    onboarding: {
      getStatus: async () => ({ completed: true }),
      complete: async () => ({ completed: true })
    },
    agents: {
      getGlobalDefinitions: async () => [],
      getSessionDefinitions: async () => [],
      openDefinitionsFolder: async () => undefined
    },
    github: {
      getConnection: async () => ({ status: 'disconnected' }),
      refreshConnection: async () => ({ status: 'disconnected' }),
      startAuthorization: async () => ({
        flowId: 'github-flow-test',
        userCode: 'TEST-CODE',
        verificationUri: 'https://github.com/login/device',
        expiresAt: new Date(Date.now() + 900_000).toISOString()
      }),
      waitForAuthorization: async () => ({ status: 'disconnected' }),
      cancelAuthorization: async () => undefined,
      openAuthorization: async () => undefined,
      copyDeviceCode: async () => undefined,
      openInstallation: async () => undefined,
      openManageAccess: async () => undefined,
      disconnect: async () => undefined,
      listAuthorizedRepositories: async () => [],
      getProjectLinkOptions: async () => ({
        repositories: [],
        suggestedRepositoryIds: [],
        ambiguous: false
      }),
      linkProjectRepository: async ({ projectId }) => ({
        id: projectId,
        name: 'Linked Project',
        path: '/tmp/linked-project',
        agentResourcesTrusted: false,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(1).toISOString()
      }),
      getProjectRepository: async () => {
        throw new Error('github.projectNotLinked')
      },
      listRepositorySetupOptions: async () => [],
      startClone: async () => ({ status: 'started', operationId: 'clone-test' }),
      cancelClone: async () => undefined,
      onCloneProgress: () => () => undefined,
      listIssues: async (request) => ({ items: [], page: request.page, hasNextPage: false }),
      getIssue: async (request) => ({
        number: request.number,
        title: 'Issue',
        body: null,
        state: 'open',
        htmlUrl: `https://github.com/example/repository/issues/${request.number}`,
        author: null,
        labels: [],
        assignees: [],
        commentCount: 0,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      listIssueComments: async (request) => ({
        items: [],
        page: request.page,
        hasNextPage: false
      }),
      createIssueComment: async (request) => ({
        id: 'comment-1',
        body: request.body,
        htmlUrl: `https://github.com/example/repository/issues/${request.number}#comment-1`,
        author: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      updateIssueState: async (request) => ({
        number: request.number,
        title: 'Issue',
        body: null,
        state: request.state,
        htmlUrl: `https://github.com/example/repository/issues/${request.number}`,
        author: null,
        labels: [],
        assignees: [],
        commentCount: 0,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      listPullRequests: async (request) => ({
        items: [],
        page: request.page,
        hasNextPage: false
      }),
      getPullRequest: async (request) => ({
        number: request.number,
        title: 'Pull Request',
        body: null,
        state: 'open',
        isDraft: false,
        htmlUrl: `https://github.com/example/repository/pull/${request.number}`,
        author: null,
        baseBranch: 'main',
        headBranch: 'feature',
        commitCount: 0,
        conversationCommentCount: 0,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      listPullRequestComments: async (request) => ({
        items: [],
        page: request.page,
        hasNextPage: false
      }),
      listPullRequestCommits: async (request) => ({
        items: [],
        page: request.page,
        hasNextPage: false
      }),
      listPullRequestFiles: async (request) => ({
        items: [],
        page: request.page,
        hasNextPage: false
      }),
      listPullRequestCheckRuns: async (request) => ({
        items: [],
        page: request.page,
        hasNextPage: false
      }),
      listPullRequestCommitStatuses: async (request) => ({
        items: [],
        page: request.page,
        hasNextPage: false
      }),
      listPullRequestReviews: async (request) => ({
        items: [],
        page: request.page,
        hasNextPage: false
      }),
      createPullRequestComment: async (request) => ({
        id: 'comment-1',
        body: request.body,
        htmlUrl: `https://github.com/example/repository/pull/${request.number}#comment-1`,
        author: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      createOrReusePullRequest: async () => ({
        status: 'reused',
        pushStatus: 'succeeded',
        pullRequest: {
          number: 1,
          htmlUrl: 'https://github.com/example/repository/pull/1',
          headBranch: 'feature/test',
          baseBranch: 'main'
        }
      }),
      createPullRequestReview: async (request) => ({
        id: 'review-1',
        state: request.event === 'APPROVE' ? 'approved' : 'changes_requested',
        body: request.body ?? null,
        htmlUrl: `https://github.com/example/repository/pull/${request.number}#review-1`,
        author: null,
        submittedAt: new Date(0).toISOString()
      }),
      startIssueSession: async (request) => ({
        id: 'issue-session-1',
        kind: 'project',
        projectId: request.projectId,
        title: `Issue #${request.number}: Issue`,
        status: 'idle',
        worktree: {
          path: `/tmp/SpaceZero/worktrees/${request.projectId}/issue-session-1`,
          branch: `spacezero/issue-${request.number}-issue-session-1`,
          baseRevision: 'abc123'
        },
        source: {
          type: 'issue',
          repositoryId: '1000',
          repositoryNodeId: 'R_1000',
          repositoryOwner: 'example',
          repositoryName: 'repository',
          repositoryFullName: 'example/repository',
          number: request.number,
          url: `https://github.com/example/repository/issues/${request.number}`,
          title: 'Issue'
        },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      startPullRequestSession: async (request) => ({
        id: 'pull-request-session-1',
        kind: 'project',
        projectId: request.projectId,
        title: `Pull Request #${request.number}: Pull Request`,
        status: 'idle',
        worktree: {
          path: `/tmp/SpaceZero/worktrees/${request.projectId}/pull-request-session-1`,
          branch: `spacezero/pull-request-${request.number}-pull-request-session-1`,
          baseRevision: 'def456'
        },
        source: {
          type: 'pull-request',
          repositoryId: '1000',
          repositoryNodeId: 'R_1000',
          repositoryOwner: 'example',
          repositoryName: 'repository',
          repositoryFullName: 'example/repository',
          number: request.number,
          url: `https://github.com/example/repository/pull/${request.number}`,
          title: 'Pull Request'
        },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      })
    },
    projects: {
      list: async () => [],
      createEmpty: async ({ name }) => ({
        id: 'project-test',
        name,
        path: `/tmp/${name}`,
        agentResourcesTrusted: false,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      addFromFolder: async () => ({
        id: 'folder-project-test',
        name: 'Existing Folder',
        path: '/tmp/existing-folder',
        agentResourcesTrusted: false,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      update: async (request) => ({
        id: request.id,
        name: request.name,
        path: request.path,
        agentResourcesTrusted: request.agentResourcesTrusted ?? false,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(1).toISOString()
      }),
      archive: async () => undefined,
      delete: async () => ({ deletedSessionIds: [] })
    },
    sessions: {
      listProjectSessions: async () => [],
      listWorkspaceSessions: async () => [],
      getCurrentGlobalChatContext: async () => ({
        id: 'global-chat-context-test',
        workspaceContext: { kind: 'global-chat', key: 'global-chat' },
        agentSession: {
          id: 'global-chat-agent-session-test',
          kind: 'workspace',
          title: 'Chat',
          status: 'idle',
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString()
        },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      createProjectSession: async ({ projectId, title }) => ({
        id: 'session-test',
        kind: 'project',
        projectId,
        title: title ?? 'Session 1',
        status: 'idle',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      getCurrentProjectChatContext: async ({ sessionId }) => ({
        id: `chat-context-${sessionId}`,
        workspaceContext: { kind: 'project-session', projectSessionId: sessionId },
        agentSessionId: sessionId,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      listProjectChatHistory: async () => [],
      resumeProjectChat: async ({ sessionId, chatContextId }) => ({
        id: chatContextId,
        workspaceContext: { kind: 'project-session', projectSessionId: sessionId },
        agentSessionId: sessionId,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }),
      clearProjectChat: async ({ sessionId }) => ({
        id: `chat-context-${sessionId}-new`,
        workspaceContext: { kind: 'project-session', projectSessionId: sessionId },
        agentSessionId: `${sessionId}-agent-new`,
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString()
      }),
      rename: async ({ sessionId, title }) => ({
        id: sessionId,
        kind: 'workspace',
        title,
        status: 'idle',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(1).toISOString()
      }),
      archive: async () => undefined,
      delete: async () => undefined
    },
    terminal: {
      listTabs: async () => ({
        tabs: [{ terminalId: 'terminal-test', title: 'Shell' }],
        activeTerminalId: 'terminal-test'
      }),
      create: async () => ({
        status: 'running',
        terminalId: 'terminal-test',
        tabs: [{ terminalId: 'terminal-test', title: 'Shell' }],
        activeTerminalId: 'terminal-test'
      }),
      selectTab: async () => ({
        tabs: [{ terminalId: 'terminal-test', title: 'Shell' }],
        activeTerminalId: 'terminal-test'
      }),
      reorderTabs: async () => ({
        tabs: [{ terminalId: 'terminal-test', title: 'Shell' }],
        activeTerminalId: 'terminal-test'
      }),
      subscribe: async () => ({
        terminalId: 'terminal-test',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      }),
      unsubscribe: async () => undefined,
      writeInput: async () => undefined,
      resize: async () => undefined,
      close: async () => ({ tabs: [], activeTerminalId: null }),
      onEvent: () => () => undefined
    },
    update: {
      getStatus: async () => ({
        currentVersion: '0.1.0-beta.1',
        releaseChannel: 'beta',
        lastCheckedAt: null,
        state: 'idle',
        availableVersion: null,
        downloadedVersion: null,
        errorMessage: null,
        releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
      }),
      checkForUpdates: async () => ({
        currentVersion: '0.1.0-beta.1',
        releaseChannel: 'beta',
        lastCheckedAt: new Date(0).toISOString(),
        state: 'no-update-available',
        availableVersion: null,
        downloadedVersion: null,
        errorMessage: null,
        releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
      }),
      applyDownloadedUpdate: async () => ({
        status: 'no-downloaded-update',
        activeWork: { projectSessions: 0, workspaceSessions: 0, terminalTabs: 0 },
        updateStatus: {
          currentVersion: '0.1.0-beta.1',
          releaseChannel: 'beta',
          lastCheckedAt: null,
          state: 'idle',
          availableVersion: null,
          downloadedVersion: null,
          errorMessage: null,
          releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
        }
      }),
      onStatusChange: () => () => undefined
    },
    browser: {
      getState: async ({ contextKey }) => ({
        contextKey,
        activeTabId: 'browser-tab-test',
        tabs: [
          {
            id: 'browser-tab-test',
            url: null,
            title: null,
            faviconUrl: null,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            error: null
          }
        ]
      }),
      navigate: async ({ contextKey, input }) => ({
        contextKey,
        activeTabId: 'browser-tab-test',
        tabs: [
          {
            id: 'browser-tab-test',
            url: input,
            title: null,
            faviconUrl: null,
            isLoading: true,
            canGoBack: false,
            canGoForward: false,
            error: null
          }
        ]
      }),
      show: async ({ contextKey }) => ({
        contextKey,
        activeTabId: 'browser-tab-test',
        tabs: [
          {
            id: 'browser-tab-test',
            url: null,
            title: null,
            faviconUrl: null,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            error: null
          }
        ]
      }),
      goBack: async ({ contextKey }) => ({
        contextKey,
        activeTabId: 'browser-tab-test',
        tabs: [
          {
            id: 'browser-tab-test',
            url: null,
            title: null,
            faviconUrl: null,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            error: null
          }
        ]
      }),
      goForward: async ({ contextKey }) => ({
        contextKey,
        activeTabId: 'browser-tab-test',
        tabs: [
          {
            id: 'browser-tab-test',
            url: null,
            title: null,
            faviconUrl: null,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            error: null
          }
        ]
      }),
      reload: async ({ contextKey }) => ({
        contextKey,
        activeTabId: 'browser-tab-test',
        tabs: [
          {
            id: 'browser-tab-test',
            url: null,
            title: null,
            faviconUrl: null,
            isLoading: true,
            canGoBack: false,
            canGoForward: false,
            error: null
          }
        ]
      }),
      stop: async ({ contextKey }) => ({
        contextKey,
        activeTabId: 'browser-tab-test',
        tabs: [
          {
            id: 'browser-tab-test',
            url: null,
            title: null,
            faviconUrl: null,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            error: null
          }
        ]
      }),
      openInDefaultBrowser: async () => undefined,
      openUrlInDefaultBrowser: async () => undefined,
      openDownload: async () => undefined,
      revealDownload: async () => undefined,
      hide: async () => undefined,
      createTab: async ({ contextKey }) => ({
        contextKey,
        activeTabId: 'browser-tab-new',
        tabs: [
          {
            id: 'browser-tab-test',
            url: null,
            title: null,
            faviconUrl: null,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            error: null
          },
          {
            id: 'browser-tab-new',
            url: null,
            title: null,
            faviconUrl: null,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            error: null
          }
        ]
      }),
      selectTab: async ({ contextKey, tabId }) => ({
        contextKey,
        activeTabId: tabId,
        tabs: [
          {
            id: tabId,
            url: null,
            title: null,
            faviconUrl: null,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            error: null
          }
        ]
      }),
      closeTab: async ({ contextKey }) => ({
        contextKey,
        activeTabId: 'browser-tab-test',
        tabs: [
          {
            id: 'browser-tab-test',
            url: null,
            title: null,
            faviconUrl: null,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            error: null
          }
        ]
      }),
      reorderTabs: async ({ contextKey, tabIds }) => ({
        contextKey,
        activeTabId: tabIds[0] ?? 'browser-tab-test',
        tabs: tabIds.map((id) => ({
          id,
          url: null,
          title: null,
          faviconUrl: null,
          isLoading: false,
          canGoBack: false,
          canGoForward: false,
          error: null
        }))
      }),
      clearData: async () => ({
        status: 'cleared',
        cleared: ['cookies-and-site-storage', 'cache', 'temporary-grants'],
        failures: []
      }),
      onEvent: () => () => undefined
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
      applyDefinitionToFreshSession: async ({ sessionId, agentDefinition }) => ({
        sessionId,
        kind: sessionId.startsWith('workspace') ? 'workspace' : 'project',
        projectId: sessionId.startsWith('workspace') ? null : 'project-test',
        cwd: '/tmp/project-test',
        status: 'idle',
        live: true,
        transcriptPath: '/tmp/agent-session-test.jsonl',
        modelProvider: 'faux',
        modelId: 'faux-1',
        agentDefinition: { id: agentDefinition.id, name: agentDefinition.id }
      }),
      getGlobalSkills: async () => [],
      setGlobalSkillEnabled: async () => [],
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
        apiKeys: {
          configured: [],
          availableProviders: [{ providerId: 'anthropic', label: 'Anthropic' }]
        }
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
        projectsPath: '/tmp/SpaceZero/projects',
        worktreesPath: '/tmp/SpaceZero/worktrees'
      }),
      chooseSpaceZeroHome: async () => ({
        spaceZeroHome: '/tmp/SpaceZero',
        projectsPath: '/tmp/SpaceZero/projects',
        worktreesPath: '/tmp/SpaceZero/worktrees'
      }),
      getModelDefaults: async () => ({ defaultThinking: 'medium' }),
      updateModelDefaults: async (request) => ({
        defaultThinking: request.defaultThinking ?? 'medium',
        defaultModel: request.defaultModel
      }),
      getChatLinkSettings: async () => ({ openChatLinksIn: 'space-zero-browser' }),
      updateChatLinkSettings: async (request) => ({
        openChatLinksIn: request.openChatLinksIn
      }),
      getGitActionSettings: async () => ({ primaryGitAction: 'commit-and-push' }),
      updateGitActionSettings: async (request) => ({
        primaryGitAction: request.primaryGitAction
      }),
      getTerminalSettings: async () => ({ confirmBeforeClosingLiveTerminals: true }),
      updateTerminalSettings: async (request) => ({
        confirmBeforeClosingLiveTerminals: request.confirmBeforeClosingLiveTerminals
      })
    }
  }
})
