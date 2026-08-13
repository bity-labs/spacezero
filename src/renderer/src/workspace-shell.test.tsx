import type React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFilesStore } from '../../features/files/renderer/files-store'
import { WorkspaceShell } from './workspace-shell'

type TestProject = { id: string; name: string; path: string; updatedAt?: string }
type TestProjectSession = {
  id: string
  kind: 'project'
  projectId: string
  title: string
  status: string
  createdAt: string
  updatedAt: string
  source?: { type: 'issue' | 'pull-request'; number: number; url: string }
}

const mocks = vi.hoisted(() => {
  const projects: TestProject[] = [
    {
      id: 'project-1',
      name: 'Deleted Project',
      path: '/tmp/project-1',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }
  ]
  const sessions: TestProjectSession[] = [
    {
      id: 'session-deleted-1',
      kind: 'project',
      projectId: 'project-1',
      title: 'One',
      status: 'idle',
      createdAt: '',
      updatedAt: ''
    },
    {
      id: 'session-unrelated',
      kind: 'project',
      projectId: 'project-2',
      title: 'Other',
      status: 'idle',
      createdAt: '',
      updatedAt: ''
    }
  ]
  const state: {
    projects: TestProject[]
    activeProject: TestProject | null
    sessions: TestProjectSession[]
    activeTab: { kind: 'project'; sessionId: string } | null
  } = {
    projects,
    activeProject: null,
    sessions,
    activeTab: null
  }

  return {
    state,
    deleteProject: vi.fn(async () => ({
      deletedSessionIds: ['session-deleted-1', 'session-deleted-archived']
    })),
    refreshSessions: vi.fn(async () => []),
    selectProject: vi.fn((project: TestProject) => {
      state.activeProject = project
    }),
    resetLayout: vi.fn(() => {
      state.activeTab = null
    }),
    openProjectSession: vi.fn((session: TestProjectSession) => {
      state.activeTab = { kind: 'project', sessionId: session.id }
    }),
    createProjectHomeSidePaneConfiguration: vi.fn((project: TestProject) => ({
      contextKey: `project:${project.id}`,
      capabilities: { kind: 'project-home', projectId: project.id },
      defaultCategoryId: 'files',
      categories: []
    }))
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('../../features/app-commands/renderer/app-command-context', () => ({
  useRegisterAppCommands: vi.fn()
}))

vi.mock('../../features/command-palette/renderer/command-palette-controller', () => ({
  useCommandPaletteController: () => ({ isOpen: false, open: vi.fn(), setOpen: vi.fn() })
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
  ProjectHome: ({ project }: { project: { name: string } }) => (
    <div>Project Home: {project.name}</div>
  ),
  ProjectSidebarList: ({
    projects,
    onDeleteProject
  }: {
    projects: { id: string; name: string }[]
    onDeleteProject: (project: { id: string; name: string }) => void
  }) => (
    <button type="button" onClick={() => onDeleteProject(projects[0])}>
      Delete project
    </button>
  ),
  projectSessionSetupErrorMessage: () => 'session setup failed',
  useProjects: () => ({
    projects: mocks.state.projects,
    activeProject: mocks.state.activeProject,
    status: 'ready',
    error: null,
    warning: null,
    refreshProjects: vi.fn(async () => []),
    selectProject: mocks.selectProject,
    upsertProject: vi.fn(),
    createEmptyProject: vi.fn(),
    addProjectFromFolder: vi.fn(),
    updateProject: vi.fn(),
    archiveProject: vi.fn(),
    deleteProject: mocks.deleteProject
  })
}))

vi.mock('../../features/sessions/renderer', () => ({
  ProjectSessionHostSurface: ({ session }: { session: TestProjectSession }) => (
    <div>Project Session: {session.title}</div>
  ),
  WorkspaceSessionHostSurface: () => <div />,
  WorkspaceSessionList: () => <div />,
  getFocusedSessionTab: () => mocks.state.activeTab,
  syncProjectSessionTabs: (layout: unknown) => layout,
  syncSessionTabs: (layout: unknown) => layout,
  useProjectSessions: () => ({
    sessions: mocks.state.sessions,
    sessionsByProjectId: new Map<string, TestProjectSession[]>([
      ['project-1', mocks.state.sessions.filter((session) => session.projectId === 'project-1')]
    ]),
    status: 'ready',
    error: null,
    refreshSessions: mocks.refreshSessions,
    upsertProjectSession: vi.fn(),
    renameProjectSession: vi.fn(),
    archiveSession: vi.fn(),
    deleteSession: vi.fn()
  }),
  useSessionWorkspaceStore: (
    selector: (state: {
      layout: unknown
      resetLayout: () => void
      openProjectSession: (session: TestProjectSession) => void
      openWorkspaceSession: () => void
    }) => unknown
  ) =>
    selector({
      layout: {},
      resetLayout: mocks.resetLayout,
      openProjectSession: mocks.openProjectSession,
      openWorkspaceSession: vi.fn()
    }),
  useWorkspaceSessions: () => ({
    workspaceSessions: [],
    status: 'ready',
    error: null,
    upsertWorkspaceSession: vi.fn(),
    renameWorkspaceSession: vi.fn(),
    archiveWorkspaceSession: vi.fn(),
    deleteWorkspaceSession: vi.fn()
  })
}))

vi.mock('../../features/side-pane/renderer', () => ({
  createGlobalChatSidePaneConfiguration: vi.fn(),
  createKnowledgeBaseSidePaneConfiguration: vi.fn(),
  createProjectHomeSidePaneConfiguration: mocks.createProjectHomeSidePaneConfiguration,
  createProjectSessionSidePaneConfiguration: vi.fn(),
  createWorkspaceSessionSidePaneConfiguration: vi.fn(),
  getRenderedSidePaneWidth: (containerWidth: number, savedWidth: number | null | undefined) =>
    savedWidth ?? Math.round(containerWidth * 0.6),
  SidePaneHeaderControls: () => <button type="button">Toggle side pane</button>,
  SidePaneShell: ({ children, contextKey }: { children: React.ReactNode; contextKey: string }) => (
    <div data-testid="side-pane-shell" data-context-key={contextKey}>
      {children}
    </div>
  ),
  SIDE_PANE_COLLAPSED_HEADER_WIDTH: 48,
  SIDE_PANE_HANDLE_WIDTH: 4,
  SidePaneToggleButton: () => <button type="button">Toggle side pane</button>,
  useSidePaneController: () => ({ isOpen: false, openCategory: vi.fn(), toggle: vi.fn() }),
  useSidePaneStore: (
    selector: (state: { contexts: Record<string, { width: number | null }> }) => unknown
  ) => selector({ contexts: {} })
}))

vi.mock('./components/app-shell/account-menu', () => ({
  AccountMenu: ({ settingsLabel }: { settingsLabel: string }) => (
    <button type="button">{settingsLabel}</button>
  )
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
vi.mock('./hooks/use-sidebar-resize', () => ({
  useSidebarResize: () => ({ startResize: vi.fn(), resizeWithKeyboard: vi.fn() })
}))

describe('WorkspaceShell sidebar navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    resetMockState()
  })

  it('does not show placeholder navigation while keeping functional sidebar entries', () => {
    render(<WorkspaceShell />)

    expect(screen.getByRole('button', { name: 'Knowledge Base' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument()
    expect(screen.queryByText('sessions.workspaceList.sectionLabel')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'workspace.openAppSettings' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'workspace.sidebar.search' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'workspace.sidebar.automations' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'workspace.sidebar.customize' })
    ).not.toBeInTheDocument()
  })
})

describe('WorkspaceShell Project Home tools', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    resetMockState()
    mocks.state.activeProject = mocks.state.projects[0]
  })

  it('uses a Project-owned Side Pane context instead of inheriting a prior Project Session context', () => {
    mocks.state.activeTab = null

    render(<WorkspaceShell />)

    expect(mocks.createProjectHomeSidePaneConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project-1', path: '/tmp/project-1' })
    )
    expect(screen.getByTestId('side-pane-shell')).toHaveAttribute(
      'data-context-key',
      'project:project-1'
    )
    expect(screen.getByText('Project Home: Deleted Project')).toBeInTheDocument()
  })
})

describe('WorkspaceShell project session breadcrumbs', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    resetMockState()
    mocks.state.sessions = [
      {
        id: 'session-active',
        kind: 'project',
        projectId: 'project-1',
        title: 'Active Session',
        status: 'idle',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 'session-next',
        kind: 'project',
        projectId: 'project-1',
        title: 'Next Session',
        status: 'idle',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 'session-other-project',
        kind: 'project',
        projectId: 'project-2',
        title: 'Other Project Session',
        status: 'idle',
        createdAt: '',
        updatedAt: ''
      }
    ]
    mocks.state.activeTab = { kind: 'project', sessionId: 'session-active' }
  })

  it('opens the active Project Home from the project-name breadcrumb', () => {
    const { rerender } = render(<WorkspaceShell />)

    fireEvent.click(screen.getByRole('button', { name: 'Open Project Home for Deleted Project' }))
    rerender(<WorkspaceShell />)

    expect(mocks.selectProject).toHaveBeenCalledWith(mocks.state.projects[0])
    expect(mocks.resetLayout).toHaveBeenCalled()
    expect(screen.getByText('Project Home: Deleted Project')).toBeInTheDocument()
  })

  it('switches only between sessions for the active project from the session breadcrumb selector', async () => {
    const { rerender } = render(<WorkspaceShell />)

    fireEvent.click(screen.getByRole('button', { name: 'Switch Project Session' }))

    expect(await screen.findByRole('menuitem', { name: /Active Session/ })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('menuitem', { name: 'Next Session' })).toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: 'Other Project Session' })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Next Session' }))
    rerender(<WorkspaceShell />)

    expect(mocks.openProjectSession).toHaveBeenCalledWith(mocks.state.sessions[1])
    expect(screen.getByRole('button', { name: 'Switch Project Session' })).toHaveTextContent(
      'Next Session'
    )
    expect(screen.getByText('Project Session: Next Session')).toBeInTheDocument()
  })

  it('keeps Issue source breadcrumb actions routed to Project Home', () => {
    mocks.state.sessions[0] = {
      ...mocks.state.sessions[0],
      source: {
        type: 'issue',
        number: 122,
        url: 'https://github.com/bity-labs/spacezero/issues/122'
      }
    }
    const { rerender } = render(<WorkspaceShell />)

    fireEvent.click(screen.getByRole('button', { name: 'Issue #122' }))
    rerender(<WorkspaceShell />)

    expect(mocks.selectProject).toHaveBeenCalledWith(mocks.state.projects[0])
    expect(mocks.resetLayout).toHaveBeenCalled()
    expect(screen.getByText('Project Home: Deleted Project')).toBeInTheDocument()
  })
})

