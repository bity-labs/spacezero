import { createElement, lazy, Suspense } from 'react'
import { Browser, Files, GitBranch, TerminalWindow } from '@phosphor-icons/react'

import type { BrowserContext } from '../../browser/shared'
import { FilesTabIcon } from '../../files/renderer/components/files-tab-icon'
import { openFilesLocation } from '../../files/renderer/files-open-location'
import {
  activateFilesSidePaneTab,
  promoteFilesSidePaneTab,
  requestCloseFilesSidePaneTab,
  synchronizeFilesSidePaneTabs
} from '../../files/renderer/files-side-pane'
import { KNOWLEDGE_BASE_FILES_CONTEXT_KEY, type FilesContext } from '../../files/shared'
import { MAX_KNOWLEDGE_BASE_IMAGE_BYTES } from '../../knowledge-base/shared'
import type { TerminalContext } from '../../terminal/shared'
import {
  closeBrowserSidePaneTab,
  createBrowserSidePaneTab,
  focusOrCreateBrowserSidePaneTab
} from './browser-side-pane'
import type { SidePaneCategoryDescriptor, SidePaneConfiguration } from './side-pane-shell'
import { useSidePaneStore } from './side-pane-store'

const FilesTool = lazy(async () => {
  const module = await import('../../files/renderer/components/files-tool')
  return { default: module.FilesTool }
})

const TerminalTool = lazy(async () => {
  const module = await import('../../terminal/renderer/components/terminal-tool')
  return { default: module.TerminalTool }
})

const BrowserTool = lazy(async () => {
  const module = await import('../../browser/renderer/components/browser-tool')
  return { default: module.BrowserTool }
})

const GitTool = lazy(async () => {
  const module = await import('../../git/renderer/components/git-tool')
  return { default: module.GitTool }
})

const categoryRegistry = {
  files: { id: 'files', label: 'Files', available: false, icon: Files },
  git: { id: 'git', label: 'Git Diff', available: false, icon: GitBranch },
  browser: { id: 'browser', label: 'Browser', available: false, icon: Browser },
  terminal: { id: 'terminal', label: 'Terminal', available: false, icon: TerminalWindow }
} satisfies Record<SidePaneCategoryDescriptor['id'], SidePaneCategoryDescriptor>

export function createProjectHomeSidePaneConfiguration(project: {
  id: string
}): SidePaneConfiguration {
  const contextKey = projectContextKey(project.id)
  return {
    contextKey,
    capabilities: { kind: 'project-home', projectId: project.id },
    defaultCategoryId: 'files',
    categories: [
      createFilesSidePaneCategoryDescriptor({
        sidePaneContextKey: contextKey,
        filesContextKey: contextKey,
        ipcContext: { kind: 'project-home', projectId: project.id }
      }),
      {
        ...categoryRegistry.git,
        available: true,
        render: ({ capabilities }) =>
          capabilities.kind === 'project-home'
            ? createElement(
                Suspense,
                { fallback: createElement(GitToolLoading) },
                createElement(GitTool, {
                  context: { kind: 'project-home', projectId: capabilities.projectId },
                  filesHandoff: {
                    openFilesTool: () =>
                      useSidePaneStore.getState().openCategory(contextKey, 'files'),
                    openLocation: ({ relativePath, line }) =>
                      openFilesLocation({
                        contextKey,
                        sidePaneContextKey: contextKey,
                        ipcContext: {
                          kind: 'project-home',
                          projectId: capabilities.projectId
                        },
                        relativePath,
                        line,
                        intent: 'permanent'
                      })
                  }
                })
              )
            : null
      },
      createBrowserSidePaneCategoryDescriptor(contextKey, {
        kind: 'project-home',
        projectId: project.id
      }),
      {
        ...categoryRegistry.terminal,
        available: true,
        render: ({ capabilities }) =>
          capabilities.kind === 'project-home'
            ? createElement(
                Suspense,
                { fallback: createElement(TerminalToolLoading) },
                createElement(TerminalWithBrowserHandoff, {
                  terminalContext: { kind: 'project-home', projectId: capabilities.projectId },
                  browserContextKey: contextKey,
                  browserContext: { kind: 'project-home', projectId: capabilities.projectId }
                })
              )
            : null
      }
    ]
  }
}

