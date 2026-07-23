import { createElement } from 'react'
import { Browser, Files, GitBranch, TerminalWindow } from '@phosphor-icons/react'

import { FilesTool } from '../../files/renderer'
import type { ToolDescriptor, ToolPaneConfiguration } from './tool-pane-shell'

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
            ? createElement(FilesTool, { sessionId: capabilities.sessionId })
            : null
      },
      toolRegistry.git,
      toolRegistry.browser,
      toolRegistry.terminal
    ]
  }
}

export function createWorkspaceSessionToolPaneConfiguration(session: {
  id: string
}): ToolPaneConfiguration {
  return {
    contextKey: sessionContextKey(session.id),
    capabilities: { kind: 'workspace-session', sessionId: session.id },
    defaultToolId: 'browser',
    tools: [toolRegistry.browser, toolRegistry.terminal]
  }
}

export function createKnowledgeBaseToolPaneConfiguration(): ToolPaneConfiguration {
  return {
    contextKey: 'knowledge-base',
    capabilities: { kind: 'knowledge-base' },
    defaultToolId: 'files',
    tools: [toolRegistry.files, toolRegistry.git, toolRegistry.browser, toolRegistry.terminal]
  }
}

function sessionContextKey(sessionId: string): string {
  return `session:${sessionId}`
}
