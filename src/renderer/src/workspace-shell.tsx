import {
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent
} from 'react'
import {
  BookOpenText,
  CalendarBlank,
  DotsSixVertical,
  FolderPlus,
  FunnelSimple,
  MagnifyingGlass,
  PaperPlaneTilt,
  Sidebar,
  SquaresFour
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { useRegisterAppCommands } from '../../features/app-commands/renderer/app-command-context'
import { KnowledgeBasePage } from '../../features/knowledge-base/renderer'
import type { AppCommand } from '../../features/app-commands/renderer/app-command.model'
import { useCommandPaletteController } from '../../features/command-palette/renderer/command-palette-controller'
import type { KeyboardShortcutDefinition } from '../../features/keyboard-shortcuts/renderer/keyboard-shortcut-manager'
import { useRegisterKeyboardShortcuts } from '../../features/keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import type { Project } from '../../features/projects/shared'
import type { ProjectSession, WorkspaceSession } from '../../features/sessions/shared'
import {
  AddProjectDialog,
  EditProjectDialog,
  ProjectHome,
  ProjectSidebarList,
  projectSessionSetupErrorMessage,
  type ProjectHomeGitHubTarget,
  useProjects
} from '../../features/projects/renderer'
import {
  ProjectSessionHostSurface,
  WorkspaceSessionHostSurface,
  getFocusedSessionTab,
  syncProjectSessionTabs,
  useProjectSessions,
  useSessionWorkspaceStore,
  useWorkspaceSessions,
  WorkspaceSessionList,
  type SessionWorkspaceTab
} from '../../features/sessions/renderer'
import {
  createKnowledgeBaseToolPaneConfiguration,
  createProjectSessionToolPaneConfiguration,
  createWorkspaceSessionToolPaneConfiguration,
  ToolPaneShell,
  ToolPaneToggleButton,
  useToolPaneController,
  type ToolPaneConfiguration
} from '../../features/tool-pane/renderer'
import { AccountMenu } from './components/app-shell/account-menu'
import { AppSidebar } from './components/sidebar/app-sidebar'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from './components/sidebar/sidebar-layout'
import { SidebarNavItem } from './components/sidebar/sidebar-nav-item'
import { SidebarSectionHeader } from './components/sidebar/sidebar-section-header'
import { Alert, AlertDescription } from './components/ui/alert'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from './components/ui/breadcrumb'
import { Button } from './components/ui/button'
import { SidebarGroup, SidebarMenu } from './components/ui/sidebar'
import { useSidebarResize } from './hooks/use-sidebar-resize'
import { cn } from './lib/utils'
import { useUiLayoutStore } from './stores/ui-layout-store'

const workspaceShortcuts: readonly KeyboardShortcutDefinition[] = [
  { commandId: 'workspace.toggle-left-panel', defaultKeybinding: { normalized: 'mod+b' } },
  { commandId: 'workspace.toggle-tool-pane', defaultKeybinding: { normalized: 'mod+shift+b' } }
]

export function WorkspaceShell(): React.JSX.Element {
  const isLeftPanelOpen = useUiLayoutStore((state) => state.isLeftSidebarOpen)
  const leftPanelWidth = useUiLayoutStore((state) => state.leftSidebarWidth)
  const setLeftPanelWidth = useUiLayoutStore((state) => state.setLeftSidebarWidth)
  const toggleLeftPanel = useUiLayoutStore((state) => state.toggleLeftSidebar)
  const leftPanelResize = useSidebarResize({
    side: 'left',
    width: leftPanelWidth,
    setWidth: setLeftPanelWidth
  })
  const commandPalette = useCommandPaletteController()
  const { t } = useTranslation()
  const [isAddProjectOpen, setAddProjectOpen] = useState(false)
  const [activePrimaryView, setActivePrimaryView] = useState<'workspace' | 'knowledge-base'>(
    'workspace'
  )
  const [isKnowledgeBaseConfigured, setKnowledgeBaseConfigured] = useState(false)
  const [isWorkspaceSessionsExpanded, setWorkspaceSessionsExpanded] = useState(true)
  const [isProjectsExpanded, setProjectsExpanded] = useState(true)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [sidebarSessionError, setSidebarSessionError] = useState<string | null>(null)
  const [projectHomeRequest, setProjectHomeRequest] = useState<
    (ProjectHomeGitHubTarget & { projectId: string; requestId: number }) | null
  >(null)
  const sessionWorkspaceLayout = useSessionWorkspaceStore((state) => state.layout)
  const resetSessionWorkspaceLayout = useSessionWorkspaceStore((state) => state.resetLayout)
  const openProjectSessionInWorkspace = useSessionWorkspaceStore(
    (state) => state.openProjectSession
  )
  const openWorkspaceSessionInWorkspace = useSessionWorkspaceStore(
    (state) => state.openWorkspaceSession
  )
  const {
    projects,
    activeProject,
    status: projectsStatus,
    error: projectsError,
    warning: projectsWarning,
    refreshProjects,
    selectProject,
    upsertProject,
    createEmptyProject,
    addProjectFromFolder,
    updateProject,
    archiveProject,
    deleteProject
  } = useProjects()
  const {
    workspaceSessions,
    status: workspaceSessionsStatus,
    error: workspaceSessionsError,
    upsertWorkspaceSession,
    archiveWorkspaceSession,
    deleteWorkspaceSession
  } = useWorkspaceSessions()
  const {
    sessions,
    sessionsByProjectId,
    status: sessionsStatus,
    error: sessionsError,
    refreshSessions,
    upsertProjectSession,
    archiveSession,
    deleteSession
  } = useProjectSessions()
  const syncedSessionWorkspaceLayout = useMemo(
    () => syncProjectSessionTabs(sessionWorkspaceLayout, sessions),
    [sessionWorkspaceLayout, sessions]
  )
  const activeTab = getFocusedSessionTab(syncedSessionWorkspaceLayout)
  const activeProjectSession =
    activeTab?.kind === 'project'
      ? (sessions.find((session) => session.id === activeTab.sessionId) ?? null)
      : null
  const activeWorkspaceSession = activeTab?.kind === 'workspace' ? activeTab.session : null
  const activeSessionProject = activeProjectSession
    ? (projects.find((project) => project.id === activeProjectSession.projectId) ?? null)
    : null
  const toolPaneConfiguration = useMemo<ToolPaneConfiguration | null>(() => {
    if (activePrimaryView === 'knowledge-base') {
      return isKnowledgeBaseConfigured ? createKnowledgeBaseToolPaneConfiguration() : null
    }
    if (activeProjectSession) {
      return createProjectSessionToolPaneConfiguration(activeProjectSession)
    }
    if (activeWorkspaceSession) {
      return createWorkspaceSessionToolPaneConfiguration(activeWorkspaceSession)
    }
    return null
  }, [activePrimaryView, activeProjectSession, activeWorkspaceSession, isKnowledgeBaseConfigured])
  const toolPaneController = useToolPaneController(toolPaneConfiguration)

  const runInWorkspaceView = useCallback((action: () => void | Promise<void>): void => {
    setActivePrimaryView('workspace')
    void action()
  }, [])

  const openWorkspaceSession = useCallback(
    (session: WorkspaceSession): void => {
      runInWorkspaceView(() => openWorkspaceSessionInWorkspace(session))
    },
    [openWorkspaceSessionInWorkspace, runInWorkspaceView]
  )

  const handleNewWorkspaceSession = useCallback((): void => {
    runInWorkspaceView(async () => {
      const session = await window.spacezero.agent.createWorkspaceSession()
      upsertWorkspaceSession(session)
      openWorkspaceSessionInWorkspace(session)
    })
  }, [openWorkspaceSessionInWorkspace, runInWorkspaceView, upsertWorkspaceSession])

  const workspaceCommands = useMemo<readonly AppCommand[]>(
    () => [
      {
        id: 'workspace.toggle-left-panel',
        title: isLeftPanelOpen ? t('workspace.hideLeftPanel') : t('workspace.showLeftPanel'),
        category: t('appCommands.categories.workspace'),
        keywords: ['sidebar', 'navigation'],
        handler: toggleLeftPanel
      },
      {
        id: 'workspace.toggle-tool-pane',
        title: 'Toggle Tool Pane',
        category: t('appCommands.categories.workspace'),
        keywords: ['tools', 'pane', 'switcher'],
        handler: toolPaneController.toggle
      },
      {
        id: 'workspace.open-workspace-session',
        title: t('workspace.sidebar.newAgent'),
        category: t('appCommands.categories.workspace'),
        keywords: ['agent', 'global', 'workspace session'],
        handler: () => void handleNewWorkspaceSession()
      }
    ],
    [isLeftPanelOpen, handleNewWorkspaceSession, t, toolPaneController.toggle, toggleLeftPanel]
  )

  useRegisterAppCommands(workspaceCommands)
  useRegisterKeyboardShortcuts(workspaceShortcuts)

  async function handleGitHubProjectReady(projectId: string): Promise<void> {
    setProjectHomeRequest(null)
    const nextProjects = await refreshProjects()
    const project = nextProjects.find((candidate) => candidate.id === projectId)
    if (!project) throw new Error('Cloned Project was not registered')
    runInWorkspaceView(() => {
      selectProject(project)
      resetSessionWorkspaceLayout()
    })
  }

  async function handleNewSession(project: Project): Promise<void> {
    setActivePrimaryView('workspace')
    selectProject(project)
    const agentSession = await window.spacezero.agent.createSession({
      projectId: project.id,
      cwd: project.path
    })
    const session: ProjectSession = {
      id: agentSession.sessionId,
      kind: 'project',
      projectId: agentSession.projectId ?? project.id,
      title: `Session ${(sessionsByProjectId.get(project.id)?.length ?? 0) + 1}`,
      status: agentSession.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    upsertProjectSession(session)
    openProjectSessionInWorkspace(session)
    await Promise.all([refreshSessions(), refreshProjects()])
  }

  function handleGitHubSessionCreated(session: ProjectSession): void {
    runInWorkspaceView(async () => {
      const project = projects.find((candidate) => candidate.id === session.projectId)
      if (project) selectProject(project)
      upsertProjectSession(session)
      openProjectSessionInWorkspace(session)
      await refreshSessions()
    })
  }

  function handleOpenSessionSource(session: ProjectSession): void {
    if (!session.source) return
    const project = projects.find((candidate) => candidate.id === session.projectId)
    if (!project) return
    runInWorkspaceView(() => {
      selectProject(project)
      setProjectHomeRequest({
        projectId: project.id,
        type: session.source!.type,
        number: session.source!.number,
        requestId: Date.now()
      })
      resetSessionWorkspaceLayout()
    })
  }

  function handleSelectSession(session: ProjectSession): void {
    runInWorkspaceView(() => {
      const sessionProject = projects.find((project) => project.id === session.projectId)
      if (sessionProject) selectProject(sessionProject)
      openProjectSessionInWorkspace(session)
    })
  }

  async function handleArchiveSession(sessionId: string): Promise<void> {
    await archiveSession(sessionId)
    if (getTabSessionId(activeTab) === sessionId) resetSessionWorkspaceLayout()
  }

  async function handleDeleteSession(sessionId: string): Promise<void> {
    if (!window.confirm('Delete this session permanently? This cannot be undone.')) return
    await deleteSession(sessionId)
    if (getTabSessionId(activeTab) === sessionId) resetSessionWorkspaceLayout()
  }

  async function handleArchiveWorkspaceSession(sessionId: string): Promise<void> {
    await archiveWorkspaceSession(sessionId)
    if (getTabSessionId(activeTab) === sessionId) resetSessionWorkspaceLayout()
  }

  async function handleDeleteWorkspaceSession(sessionId: string): Promise<void> {
    if (!window.confirm('Delete this workspace session permanently? This cannot be undone.')) return
    await deleteWorkspaceSession(sessionId)
    if (getTabSessionId(activeTab) === sessionId) resetSessionWorkspaceLayout()
  }

  async function handleArchiveProject(project: Project): Promise<void> {
    await archiveProject(project.id)
    await refreshSessions()
    if (activeProject?.id === project.id || activeProjectSession?.projectId === project.id) {
      resetSessionWorkspaceLayout()
    }
  }

  async function handleDeleteProject(project: Project): Promise<void> {
    if (
      !window.confirm(
        `Delete ${project.name} and all of its sessions permanently? This cannot be undone.`
      )
    )
      return
    await deleteProject(project.id)
    await refreshSessions()
    if (activeProject?.id === project.id || activeProjectSession?.projectId === project.id) {
      resetSessionWorkspaceLayout()
    }
  }

  const gridTemplateColumns = [isLeftPanelOpen ? `${leftPanelWidth}px 4px` : '', 'minmax(0, 1fr)']
    .filter(Boolean)
    .join(' ')

  const titlebarGridTemplateColumns = [
    isLeftPanelOpen ? `${leftPanelWidth}px` : 'minmax(0, 1fr)',
    'minmax(0, 1fr)',
    '48px'
  ].join(' ')

  return (
    <div className="flex h-screen min-h-screen flex-col bg-background text-foreground">
      <header
        className="app-titlebar grid h-12 items-stretch bg-background"
        style={{ gridTemplateColumns: titlebarGridTemplateColumns }}
      >
        <div
          className={cn(
            'flex items-center justify-start px-3',
            isLeftPanelOpen ? 'border-r border-sidebar-border bg-sidebar' : 'bg-background'
          )}
        >
          <div className="mac-traffic-light-space shrink-0" />
          <div className="titlebar-control flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={
                isLeftPanelOpen ? t('workspace.hideLeftPanel') : t('workspace.showLeftPanel')
              }
              aria-pressed={isLeftPanelOpen}
              onClick={toggleLeftPanel}
            >
              <Sidebar className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={t('app.openCommandPalette')}
              onClick={() => commandPalette.open()}
            >
              <MagnifyingGlass className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="flex h-full w-full items-center justify-start px-3">
          <WorkspaceBreadcrumb
            knowledgeBaseActive={activePrimaryView === 'knowledge-base'}
            project={activeSessionProject ?? activeProject}
            projectSession={activeProjectSession}
            workspaceSession={activeWorkspaceSession}
            onOpenProjectSessionSource={handleOpenSessionSource}
          />
        </div>

        <div className="flex h-full w-full items-center justify-end px-2">
          <ToolPaneToggleButton configuration={toolPaneConfiguration} />
        </div>
      </header>

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns }}>
        {isLeftPanelOpen ? (
          <AppSidebar
            aria-label={t('workspace.leftPanel')}
            className="pt-4"
            contentClassName="px-0 overflow-hidden"
            header={
              <SidebarMenu className="px-0" aria-label={t('workspace.navigation')} role="menu">
                <SidebarNavItem
                  icon={BookOpenText}
                  label="Knowledge Base"
                  active={activePrimaryView === 'knowledge-base'}
                  onClick={() => setActivePrimaryView('knowledge-base')}
                />
                <SidebarNavItem
                  icon={PaperPlaneTilt}
                  label={t('workspace.sidebar.newAgent')}
                  active={activePrimaryView === 'workspace' && activeTab?.kind === 'workspace'}
                  onClick={() => void handleNewWorkspaceSession()}
                />
                <SidebarNavItem icon={MagnifyingGlass} label={t('workspace.sidebar.search')} />
                <SidebarNavItem icon={CalendarBlank} label={t('workspace.sidebar.automations')} />
                <SidebarNavItem icon={SquaresFour} label={t('workspace.sidebar.customize')} />
              </SidebarMenu>
            }
            footer={<AccountMenu settingsLabel={t('workspace.openAppSettings')} />}
          >
            <SidebarGroup
              className="mt-8 shrink-0"
              aria-label={t('sessions.workspaceList.sectionLabel')}
            >
              <SidebarSectionHeader
                label={t('sessions.workspaceList.sectionLabel')}
                expandable
                expanded={isWorkspaceSessionsExpanded}
                onToggle={() => setWorkspaceSessionsExpanded((expanded) => !expanded)}
              />
              {isWorkspaceSessionsExpanded ? (
                <WorkspaceSessionList
                  workspaceSessions={workspaceSessions}
                  activeSessionId={activeWorkspaceSession?.id ?? null}
                  status={workspaceSessionsStatus}
                  error={workspaceSessionsError}
                  onSelectSession={openWorkspaceSession}
                  onArchiveSession={(session) => void handleArchiveWorkspaceSession(session.id)}
                  onDeleteSession={(session) => void handleDeleteWorkspaceSession(session.id)}
                />
              ) : null}
            </SidebarGroup>

            <SidebarGroup
              className="min-h-0 flex-1 overflow-hidden"
              aria-label={t('projects.sidebar.label')}
            >
              <SidebarSectionHeader
                label={t('projects.sidebar.label')}
                expandable
                expanded={isProjectsExpanded}
                onToggle={() => setProjectsExpanded((expanded) => !expanded)}
                actions={[
                  { label: t('projects.sidebar.filter'), icon: FunnelSimple },
                  {
                    label: t('projects.sidebar.add'),
                    icon: FolderPlus,
                    onClick: () => setAddProjectOpen(true)
                  }
                ]}
              />
              {isProjectsExpanded ? (
                <div className="min-h-0 flex-1 overflow-auto">
                  <ProjectSidebarList
                    projects={projects}
                    activeProject={activeProject}
                    status={projectsStatus}
                    error={projectsError}
                    onAddProject={() => setAddProjectOpen(true)}
                    onSelectProject={(project) => {
                      runInWorkspaceView(() => {
                        setProjectHomeRequest(null)
                        selectProject(project)
                        if (activeProjectSession?.projectId !== project.id) {
                          resetSessionWorkspaceLayout()
                        }
                      })
                    }}
                    onEditProject={setEditingProject}
                    onArchiveProject={(project) => void handleArchiveProject(project)}
                    onDeleteProject={(project) => void handleDeleteProject(project)}
                    sessionsByProjectId={sessionsByProjectId}
                    activeSessionId={activeProjectSession?.id ?? null}
                    sessionsStatus={sessionsStatus}
                    sessionsError={sessionsError}
                    onNewSession={(project) => {
                      setSidebarSessionError(null)
                      void handleNewSession(project).catch((error) => {
                        setSidebarSessionError(projectSessionSetupErrorMessage(error))
                      })
                    }}
                    onSelectSession={handleSelectSession}
                    onArchiveSession={(session) => void handleArchiveSession(session.id)}
                    onDeleteSession={(session) => void handleDeleteSession(session.id)}
                  />
                </div>
              ) : null}
            </SidebarGroup>

            <AddProjectDialog
              open={isAddProjectOpen}
              onOpenChange={setAddProjectOpen}
              onCreateEmptyProject={createEmptyProject}
              onAddFromFolder={addProjectFromFolder}
              onGitHubProjectReady={handleGitHubProjectReady}
            />
            <EditProjectDialog
              key={editingProject?.id ?? 'no-project'}
              open={editingProject !== null}
              project={editingProject}
              onOpenChange={(open) => {
                if (!open) setEditingProject(null)
              }}
              onUpdateProject={updateProject}
            />
          </AppSidebar>
        ) : null}

        {isLeftPanelOpen ? (
          <ResizeHandle
            label={t('workspace.resizeLeftPanel')}
            value={leftPanelWidth}
            onPointerDown={leftPanelResize.startResize}
            onKeyDown={leftPanelResize.resizeWithKeyboard}
          />
        ) : null}

        <section
          aria-label={t('workspace.mainLabel')}
          className="flex min-h-0 min-w-0 flex-col bg-background"
          role="main"
        >
          {projectsWarning ? (
            <Alert className="m-4 mb-0 w-auto">
              <AlertDescription>{projectsWarning}</AlertDescription>
            </Alert>
          ) : null}
          {sidebarSessionError ? (
            <Alert className="m-4 mb-0 w-auto" variant="destructive">
              <AlertDescription>{sidebarSessionError}</AlertDescription>
            </Alert>
          ) : null}
          {activePrimaryView === 'knowledge-base' ? (
            toolPaneConfiguration ? (
              <ToolPaneShell {...toolPaneConfiguration}>
                <KnowledgeBasePage onConfiguredChange={setKnowledgeBaseConfigured} />
              </ToolPaneShell>
            ) : (
              <KnowledgeBasePage onConfiguredChange={setKnowledgeBaseConfigured} />
            )
          ) : activeTab ? (
            toolPaneConfiguration ? (
              <ToolPaneShell {...toolPaneConfiguration}>
                <SessionWorkspaceTabSurface
                  tab={activeTab}
                  projects={projects}
                  sessions={sessions}
                />
              </ToolPaneShell>
            ) : (
              <SessionWorkspaceTabSurface tab={activeTab} projects={projects} sessions={sessions} />
            )
          ) : activeProject ? (
            <ProjectHome
              key={`${activeProject.id}:${activeProject.updatedAt}:${projectHomeRequest?.requestId ?? 'default'}`}
              project={activeProject}
              onProjectLinked={upsertProject}
              onNewSession={() => handleNewSession(activeProject)}
              onSessionCreated={(session) => void handleGitHubSessionCreated(session)}
              initialGitHubTarget={
                projectHomeRequest?.projectId === activeProject.id ? projectHomeRequest : null
              }
            />
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed bg-card p-8 text-center">
              <div>
                <h2 className="text-sm font-medium">{t('sessions.workspace.emptyTitle')}</h2>
                <p className="mt-2 max-w-sm text-xs text-muted-foreground">
                  {t('sessions.workspace.emptyDescription')}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function getTabSessionId(tab: SessionWorkspaceTab | null | undefined): string | null {
  if (!tab) return null
  return tab.kind === 'project' ? tab.sessionId : tab.session.id
}

function SessionWorkspaceTabSurface({
  tab,
  projects,
  sessions
}: {
  tab: SessionWorkspaceTab
  projects: Project[]
  sessions: ProjectSession[]
}): React.JSX.Element {
  const session =
    tab.kind === 'project' ? (sessions.find((item) => item.id === tab.sessionId) ?? null) : null
  const project = session ? (projects.find((item) => item.id === session.projectId) ?? null) : null
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {tab.kind === 'workspace' ? (
        <WorkspaceSessionHostSurface key={tab.session.id} session={tab.session} />
      ) : session && project ? (
        <ProjectSessionHostSurface key={session.id} project={project} session={session} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
          Session metadata is no longer available.
        </div>
      )}
    </div>
  )
}

function WorkspaceBreadcrumb({
  knowledgeBaseActive,
  project,
  projectSession,
  workspaceSession,
  onOpenProjectSessionSource
}: {
  knowledgeBaseActive: boolean
  project: Project | null
  projectSession: ProjectSession | null
  workspaceSession: WorkspaceSession | null
  onOpenProjectSessionSource: (session: ProjectSession) => void
}): React.JSX.Element {
  return (
    <Breadcrumb>
      <BreadcrumbList className="justify-start text-xs">
        <BreadcrumbItem>
          <BreadcrumbPage>
            {knowledgeBaseActive ? 'Knowledge Base' : (project?.name ?? 'Workspace')}
          </BreadcrumbPage>
        </BreadcrumbItem>
        {projectSession ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{projectSession.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
        {projectSession?.source ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <button
                type="button"
                className="titlebar-control text-primary hover:underline"
                onClick={() => onOpenProjectSessionSource(projectSession)}
              >
                {projectSession.source.type === 'issue' ? 'Issue' : 'Pull Request'} #
                {projectSession.source.number}
              </button>
            </BreadcrumbItem>
          </>
        ) : null}
        {workspaceSession ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{workspaceSession.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

type ResizeHandleProps = {
  label: string
  value: number
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

function ResizeHandle({
  label,
  value,
  onPointerDown,
  onKeyDown
}: ResizeHandleProps): React.JSX.Element {
  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuenow={value}
      className="titlebar-control flex cursor-col-resize items-center justify-center text-muted-foreground/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      role="separator"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    >
      <DotsSixVertical className="h-4 w-3" aria-hidden="true" />
    </div>
  )
}