export function createProjectSessionSidePaneConfiguration(session: {
  id: string
  projectId: string
}): SidePaneConfiguration {
  const contextKey = sessionContextKey(session.id)
  return {
    contextKey,
    capabilities: {
      kind: 'project-session',
      projectId: session.projectId,
      sessionId: session.id
    },
    defaultCategoryId: 'files',
    categories: [
      createFilesSidePaneCategoryDescriptor({
        sidePaneContextKey: sessionContextKey(session.id),
        filesContextKey: session.id,
        ipcContext: { kind: 'project-session', sessionId: session.id }
      }),
      {
        ...categoryRegistry.git,
        available: true,
        render: ({ capabilities }) =>
          capabilities.kind === 'project-session'
            ? createElement(
                Suspense,
                { fallback: createElement(GitToolLoading) },
                createElement(GitTool, {
                  sessionId: capabilities.sessionId,
                  filesHandoff: {
                    openFilesTool: () =>
                      useSidePaneStore
                        .getState()
                        .openCategory(sessionContextKey(capabilities.sessionId), 'files'),
                    openLocation: ({ relativePath, line }) =>
                      openFilesLocation({
                        contextKey: capabilities.sessionId,
                        sidePaneContextKey: sessionContextKey(capabilities.sessionId),
                        ipcContext: { kind: 'project-session', sessionId: capabilities.sessionId },
                        relativePath,
                        line,
                        intent: 'permanent'
                      })
                  }
                })
              )
            : null
      },
      createBrowserSidePaneCategoryDescriptor(contextKey, {
        kind: 'project-session',
        projectId: session.projectId,
        sessionId: session.id
      }),
      {
        ...categoryRegistry.terminal,
        available: true,
        render: ({ capabilities }) =>
          capabilities.kind === 'project-session'
            ? createElement(
                Suspense,
                { fallback: createElement(TerminalToolLoading) },
                createElement(TerminalWithBrowserHandoff, {
                  terminalContext: { kind: 'project-session', sessionId: capabilities.sessionId },
                  browserContextKey: sessionContextKey(capabilities.sessionId),
                  browserContext: {
                    kind: 'project-session',
                    projectId: capabilities.projectId,
                    sessionId: capabilities.sessionId
                  }
                })
              )
            : null
      }
    ]
  }
}

export function createGlobalChatSidePaneConfiguration(): SidePaneConfiguration {
  return {
    contextKey: 'global-chat',
    capabilities: { kind: 'global-chat' },
    defaultCategoryId: 'browser',
    categories: [
      createBrowserSidePaneCategoryDescriptor('global-chat', { kind: 'global-chat' }),
      {
        ...categoryRegistry.terminal,
        available: true,
        render: ({ capabilities }) =>
          capabilities.kind === 'global-chat'
            ? createElement(
                Suspense,
                { fallback: createElement(TerminalToolLoading) },
                createElement(TerminalWithBrowserHandoff, {
                  terminalContext: { kind: 'global-chat' },
                  browserContextKey: 'global-chat',
                  browserContext: { kind: 'global-chat' }
                })
              )
            : null
      }
    ]
  }
}

export function createKnowledgeBaseSidePaneConfiguration(): SidePaneConfiguration {
  return {
    contextKey: 'knowledge-base',
    capabilities: { kind: 'knowledge-base' },
    defaultCategoryId: 'files',
    defaultOpen: true,
    categories: [
      createFilesSidePaneCategoryDescriptor({
        sidePaneContextKey: 'knowledge-base',
        filesContextKey: 'knowledge-base',
        ipcContext: {
          kind: 'knowledge-base',
          contextKey: KNOWLEDGE_BASE_FILES_CONTEXT_KEY
        },
        createRichImageAdapter: createKnowledgeBaseRichImageAdapter,
        treeLabel: 'Files'
      }),
      {
        ...categoryRegistry.git,
        available: true,
        render: ({ capabilities }) =>
          capabilities.kind === 'knowledge-base'
            ? createElement(
                Suspense,
                { fallback: createElement(GitToolLoading) },
                createElement(GitTool, {
                  context: { kind: 'knowledge-base', contextKey: 'knowledge-base' },
                  filesHandoff: {
                    openFilesTool: () =>
                      useSidePaneStore.getState().openCategory('knowledge-base', 'files'),
                    openLocation: ({ relativePath, line }) =>
                      openFilesLocation({
                        contextKey: 'knowledge-base',
                        sidePaneContextKey: 'knowledge-base',
                        ipcContext: {
                          kind: 'knowledge-base',
                          contextKey: KNOWLEDGE_BASE_FILES_CONTEXT_KEY
                        },
                        relativePath,
                        line,
                        intent: 'permanent'
                      })
                  }
                })
              )
            : null
      },
      createBrowserSidePaneCategoryDescriptor('knowledge-base', { kind: 'knowledge-base' }),
      {
        ...categoryRegistry.terminal,
        available: true,
        render: ({ capabilities }) =>
          capabilities.kind === 'knowledge-base'
            ? createElement(
                Suspense,
                { fallback: createElement(TerminalToolLoading) },
                createElement(TerminalWithBrowserHandoff, {
                  terminalContext: { kind: 'knowledge-base' },
                  browserContextKey: 'knowledge-base',
                  browserContext: { kind: 'knowledge-base' }
                })
              )
            : null
      }
    ]
  }
}

