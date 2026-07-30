import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent
} from 'react'
import {
  BookOpenText,
  CaretDown,
  DotsSixVertical,
  FolderPlus,
  FunnelSimple,
  MagnifyingGlass,
  PaperPlaneTilt,
  PencilSimple,
  Sidebar
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { useRegisterAppCommands } from '../../features/app-commands/renderer/app-command-context'
import { useFilesStore } from '../../features/files/renderer/files-store'
import { KnowledgeBasePage } from '../../features/knowledge-base/renderer'
import type { AppCommand } from '../../features/app-commands/renderer/app-command.model'
import { useCommandPaletteController } from '../../features/command-palette/renderer/command-palette-controller'
import type { KeyboardShortcutDefinition } from '../../features/keyboard-shortcuts/renderer/keyboard-shortcut-manager'
import { useRegisterKeyboardShortcuts } from '../../features/keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import type { Project } from '../../features/projects/shared'
import type { ProjectSession } from '../../features/sessions/shared'
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
  GlobalChatPage,
  ProjectSessionHostSurface,
  getFocusedSessionTab,
  syncSessionTabs,
  useProjectSessions,
  useSessionWorkspaceStore,
  type SessionWorkspaceTab
} from '../../features/sessions/renderer'
import {
  createGlobalChatToolPaneConfiguration,
  createKnowledgeBaseToolPaneConfiguration,
  createProjectHomeToolPaneConfiguration,
  createProjectSessionToolPaneConfiguration,
  getRenderedToolPaneWidth,
  ToolPaneHeaderControls,
  TOOL_PANE_COLLAPSED_HEADER_WIDTH,
  TOOL_PANE_HANDLE_WIDTH,
  ToolPaneShell,
  useToolPaneController,
  useToolPaneStore,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './components/ui/dropdown-menu'
import { SidebarGroup, SidebarMenu } from './components/ui/sidebar'
import { useSidebarResize } from './hooks/use-sidebar-resize'
import { cn } from './lib/utils'
import { useUiLayoutStore } from './stores/ui-layout-store'

const workspaceShortcuts: readonly KeyboardShortcutDefinition[] = [
  { commandId: 'workspace.toggle-left-panel', defaultKeybinding: { normalized: 'mod+b' } },
  { commandId: 'workspace.toggle-tool-pane', defaultKeybinding: { normalized: 'mod+shift+b' } }
]

const RESIZE_HANDLE_WIDTH = TOOL_PANE_HANDLE_WIDTH

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
  const [activePrimaryView, setActivePrimaryView] = useState<
    'workspace' | 'global-chat' | 'knowledge-base'
  >('workspace')
  const [isKnowledgeBaseConfigured, setKnowledgeBaseConfigured] = useState(false)
  const [isProjectsExpanded, setProjectsExpanded] = useState(true)
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
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
    sessions,
    sessionsByProjectId,
    status: sessionsStatus,
    error: sessionsError,
    refreshSessions,
    upsertProjectSession,
    renameProjectSession,
    archiveSession,
    deleteSession
  } = useProjectSessions()
  const syncedSessionWorkspaceLayout = useMemo(
    () => syncSessionTabs(sessionWorkspaceLayout, sessions, []),
    [sessionWorkspaceLayout, sessions]
  )
  const activeTab = getFocusedSessionTab(syncedSessionWorkspaceLayout)
  const activeProjectSession =
    activeTab?.kind === 'project'
      ? (sessions.find((session) => session.id === activeTab.sessionId) ?? null)
      : null
  const activeSessionProject = activeProjectSession
    ? (projects.find((project) => project.id === activeProjectSession.projectId) ?? null)
    : null
  useLayoutEffect(() => {
    function updateWindowWidth(): void {
      setWindowWidth(window.innerWidth)
    }

    window.addEventListener('resize', updateWindowWidth)
    updateWindowWidth()
    return () => window.removeEventListener('resize', updateWindowWidth)
  }, [])

  const toolPaneConfiguration = useMemo<ToolPaneConfiguration | null>(() => {
    if (activePrimaryView === 'knowledge-base') {
      return isKnowledgeBaseConfigured ? createKnowledgeBaseToolPaneConfiguration() : null
    }
    if (activePrimaryView === 'global-chat') return createGlobalChatToolPaneConfiguration()
    if (activeProjectSession) return createProjectSessionToolPaneConfiguration(activeProjectSession)
    if (activeProject) return createProjectHomeToolPaneConfiguration(activeProject)
    return null
  }, [activePrimaryView, activeProject, activeProjectSession, isKnowledgeBaseConfigured])
  const toolPaneController = useToolPaneController(toolPaneConfiguration)
  const savedToolPaneWidth = useToolPaneStore((state) =>
    toolPaneConfiguration ? state.contexts[toolPaneConfiguration.contextKey]?.width : null
  )

  const runInWorkspaceView = useCallback((action: () => void | Promise<void>): void => {
    setActivePrimaryView('workspace')
    void action()
  }, [])

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
      }
    ],
    [isLeftPanelOpen, t, toolPaneController.toggle, toggleLeftPanel]
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

  function handleOpenProjectHome(project: Project): void {
    runInWorkspaceView(() => {
      setProjectHomeRequest(null)
      selectProject(project)
      resetSessionWorkspaceLayout()
    })
  }

  async function handleArchiveSession(sessionId: string): Promise<void> {
    await archiveSession(sessionId)
    if (getTabSessionId(activeTab) === sessionId) resetSessionWorkspaceLayout()
  }

  async function handleDeleteSession(sessionId: string): Promise<void> {
    if (!window.confirm('Delete this session permanently? This cannot be undone.')) return
    await deleteSession(sessionId)
    useFilesStore.getState().clearContext(sessionId)
    if (getTabSessionId(activeTab) === sessionId) resetSessionWorkspaceLayout()
  }

  async function handleRenameProjectSession(session: ProjectSession, title: string): Promise<void> {
    setSidebarSessionError(null)
    try {
      await renameProjectSession(session.id, title)
    } catch (error) {
      setSidebarSessionError(sessionRenameErrorMessage(error))
      throw error
    }
  }

  async function handleRenameActiveSession(title: string): Promise<void> {
    if (activeProjectSession) await handleRenameProjectSession(activeProjectSession, title)
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
    const { deletedSessionIds } = await deleteProject(project.id)
    for (const sessionId of deletedSessionIds) {
      useFilesStore.getState().clearContext(sessionId)
    }
    await refreshSessions()
    if (activeProject?.id === project.id || activeProjectSession?.projectId === project.id) {
      resetSessionWorkspaceLayout()
    }
  }

  const gridTemplateColumns = [isLeftPanelOpen ? `${leftPanelWidth}px 4px` : '', 'minmax(0, 1fr)']
    .filter(Boolean)
    .join(' ')

  const toolPaneContainerWidth = Math.max(
    0,
    windowWidth - (isLeftPanelOpen ? leftPanelWidth + RESIZE_HANDLE_WIDTH : 0)
  )
  const toolPaneHeaderWidth = toolPaneController.isOpen
    ? `${getRenderedToolPaneWidth(toolPaneContainerWidth, savedToolPaneWidth)}px`
    : `${TOOL_PANE_COLLAPSED_HEADER_WIDTH}px`
  const titlebarGridTemplateColumns = [
    isLeftPanelOpen ? `${leftPanelWidth}px` : 'minmax(0, 1fr)',
    'minmax(0, 1fr)',
    toolPaneHeaderWidth
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
            globalChatActive={activePrimaryView === 'global-chat'}
            knowledgeBaseActive={activePrimaryView === 'knowledge-base'}
            project={activeSessionProject ?? activeProject}
            projectSession={activeProjectSession}
            projectSessions={
              activeProjectSession
                ? sessions.filter((session) => session.projectId === activeProjectSession.projectId)
                : []
            }
            onOpenProjectHome={handleOpenProjectHome}
            onSelectProjectSession={handleSelectSession}
            onOpenProjectSessionSource={handleOpenSessionSource}
            onRenameSession={handleRenameActiveSession}
          />
        </div>

        <div className="flex h-full w-full min-w-0 items-center">
          <ToolPaneHeaderControls configuration={toolPaneConfiguration} />
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
                  label="Chat"
                  active={activePrimaryView === 'global-chat'}
                  onClick={() => setActivePrimaryView('global-chat')}
                />
              </SidebarMenu>
            }
            footer={<AccountMenu settingsLabel={t('workspace.openAppSettings')} />}
          >
            <SidebarGroup
              className="mt-8 min-h-0 flex-1 overflow-hidden"
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
                    onRenameSession={(session, title) => handleRenameProjectSession(session, title)}
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
          {activePrimaryView === 'knowledge-base' ? (
            toolPaneConfiguration ? (
              <ToolPaneShell {...toolPaneConfiguration} showInlineHeaderSwitcher={false}>
                <KnowledgeBasePage onConfiguredChange={setKnowledgeBaseConfigured} />
              </ToolPaneShell>
            ) : (
              <KnowledgeBasePage onConfiguredChange={setKnowledgeBaseConfigured} />
            )
          ) : activePrimaryView === 'global-chat' && toolPaneConfiguration ? (
            <ToolPaneShell {...toolPaneConfiguration} showInlineHeaderSwitcher={false}>
              <GlobalChatPage />
            </ToolPaneShell>
          ) : activeTab ? (
            toolPaneConfiguration ? (
              <ToolPaneShell {...toolPaneConfiguration} showInlineHeaderSwitcher={false}>
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
            toolPaneConfiguration ? (
              <ToolPaneShell {...toolPaneConfiguration} showInlineHeaderSwitcher={false}>
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
              </ToolPaneShell>
            ) : null
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
      {sidebarSessionError ? (
        <div
          aria-label="Session rename error"
          className="titlebar-control fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-destructive/40 bg-destructive px-4 py-3 text-sm text-destructive-foreground shadow-lg"
          role="alert"
        >
          {sidebarSessionError}
        </div>
      ) : null}
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
      {tab.kind === 'project' && session && project ? (
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
  globalChatActive,
  knowledgeBaseActive,
  project,
  projectSession,
  projectSessions,
  onOpenProjectHome,
  onSelectProjectSession,
  onOpenProjectSessionSource,
  onRenameSession
}: {
  globalChatActive: boolean
  knowledgeBaseActive: boolean
  project: Project | null
  projectSession: ProjectSession | null
  projectSessions: readonly ProjectSession[]
  onOpenProjectHome: (project: Project) => void
  onSelectProjectSession: (session: ProjectSession) => void
  onOpenProjectSessionSource: (session: ProjectSession) => void
  onRenameSession: (title: string) => Promise<void>
}): React.JSX.Element {
  if (globalChatActive) {
    return (
      <Breadcrumb>
        <BreadcrumbList className="justify-start text-xs">
          <BreadcrumbItem>
            <BreadcrumbPage>Chat</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  if (knowledgeBaseActive) {
    return (
      <Breadcrumb>
        <BreadcrumbList className="justify-start text-xs">
          <BreadcrumbItem>
            <BreadcrumbPage>Knowledge Base</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  const projectSessionOptions = projectSession
    ? projectSessions.filter((session) => session.projectId === projectSession.projectId)
    : []

  return (
    <Breadcrumb>
      <BreadcrumbList className="justify-start text-xs">
        <BreadcrumbItem>
          {project && projectSession ? (
            <button
              type="button"
              className="titlebar-control rounded-sm text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={`Open Project Home for ${project.name}`}
              onClick={() => onOpenProjectHome(project)}
            >
              {project.name}
            </button>
          ) : (
            <BreadcrumbPage>{project?.name ?? 'Workspace'}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {projectSession ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="titlebar-control inline-flex items-center gap-1 rounded-sm text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Switch Project Session"
                  data-session-switch-target="true"
                >
                  <span>{projectSession.title}</span>
                  <CaretDown className="h-3 w-3" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-52" align="start">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Project Sessions
                  </div>
                  {projectSessionOptions.map((session) => {
                    const isActive = session.id === projectSession.id
                    return (
                      <DropdownMenuItem
                        key={session.id}
                        aria-current={isActive ? 'page' : undefined}
                        data-session-switch-target="true"
                        onClick={() => {
                          if (!isActive) onSelectProjectSession(session)
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{session.title}</span>
                        {isActive ? (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Current
                          </span>
                        ) : null}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <InlineSessionTitleEditor
                key={projectSession.id}
                title={projectSession.title}
                label="Rename Project Session"
                onSave={onRenameSession}
                showTitle={false}
              />
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
      </BreadcrumbList>
    </Breadcrumb>
  )
}

const SESSION_SWITCH_TARGET_SELECTOR = '[data-session-switch-target="true"]'

function InlineSessionTitleEditor({
  title,
  label,
  onSave,
  showTitle = true
}: {
  title: string
  label: string
  onSave: (title: string) => Promise<void>
  showTitle?: boolean
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isEditing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(title)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setSaving] = useState(false)

  function startEditing(): void {
    setDraftTitle(title)
    setError(null)
    setEditing(true)
    window.setTimeout(() => inputRef.current?.select(), 0)
  }

  function cancelEditing(): void {
    setDraftTitle(title)
    setError(null)
    setSaving(false)
    setEditing(false)
  }

  async function saveDraft(): Promise<void> {
    const nextTitle = draftTitle.trim()
    if (!nextTitle) {
      setError('Enter a Session title before saving.')
      setDraftTitle(title)
      return
    }
    if (nextTitle === title) {
      cancelEditing()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(nextTitle)
      setEditing(false)
    } catch (error) {
      setDraftTitle(title)
      setError(sessionRenameErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>): void {
    if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.dataset.cancelRename) {
      return
    }
    if (
      event.relatedTarget instanceof HTMLElement &&
      event.relatedTarget.closest(SESSION_SWITCH_TARGET_SELECTOR)
    ) {
      cancelEditing()
      return
    }
    void saveDraft()
  }

  if (isEditing) {
    return (
      <span className="titlebar-control inline-flex min-w-40 items-center gap-1">
        <input
          ref={inputRef}
          aria-label={label}
          className="h-7 min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          disabled={isSaving}
          value={draftTitle}
          onBlur={handleBlur}
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void saveDraft()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelEditing()
            }
          }}
        />
        {error ? (
          <span className="sr-only" role="alert">
            {error}
          </span>
        ) : null}
      </span>
    )
  }

  return (
    <span className="titlebar-control inline-flex items-center gap-1">
      {showTitle ? <BreadcrumbPage>{title}</BreadcrumbPage> : null}
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={label}
        onClick={startEditing}
      >
        <PencilSimple className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  )
}

function sessionRenameErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'Session title is required') {
    return 'Enter a Session title before saving.'
  }
  return 'Unable to rename Session. Check the title and try again.'
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
