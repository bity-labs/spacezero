import { createElement, lazy, Suspense } from 'react'
import { Browser, Files, GitBranch, TerminalWindow } from '@phosphor-icons/react'

import type { BrowserContext } from '../../browser/shared'
import { openFilesLocation } from '../../files/renderer/files-open-location'
import { KNOWLEDGE_BASE_FILES_CONTEXT_KEY } from '../../files/shared'
import { MAX_KNOWLEDGE_BASE_IMAGE_BYTES } from '../../knowledge-base/shared'
import type { TerminalContext } from '../../terminal/shared'
import type { ToolDescriptor, ToolPaneConfiguration } from './tool-pane-shell'
import { useToolPaneStore } from './tool-pane-store'

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

const toolRegistry = {
  files: { id: 'files', label: 'Files', available: false, icon: Files },
  git: { id: 'git', label: 'Git', available: false, icon: GitBranch },
  browser: { id: 'browser', label: 'Browser', available: false, icon: Browser },
  terminal: { id: 'terminal', label: 'Terminal', available: false, icon: TerminalWindow }
} satisfies Record<ToolDescriptor['id'], ToolDescriptor>

export function createProjectSessionToolPaneConfiguration(session: {
  id: string
  projectId: string
}): ToolPaneConfiguration {
  return {
    contextKey: sessionContextKey(session.id),
    capabilities: {
      kind: 'project-session',
      projectId: session.projectId,
      sessionId: session.id
    },
    defaultToolId: 'files',
    tools: [
      {
        ...toolRegistry.files,
        available: true,
        render: ({ capabilities }) =>
          capabilities.kind === 'project-session'
            ? createElement(
                Suspense,
                { fallback: createElement(FilesToolLoading) },
                createElement(FilesTool, {
                  contextKey: capabilities.sessionId,
                  ipcContext: { kind: 'project-session', sessionId: capabilities.sessionId }
                })
              )
            : null
      },
      {
        ...toolRegistry.git,
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
                      useToolPaneStore
                        .getState()
                        .openTool(sessionContextKey(capabilities.sessionId), 'files'),
                    openLocation: ({ relativePath, line }) =>
                      openFilesLocation({
                        contextKey: capabilities.sessionId,
                        ipcContext: { kind: 'project-session', sessionId: capabilities.sessionId },
                        relativePath,
                        line
                      })
                  }
                })
              )
            : null
      },
      createBrowserToolDescriptor(),
      {
        ...toolRegistry.terminal,
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

export function createGlobalChatToolPaneConfiguration(): ToolPaneConfiguration {
  return {
    contextKey: 'global-chat',
    capabilities: { kind: 'global-chat' },
    defaultToolId: 'browser',
    tools: [
      createBrowserToolDescriptor(),
      {
        ...toolRegistry.terminal,
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

export function createKnowledgeBaseToolPaneConfiguration(): ToolPaneConfiguration {
  return {
    contextKey: 'knowledge-base',
    capabilities: { kind: 'knowledge-base' },
    defaultToolId: 'files',
    defaultOpen: true,
    tools: [
      {
        ...toolRegistry.files,
        available: true,
        render: ({ contextKey, capabilities }) =>
          capabilities.kind === 'knowledge-base'
            ? createElement(
                Suspense,
                { fallback: createElement(FilesToolLoading) },
                createElement(FilesTool, {
                  contextKey,
                  ipcContext: {
                    kind: 'knowledge-base',
                    contextKey: KNOWLEDGE_BASE_FILES_CONTEXT_KEY
                  },
                  createRichImageAdapter: createKnowledgeBaseRichImageAdapter,
                  treeLabel: 'Files'
                })
              )
            : null
      },
      {
        ...toolRegistry.git,
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
                      useToolPaneStore.getState().openTool('knowledge-base', 'files'),
                    openLocation: ({ relativePath, line }) =>
                      openFilesLocation({
                        contextKey: 'knowledge-base',
                        ipcContext: {
                          kind: 'knowledge-base',
                          contextKey: KNOWLEDGE_BASE_FILES_CONTEXT_KEY
                        },
                        relativePath,
                        line
                      })
                  }
                })
              )
            : null
      },
      createBrowserToolDescriptor(),
      {
        ...toolRegistry.terminal,
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

function createBrowserToolDescriptor(): ToolDescriptor {
  return {
    ...toolRegistry.browser,
    available: true,
    render: ({ contextKey, capabilities }) =>
      createElement(
        Suspense,
        { fallback: createElement(BrowserToolLoading) },
        createElement(BrowserTool, { contextKey, context: capabilities })
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
      contextKey: browserContextKey,
      context: browserContext,
      openBrowserTool: () => useToolPaneStore.getState().openTool(browserContextKey, 'browser')
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

function sessionContextKey(sessionId: string): string {
  return `session:${sessionId}`
}