function createFilesSidePaneCategoryDescriptor({
  sidePaneContextKey,
  filesContextKey,
  ipcContext,
  createRichImageAdapter,
  treeLabel
}: {
  sidePaneContextKey: string
  filesContextKey: string
  ipcContext: FilesContext
  createRichImageAdapter?: typeof createKnowledgeBaseRichImageAdapter
  treeLabel?: string
}): SidePaneCategoryDescriptor {
  return {
    ...categoryRegistry.files,
    available: true,
    renderTabIcon: (tab) =>
      tab.label ? createElement(FilesTabIcon, { fileName: tab.label }) : createElement(Files),
    onActivateTab: (tab) => activateFilesSidePaneTab(filesContextKey, tab),
    onDoubleClickTab: (tab) => {
      promoteFilesSidePaneTab(filesContextKey, tab)
      synchronizeFilesSidePaneTabs(filesContextKey, sidePaneContextKey, false)
    },
    onRequestCloseTab: (tab) => requestCloseFilesSidePaneTab({ filesContextKey, ipcContext, tab }),
    render: ({ activeTab }) =>
      createElement(
        Suspense,
        { fallback: createElement(FilesToolLoading) },
        createElement(FilesTool, {
          contextKey: filesContextKey,
          ipcContext,
          sidePaneContextKey,
          activeRelativePath: activeTab.resourceId,
          createRichImageAdapter,
          treeLabel
        })
      )
  }
}

function createBrowserSidePaneCategoryDescriptor(
  contextKey: string,
  context: BrowserContext
): SidePaneCategoryDescriptor {
  return {
    ...categoryRegistry.browser,
    available: true,
    open: () => {
      void focusOrCreateBrowserSidePaneTab({ contextKey, context }).catch(() => undefined)
    },
    create: () => {
      void createBrowserSidePaneTab({ contextKey, context }).catch(() => undefined)
    },
    close: (tab) => {
      void closeBrowserSidePaneTab({ contextKey, context, tabId: tab.id }).catch(() => undefined)
    },
    render: () =>
      createElement(
        Suspense,
        { fallback: createElement(BrowserToolLoading) },
        createElement(BrowserTool, { contextKey, context })
      )
  }
}

function TerminalWithBrowserHandoff({
  terminalContext,
  browserContextKey,
  browserContext
}: {
  terminalContext: TerminalContext
  browserContextKey: string
  browserContext: BrowserContext
}): React.JSX.Element {
  return createElement(TerminalTool, {
    context: terminalContext,
    browserHandoff: {
      openBrowserPage: async (url: string) => {
        await createBrowserSidePaneTab({
          contextKey: browserContextKey,
          context: browserContext,
          input: url
        })
      }
    }
  })
}

function TerminalToolLoading(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'flex h-full items-center justify-center text-sm text-muted-foreground' },
    'Loading Terminal…'
  )
}

function BrowserToolLoading(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'flex h-full items-center justify-center text-sm text-muted-foreground' },
    'Loading Browser…'
  )
}

function FilesToolLoading(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'flex h-full items-center justify-center text-sm text-muted-foreground' },
    'Loading Files…'
  )
}

function GitToolLoading(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'flex h-full items-center justify-center text-sm text-muted-foreground' },
    'Loading Git…'
  )
}

function createKnowledgeBaseRichImageAdapter(documentRelativePath: string) {
  return {
    maxBytes: MAX_KNOWLEDGE_BASE_IMAGE_BYTES,
    importImage: async (image: File) => {
      const result = await window.spacezero.knowledgeBase.importImage({
        documentRelativePath,
        fileName: image.name,
        bytes: new Uint8Array(await image.arrayBuffer())
      })
      return {
        markdownPath: result.markdownPath,
        altText: result.altText
      }
    },
    loadImage: ({ markdownPath }: { markdownPath: string }) =>
      window.spacezero.knowledgeBase.loadImage({ documentRelativePath, markdownPath })
  }
}

function projectContextKey(projectId: string): string {
  return `project:${projectId}`
}

function sessionContextKey(sessionId: string): string {
  return `session:${sessionId}`
}