describe('WorkspaceShell project deletion Files cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    resetMockState()
    useFilesStore.setState({
      contexts: {
        'project:project-1': createPersistedContext('project-home.md'),
        'session-deleted-1': createPersistedContext('one.md'),
        'session-deleted-archived': createPersistedContext('archived.md'),
        'session-unrelated': createPersistedContext('other.md'),
        'knowledge-base': createPersistedContext('notes.md')
      }
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('clears the Project Home and cascaded Project Session Files contexts after deletion succeeds', async () => {
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

function resetMockState(): void {
  mocks.state.projects = [
    {
      id: 'project-1',
      name: 'Deleted Project',
      path: '/tmp/project-1',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }
  ]
  mocks.state.activeProject = null
  mocks.state.sessions = [
    {
      id: 'session-deleted-1',
      kind: 'project',
      projectId: 'project-1',
      title: 'One',
      status: 'idle',
      createdAt: '',
      updatedAt: ''
    },
    {
      id: 'session-unrelated',
      kind: 'project',
      projectId: 'project-2',
      title: 'Other',
      status: 'idle',
      createdAt: '',
      updatedAt: ''
    }
  ]
  mocks.state.activeTab = null
}

function createPersistedContext(relativePath: string) {
  return {
    explorerWidth: 260,
    explorerCollapsed: false,
    explorerScrollTop: 0,
    explorerSearchMode: 'files' as const,
    filesSearchQuery: '',
    contentSearchQuery: '',
    selectedPath: relativePath,
    expandedPaths: [],
    tabs: [],
    activeTabPath: null,
    editorViewStates: {}
  }
}
