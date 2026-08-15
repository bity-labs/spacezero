import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent
} from 'react'
import { CaretDown, PencilSimple } from '@phosphor-icons/react'
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
import type {
  AgentSessionProjectionEvent,
  AgentTranscriptMessage
} from '../../shared/agent-session-projection.model'
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
  syncProjectSessionTabs,
  useProjectSessions,
  useSessionWorkspaceStore,
  type SessionWorkspaceTab
} from '../../features/sessions/renderer'
import {
  createGlobalChatSidePaneConfiguration,
  createKnowledgeBaseSidePaneConfiguration,
  createProjectHomeSidePaneConfiguration,
  createProjectSessionSidePaneConfiguration,
  getRenderedSidePaneWidth,
  SidePaneHeaderControls,
  SIDE_PANE_COLLAPSED_HEADER_WIDTH,
  SIDE_PANE_HANDLE_WIDTH,
  SidePaneShell,
  TerminalSidePaneLifecycle,
  useRegisterTerminalSidePaneCommands,
  useSidePaneController,
  useSidePaneStore,
  type SidePaneConfiguration
} from '../../features/side-pane/renderer'
import { AccountMenu } from './components/app-shell/account-menu'
import {
  WorkspaceEmptyStateView,
  WorkspaceShellLayout
} from './components/app-shell/workspace-shell-layout'
import { WorkspaceSidebar } from './components/app-shell/workspace-sidebar'
import { Alert, AlertDescription } from './components/ui/alert'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from './components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './components/ui/dropdown-menu'
import { useSidebarResize } from './hooks/use-sidebar-resize'
import { useUiLayoutStore } from './stores/ui-layout-store'

const workspaceShortcuts: readonly KeyboardShortcutDefinition[] = [
  { commandId: 'workspace.toggle-left-panel', defaultKeybinding: { normalized: 'mod+b' } },
  { commandId: 'workspace.toggle-side-pane', defaultKeybinding: { normalized: 'mod+shift+b' } }
]

const RESIZE_HANDLE_WIDTH = SIDE_PANE_HANDLE_WIDTH

