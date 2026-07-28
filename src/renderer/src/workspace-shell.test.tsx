import type React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFilesStore } from '../../features/files/renderer/files-store'
import { WorkspaceShell } from './workspace-shell'

const mocks = vi.hoisted(() => ({
  deleteProject: vi.fn(async () => ({
    deletedSessionIds: ['session-deleted-1', 'session-deleted-archived']
  })),
  refreshSessions: vi.fn(async () => [])
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('../../features/app-commands/renderer/app-command-context', () => ({
  useRegisterAppCommands: vi.fn()
}))

vi.mock('../../features/command-palette/renderer/command-palette-controller', () => ({
  useCommandPaletteController: () => ({ isOpen: false, setOpen: vi.fn() })
}))

vi.mock('../../features/keyboard-shortcuts/renderer/keyboard-shortcut-provider', () => ({
  useRegisterKeyboardShortcuts: vi.fn()
}))

vi.mock('../../features/knowledge-base/renderer', () => ({
  KnowledgeBasePage: () => <div />
}))

vi.mock('../../features/projects/renderer', () => ({
  AddProjectDialog: () => null,
  EditProjectDialog: () => null,
  ProjectHome: () => <div />,
  ProjectSidebarList: ({ projects, onDeleteProject }: { projects: { id: string; name: string }[]; onDeleteProject: (project: { id: string; name: string }) => void }) => (
    <button type="button" onClick={() => onDeleteProject(projects[0])}>
      Delete project
    </button>
  ),
  projectSessionSetupErrorMessage: () => 'session setup failed',
  useProjects: () => ({
    projects: [{ id: 'project-1', name: 'Deleted Project', path: '/tmp/project-1' }],
    activeProject: null,
    status: 'ready',
    error: null,
    warning: null,
    refreshProjects: vi.fn(async () => []),
    selectProject: vi.fn(),
    upsertProject: vi.fn(),
    createEmptyProject: vi.fn(),
    addProjectFromFolder: vi.fn(),
    updateProject: vi.fn(),
    archiveProject: vi.fn(),
    deleteProject: mocks.deleteProject
  })
}))

vi.mock('../../features/sessions/renderer', () => ({
  ProjectSessionHostSurface: () => <div />,
  WorkspaceSessionHostSurface: () => <div />,
  WorkspaceSessionList: () => <div />,
  getFocusedSessionTab: () => null,
  syncProjectSessionTabs: (layout: unknown) => layout,
  useProjectSessions: () => ({
    sessions: [
      { id: 'session-deleted-1', kind: 'project', projectId: 'project-1', title: 'One', status: 'idle', createdAt: '', updatedAt: '' },
      { id: 'session-unrelated', kind: 'project', projectId: 'project-2', title: 'Other', status: 'idle', createdAt: '', updatedAt: '' }
    ],
    sessionsByProjectId: new Map(),
    status: 'ready',
    error: null,
    refreshSessions: mocks.refreshSessions,
    upsertProjectSession: vi.fn(),
    archiveSession: vi.fn(),
    deleteSession: vi.fn()
  }),
  useSessionWorkspaceStore: () => ({ layout: { tabs: [], activeTabId: null }, resetLayout: vi.fn(), openProjectSession: vi.fn(), openWorkspaceSession: vi.fn() }),
  useWorkspaceSessions: () => ({
    workspaceSessions: [],
    status: 'ready',
    error: null,
    upsertWorkspaceSession: vi.fn(),
    archiveWorkspaceSession: vi.fn(),
    deleteWorkspaceSession: vi.fn()
  })
}))

vi.mock('../../features/tool-pane/renderer', () => ({
  createKnowledgeBaseToolPaneConfiguration: vi.fn(),
  createProjectSessionToolPaneConfiguration: vi.fn(),
  createWorkspaceSessionToolPaneConfiguration: vi.fn(),
  getRenderedToolPaneWidth: (containerWidth: number, savedWidth: number | null | undefined) =>
    savedWidth ?? Math.round(containerWidth * 0.6),
  ToolPaneHeaderControls: () => <button type="button">Toggle tool pane</button>,
  ToolPaneShell: () => <div />,
  TOOL_PANE_COLLAPSED_HEADER_WIDTH: 48,
  TOOL_PANE_HANDLE_WIDTH: 4,
  ToolPaneToggleButton: () => <button type="button">Toggle tool pane</button>,
  useToolPaneController: () => ({ isOpen: false, toggle: vi.fn() }),
  useToolPaneStore: (selector: (state: { contexts: Record<string, { width: number | null }> }) => unknown) => selector({ contexts: {} })
}))

vi.mock('./components/app-shell/account-menu', () => ({
  AccountMenu: ({ settingsLabel }: { settingsLabel: string }) => <button type="button">{settingsLabel}</button>
}))
vi.mock('./components/sidebar/app-sidebar', () => ({
  AppSidebar: ({
    header,
    footer,
    children
  }: {
    header?: React.ReactNode
    footer?: React.ReactNode
    children: React.ReactNode
  }) => (
    <aside>
      {header}
      {children}
      {footer}
    </aside>
  )
}))
vi.mock('./components/sidebar/sidebar-nav-item', () => ({
  SidebarNavItem: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  )
}))
vi.mock('./hooks/use-sidebar-resize', () => ({ useSidebarResize: () => ({ handlePointerDown: vi.fn(), isResizing: false }) }))

describe('WorkspaceShell sidebar navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('does not show placeholder navigation while keeping functional sidebar entries', () => {
    render(<WorkspaceShell />)

    expect(screen.getByRole('button', { name: 'Knowledge Base' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'workspace.sidebar.newAgent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'workspace.openAppSettings' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'workspace.sidebar.search' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'workspace.sidebar.automations' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'workspace.sidebar.customize' })).not.toBeInTheDocument()
  })
})

describe('WorkspaceShell project deletion Files cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    useFilesStore.setState({
      contexts: {
        'session-deleted-1': createPersistedContext('one.md'),
        'session-deleted-archived': createPersistedContext('archived.md'),
        'session-unrelated': createPersistedContext('other.md'),
        'knowledge-base': createPersistedContext('notes.md')
      }
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('clears exactly the cascaded Project Session Files contexts after public Project deletion succeeds', async () => {
    render(<WorkspaceShell />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }))

    await waitFor(() => expect(mocks.deleteProject).toHaveBeenCalledWith('project-1'))
    await waitFor(() => expect(mocks.refreshSessions).toHaveBeenCalled())

    expect(Object.keys(useFilesStore.getState().contexts).sort()).toEqual([
      'knowledge-base',
      'session-unrelated'
    ])
  })
})

function createPersistedContext(relativePath: string) {
  return {
    explorerWidth: 260,
    explorerCollapsed: false,
    selectedPath: relativePath,
    expandedPaths: [],
    tabs: [],
    activeTabPath: null,
    editorViewStates: {}
  }
}