export function WorkspaceShell(): React.JSX.Element {
  const isLeftPanelOpen = useUiLayoutStore((state) => state.isLeftSidebarOpen)
  const leftPanelWidth = useUiLayoutStore((state) => state.leftSidebarWidth)
  const setLeftPanelWidth = useUiLayoutStore((state) => state.setLeftSidebarWidth)
  const setLeftPanelOpen = useUiLayoutStore((state) => state.setLeftSidebarOpen)
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
  const [sessionStatusOverrides, setSessionStatusOverrides] = useState<
    ReadonlyMap<string, ProjectSession['status']>
  >(new Map())
  const displayedSessions = useMemo(
    () =>
      sessions.map((session) => {
        const status = sessionStatusOverrides.get(session.id)
        return status ? { ...session, status } : session
      }),
    [sessionStatusOverrides, sessions]
  )
  const displayedSessionsByProjectId = useMemo(() => {
    const grouped = new Map<string, ProjectSession[]>()
    for (const session of displayedSessions) {
      grouped.set(session.projectId, [...(grouped.get(session.projectId) ?? []), session])
    }
    return grouped
  }, [displayedSessions])
  const handleSessionStatusChange = useCallback(
    (sessionId: string, status: ProjectSession['status']): void => {
      setSessionStatusOverrides((current) => {
        if (current.get(sessionId) === status) return current
        return new Map(current).set(sessionId, status)
      })
    },
    []
  )
  const agentSessionProjectSessionIds = useRef<ReadonlyMap<string, string>>(new Map())
  const agentSessionActivity = useRef(
    new Map<string, { hasActivity: boolean; hasError: boolean }>()
  )

  useEffect(() => {
    let canceled = false
    const nextMap = new Map<string, string>()

    async function loadProjectSessionChatContexts(): Promise<void> {
      await Promise.all(
        sessions.map(async (session) => {
          try {
            const context = await window.spacezero.sessions.getCurrentProjectChatContext({
              sessionId: session.id
            })
            nextMap.set(context.agentSessionId, session.id)
          } catch {
            nextMap.set(session.id, session.id)
          }
        })
      )
      if (!canceled) agentSessionProjectSessionIds.current = nextMap
    }

    void loadProjectSessionChatContexts()

    return () => {
      canceled = true
    }
  }, [sessions])

  useEffect(() => {
    function handleChatContextChanged(event: Event): void {
      const chatContext = (
        event as CustomEvent<{
          agentSessionId: string
          workspaceContext?: { projectSessionId?: string }
        }>
      ).detail
      const projectSessionId = chatContext?.workspaceContext?.projectSessionId
      if (!chatContext?.agentSessionId || !projectSessionId) return
      agentSessionProjectSessionIds.current = new Map(agentSessionProjectSessionIds.current).set(
        chatContext.agentSessionId,
        projectSessionId
      )
    }

    window.addEventListener(
      'spacezero:project-session-chat-context-changed',
      handleChatContextChanged
    )
    return () =>
      window.removeEventListener(
        'spacezero:project-session-chat-context-changed',
        handleChatContextChanged
      )
  }, [])

  useEffect(() => {
    return window.spacezero.agent.onSessionProjectionEvent((event) => {
      const projectSessionId = resolveProjectSessionIdForAgentEvent(
        event,
        sessions,
        agentSessionProjectSessionIds.current
      )
      if (!projectSessionId) return

      const nextStatus = projectSessionStatusFromProjectionEvent(
        event,
        agentSessionActivity.current
      )
      if (nextStatus) handleSessionStatusChange(projectSessionId, nextStatus)
    })
  }, [handleSessionStatusChange, sessions])

  const syncedSessionWorkspaceLayout = useMemo(
    () => syncProjectSessionTabs(sessionWorkspaceLayout, displayedSessions),
    [sessionWorkspaceLayout, displayedSessions]
  )
  const activeTab = getFocusedSessionTab(syncedSessionWorkspaceLayout)
  const activeProjectSession = activeTab
    ? (displayedSessions.find((session) => session.id === activeTab.sessionId) ?? null)
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

  const sidePaneConfiguration = useMemo<SidePaneConfiguration | null>(() => {
    if (activePrimaryView === 'knowledge-base') {
      return isKnowledgeBaseConfigured ? createKnowledgeBaseSidePaneConfiguration() : null
    }
    if (activePrimaryView === 'global-chat') return createGlobalChatSidePaneConfiguration()
    if (activeProjectSession) return createProjectSessionSidePaneConfiguration(activeProjectSession)
    if (activeProject) return createProjectHomeSidePaneConfiguration(activeProject)
    return null
  }, [activePrimaryView, activeProject, activeProjectSession, isKnowledgeBaseConfigured])
  useRegisterTerminalSidePaneCommands(sidePaneConfiguration)
  const sidePaneController = useSidePaneController(sidePaneConfiguration)
  const openSidePaneCategory = sidePaneController.openCategory
  const toggleSidePane = sidePaneController.toggle
  const savedSidePaneWidth = useSidePaneStore((state) =>
    sidePaneConfiguration ? state.contexts[sidePaneConfiguration.contextKey]?.width : null
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
        id: 'workspace.toggle-side-pane',
        title: 'Toggle Side Pane',
        category: t('appCommands.categories.workspace'),
        keywords: ['side', 'pane', 'tabs'],
        handler: toggleSidePane
      },
      ...(sidePaneConfiguration?.categories
        .filter((sidePaneCategory) => sidePaneCategory.available)
        .map((sidePaneCategory) => ({
          id: `workspace.open-side-pane.${sidePaneCategory.id}`,
          title: `Open ${sidePaneCategory.label} in Side Pane`,
          category: t('appCommands.categories.workspace'),
          keywords: ['side', 'pane', sidePaneCategory.label],
          handler: () => openSidePaneCategory(sidePaneCategory.id)
        })) ?? [])
    ],
    [
      isLeftPanelOpen,
      sidePaneConfiguration,
      openSidePaneCategory,
      toggleSidePane,
      t,
      toggleLeftPanel
    ]
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
    useFilesStore.getState().clearContext(`project:${project.id}`)
    for (const sessionId of deletedSessionIds) {
      useFilesStore.getState().clearContext(sessionId)
    }
    await refreshSessions()
    if (activeProject?.id === project.id || activeProjectSession?.projectId === project.id) {
      resetSessionWorkspaceLayout()
    }
  }

  const sidePaneContainerWidth = Math.max(
    0,
    windowWidth - (isLeftPanelOpen ? leftPanelWidth + RESIZE_HANDLE_WIDTH : 0)
  )
  const sidePaneHeaderWidth = sidePaneController.isOpen
    ? getRenderedSidePaneWidth(sidePaneContainerWidth, savedSidePaneWidth)
    : SIDE_PANE_COLLAPSED_HEADER_WIDTH

  return (
    <>
      <TerminalSidePaneLifecycle />
      <WorkspaceShellLayout
        isLeftSidebarOpen={isLeftPanelOpen}
        leftSidebarWidth={leftPanelWidth}
        sidePaneHeaderWidth={sidePaneHeaderWidth}
        labels={{
          hideLeftSidebar: t('workspace.hideLeftPanel'),
          showLeftSidebar: t('workspace.showLeftPanel'),
          openCommandPalette: t('app.openCommandPalette'),
          mainContent: t('workspace.mainLabel'),
          resizeLeftSidebar: t('workspace.resizeLeftPanel')
        }}
        onToggleLeftSidebar={toggleLeftPanel}
        onOpenCommandPalette={() => commandPalette.open()}
        onResizeLeftSidebarPointerDown={leftPanelResize.startResize}
        onResizeLeftSidebarKeyDown={leftPanelResize.resizeWithKeyboard}
        titlebarCenter={
          <WorkspaceBreadcrumb
            globalChatActive={activePrimaryView === 'global-chat'}
            knowledgeBaseActive={activePrimaryView === 'knowledge-base'}
            project={activeSessionProject ?? activeProject}
            projectSession={activeProjectSession}
            projectSessions={
              activeProjectSession
                ? displayedSessions.filter(
                    (session) => session.projectId === activeProjectSession.projectId
                  )
                : []
            }
            onOpenProjectHome={handleOpenProjectHome}
            onSelectProjectSession={handleSelectSession}
            onOpenProjectSessionSource={handleOpenSessionSource}
            onRenameSession={handleRenameActiveSession}
          />
        }
        sidePaneHeader={<SidePaneHeaderControls configuration={sidePaneConfiguration} />}
        leftSidebar={
          <WorkspaceSidebar
            open={isLeftPanelOpen}
            activeView={activePrimaryView}
            projectsExpanded={isProjectsExpanded}
            labels={{
              sidebar: t('workspace.leftPanel'),
              navigation: t('workspace.navigation'),
              knowledgeBase: 'Knowledge Base',
              globalChat: 'Chat',
              projects: t('projects.sidebar.label'),
              filterProjects: t('projects.sidebar.filter'),
              addProject: t('projects.sidebar.add')
            }}
            onOpenChange={setLeftPanelOpen}
            onSelectKnowledgeBase={() => setActivePrimaryView('knowledge-base')}
            onSelectGlobalChat={() => setActivePrimaryView('global-chat')}
            onToggleProjects={() => setProjectsExpanded((expanded) => !expanded)}
            onFilterProjects={() => undefined}
            onAddProject={() => setAddProjectOpen(true)}
            accountMenu={<AccountMenu settingsLabel={t('workspace.openAppSettings')} />}
            projectsContent={
              <ProjectSidebarList
                projects={projects}
                activeProject={activeProjectSession ? null : activeProject}
                status={projectsStatus}
                error={projectsError}
                onAddProject={() => setAddProjectOpen(true)}
                onSelectProject={handleOpenProjectHome}
                onEditProject={setEditingProject}
                onArchiveProject={(project) => void handleArchiveProject(project)}
                onDeleteProject={(project) => void handleDeleteProject(project)}
                sessionsByProjectId={displayedSessionsByProjectId}
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
            }
            overlays={
              <>
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
              </>
            }
          />
        }
        mainContent={
          <>
            {projectsWarning ? (
              <Alert className="m-4 mb-0 w-auto">
                <AlertDescription>{projectsWarning}</AlertDescription>
              </Alert>
            ) : null}
            {activePrimaryView === 'knowledge-base' ? (
              sidePaneConfiguration ? (
                <SidePaneShell {...sidePaneConfiguration} showInlineHeaderTabs={false}>
                  <KnowledgeBasePage onConfiguredChange={setKnowledgeBaseConfigured} />
                </SidePaneShell>
              ) : (
                <KnowledgeBasePage onConfiguredChange={setKnowledgeBaseConfigured} />
              )
            ) : activePrimaryView === 'global-chat' && sidePaneConfiguration ? (
              <SidePaneShell {...sidePaneConfiguration} showInlineHeaderTabs={false}>
                <GlobalChatPage />
              </SidePaneShell>
            ) : activeTab ? (
              sidePaneConfiguration ? (
                <SidePaneShell {...sidePaneConfiguration} showInlineHeaderTabs={false}>
                  <SessionWorkspaceTabSurface
                    tab={activeTab}
                    projects={projects}
                    sessions={sessions}
                  />
                </SidePaneShell>
              ) : (
                <SessionWorkspaceTabSurface
                  tab={activeTab}
                  projects={projects}
                  sessions={sessions}
                />
              )
            ) : activeProject ? (
              sidePaneConfiguration ? (
                <SidePaneShell {...sidePaneConfiguration} showInlineHeaderTabs={false}>
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
                </SidePaneShell>
              ) : null
            ) : (
              <WorkspaceEmptyStateView
                title={t('sessions.workspace.emptyTitle')}
                description={t('sessions.workspace.emptyDescription')}
              />
            )}
          </>
        }
        overlay={
          sidebarSessionError ? (
            <div
              aria-label="Session rename error"
              className="titlebar-control fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-destructive/40 bg-destructive px-4 py-3 text-sm text-destructive-foreground shadow-lg"
              role="alert"
            >
              {sidebarSessionError}
            </div>
          ) : null
        }
      />
    </>
  )
}

function getTabSessionId(tab: SessionWorkspaceTab | null | undefined): string | null {
  return tab?.sessionId ?? null
}

function resolveProjectSessionIdForAgentEvent(
  event: AgentSessionProjectionEvent,
  sessions: readonly ProjectSession[],
  agentSessionProjectSessionIds: ReadonlyMap<string, string>
): string | null {
  return (
    agentSessionProjectSessionIds.get(event.sessionId) ??
    sessions.find((session) => session.id === event.sessionId)?.id ??
    null
  )
}

function projectSessionStatusFromProjectionEvent(
  event: AgentSessionProjectionEvent,
  activityByAgentSessionId: Map<string, { hasActivity: boolean; hasError: boolean }>
): ProjectSession['status'] | null {
  const activity = activityByAgentSessionId.get(event.sessionId) ?? {
    hasActivity: false,
    hasError: false
  }

  if (event.type === 'snapshot') {
    activityByAgentSessionId.set(event.sessionId, {
      hasActivity: event.snapshot.messages.length > 0,
      hasError: Boolean(event.snapshot.lastError)
    })
    if (event.snapshot.status === 'running') return 'running'
    if (event.snapshot.lastError) return 'failed'
    return event.snapshot.messages.length > 0 ? 'completed' : 'idle'
  }

  if (event.type === 'agent_start') {
    activityByAgentSessionId.set(event.sessionId, { hasActivity: true, hasError: false })
    return 'running'
  }

  if (event.type === 'error') {
    activityByAgentSessionId.set(event.sessionId, { ...activity, hasError: true })
    return 'failed'
  }

  if (
    event.type === 'message_start' ||
    event.type === 'message_update' ||
    event.type === 'message_end'
  ) {
    activityByAgentSessionId.set(event.sessionId, {
      hasActivity: true,
      hasError: activity.hasError || isErroredAssistantMessage(event.message)
    })
    return null
  }

  if (event.type === 'tool_execution_end') {
    activityByAgentSessionId.set(event.sessionId, {
      hasActivity: true,
      hasError: activity.hasError || event.isError
    })
    return null
  }

  if (event.type === 'tool_execution_start' || event.type === 'tool_execution_update') {
    activityByAgentSessionId.set(event.sessionId, { ...activity, hasActivity: true })
    return null
  }

  if (event.type === 'agent_end') {
    return activity.hasError ? 'failed' : activity.hasActivity ? 'completed' : 'idle'
  }

  return null
}

function isErroredAssistantMessage(message: AgentTranscriptMessage): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    'role' in message &&
    message.role === 'assistant' &&
    (('stopReason' in message && message.stopReason === 'error') ||
      ('errorMessage' in message && Boolean(message.errorMessage)))
  )
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
  const session = sessions.find((item) => item.id === tab.sessionId) ?? null
  const project = session ? (projects.find((item) => item.id === session.projectId) ?? null) : null
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {session && project ? (
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
