import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
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
import type { AppCommand } from '../../features/app-commands/renderer/app-command.model'
import { useCommandPaletteController } from '../../features/command-palette/renderer/command-palette-controller'
import type { KeyboardShortcutDefinition } from '../../features/keyboard-shortcuts/renderer/keyboard-shortcut-manager'
import { useRegisterKeyboardShortcuts } from '../../features/keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import type { Project } from '../../features/projects/shared'
import type { ProjectSession, WorkspaceSession } from '../../features/sessions/shared'
import {
  AddProjectDialog,
  EditProjectDialog,
  ProjectSidebarList,
  useProjects
} from '../../features/projects/renderer'
import {
  ProjectSessionHostSurface,
  WorkspaceSessionHostSurface,
  emptySessionWorkspaceLayout,
  focusSessionTabInLayout,
  getFocusedSessionTab,
  openProjectSessionInLayout,
  openWorkspaceSessionInLayout,
  syncProjectSessionTabs,
  useProjectSessions,
  type SessionWorkspaceLayout,
  type SessionWorkspacePanel,
  type SessionWorkspaceTab
} from '../../features/sessions/renderer'
import { AccountMenu } from './components/app-shell/account-menu'
import { type AiChatThinkingLevel } from './components/ai-chat'
import { AppSidebar } from './components/sidebar/app-sidebar'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from './components/sidebar/sidebar-layout'
import { SidebarNavItem } from './components/sidebar/sidebar-nav-item'
import { SidebarSectionHeader } from './components/sidebar/sidebar-section-header'
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
  { commandId: 'workspace.toggle-right-panel', defaultKeybinding: { normalized: 'mod+shift+b' } }
]

function createWorkspaceSession(): WorkspaceSession {
  const now = new Date().toISOString()

  return {
    id: `workspace-session-${Date.now()}`,
    kind: 'workspace',
    title: 'Workspace Session',
    status: 'idle',
    createdAt: now,
    updatedAt: now
  }
}

export function WorkspaceShell(): React.JSX.Element {
  const isLeftPanelOpen = useUiLayoutStore((state) => state.isLeftSidebarOpen)
  const isRightPanelOpen = useUiLayoutStore((state) => state.isRightSidebarOpen)
  const leftPanelWidth = useUiLayoutStore((state) => state.leftSidebarWidth)
  const rightPanelWidth = useUiLayoutStore((state) => state.rightSidebarWidth)
  const setLeftPanelWidth = useUiLayoutStore((state) => state.setLeftSidebarWidth)
  const setRightPanelWidth = useUiLayoutStore((state) => state.setRightSidebarWidth)
  const toggleLeftPanel = useUiLayoutStore((state) => state.toggleLeftSidebar)
  const toggleRightPanel = useUiLayoutStore((state) => state.toggleRightSidebar)
  const leftPanelResize = useSidebarResize({
    side: 'left',
    width: leftPanelWidth,
    setWidth: setLeftPanelWidth
  })
  const rightPanelResize = useSidebarResize({
    side: 'right',
    width: rightPanelWidth,
    setWidth: setRightPanelWidth
  })
  const commandPalette = useCommandPaletteController()
  const { t } = useTranslation()
  const [isAddProjectOpen, setAddProjectOpen] = useState(false)
  const [isProjectsExpanded, setProjectsExpanded] = useState(true)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [debugThinkingLevel, setDebugThinkingLevel] = useState<AiChatThinkingLevel>('medium')
  const [sessionWorkspaceLayout, setSessionWorkspaceLayout] = useState<SessionWorkspaceLayout>(
    emptySessionWorkspaceLayout
  )
  const {
    projects,
    activeProject,
    status: projectsStatus,
    error: projectsError,
    selectProject,
    createEmptyProject,
    addProjectFromFolder,
    updateProject
  } = useProjects()
  const {
    sessions,
    sessionsByProjectId,
    status: sessionsStatus,
    error: sessionsError,
    createProjectSession
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
        id: 'workspace.toggle-right-panel',
        title: isRightPanelOpen ? t('workspace.hideRightPanel') : t('workspace.showRightPanel'),
        category: t('appCommands.categories.workspace'),
        keywords: ['sidebar', 'inspector'],
        handler: toggleRightPanel
      },
      {
        id: 'workspace.open-workspace-session',
        title: t('workspace.sidebar.newAgent'),
        category: t('appCommands.categories.workspace'),
        keywords: ['agent', 'global', 'workspace session'],
        handler: () =>
          setSessionWorkspaceLayout((layout) =>
            openWorkspaceSessionInLayout(layout, createWorkspaceSession())
          )
      }
    ],
    [isLeftPanelOpen, isRightPanelOpen, t, toggleLeftPanel, toggleRightPanel]
  )

  useRegisterAppCommands(workspaceCommands)
  useRegisterKeyboardShortcuts(workspaceShortcuts)

  function openProjectSession(session: ProjectSession): void {
    setSessionWorkspaceLayout((layout) => openProjectSessionInLayout(layout, session))
  }

  function openWorkspaceSession(session: WorkspaceSession): void {
    setSessionWorkspaceLayout((layout) => openWorkspaceSessionInLayout(layout, session))
  }

  async function handleNewSession(project: Project): Promise<void> {
    selectProject(project)
    const session = await createProjectSession({ projectId: project.id })
    openProjectSession(session)
  }

  function handleSelectSession(session: ProjectSession): void {
    const sessionProject = projects.find((project) => project.id === session.projectId)
    if (sessionProject) selectProject(sessionProject)
    openProjectSession(session)
  }

  const gridTemplateColumns = [
    isLeftPanelOpen ? `${leftPanelWidth}px 4px` : '',
    'minmax(0, 1fr)',
    isRightPanelOpen ? `4px ${rightPanelWidth}px` : ''
  ]
    .filter(Boolean)
    .join(' ')

  const titlebarGridTemplateColumns = [
    isLeftPanelOpen ? `${leftPanelWidth}px` : 'minmax(0, 1fr)',
    'minmax(0, 1fr)',
    isRightPanelOpen ? `${rightPanelWidth}px` : 'minmax(0, 1fr)'
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
            project={activeSessionProject ?? activeProject}
            projectSession={activeProjectSession}
            workspaceSession={activeWorkspaceSession}
          />
        </div>

        <div
          className={cn(
            'flex h-full w-full items-center justify-end px-3',
            isRightPanelOpen ? 'border-l border-sidebar-border bg-sidebar' : 'bg-background'
          )}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className="titlebar-control text-muted-foreground"
            aria-label={
              isRightPanelOpen ? t('workspace.hideRightPanel') : t('workspace.showRightPanel')
            }
            aria-pressed={isRightPanelOpen}
            onClick={toggleRightPanel}
          >
            <Sidebar className="h-4 w-4 rotate-180" />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns }}>
        {isLeftPanelOpen ? (
          <AppSidebar
            aria-label={t('workspace.leftPanel')}
            className="pt-4"
            contentClassName="px-0 overflow-hidden"
            header={
              <SidebarMenu className="px-0" aria-label={t('workspace.navigation')}>
                <SidebarNavItem
                  icon={PaperPlaneTilt}
                  label={t('workspace.sidebar.newAgent')}
                  active={activeTab?.kind === 'workspace'}
                  onClick={() => openWorkspaceSession(createWorkspaceSession())}
                />
                <SidebarNavItem icon={MagnifyingGlass} label={t('workspace.sidebar.search')} />
                <SidebarNavItem icon={CalendarBlank} label={t('workspace.sidebar.automations')} />
                <SidebarNavItem icon={SquaresFour} label={t('workspace.sidebar.customize')} />
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
                      selectProject(project)
                      if (activeProjectSession?.projectId !== project.id) {
                        setSessionWorkspaceLayout(emptySessionWorkspaceLayout)
                      }
                    }}
                    onEditProject={setEditingProject}
                    sessionsByProjectId={sessionsByProjectId}
                    activeSessionId={activeProjectSession?.id ?? null}
                    sessionsStatus={sessionsStatus}
                    sessionsError={sessionsError}
                    onNewSession={(project) => void handleNewSession(project)}
                    onSelectSession={handleSelectSession}
                  />
                </div>
              ) : null}
            </SidebarGroup>

            <AddProjectDialog
              open={isAddProjectOpen}
              onOpenChange={setAddProjectOpen}
              onCreateEmptyProject={createEmptyProject}
              onAddFromFolder={addProjectFromFolder}
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
          className="flex min-h-0 min-w-0 flex-col gap-4 bg-background p-4"
          role="main"
        >
          {syncedSessionWorkspaceLayout.panels.length > 0 ? (
            <SessionWorkspacePanels
              layout={syncedSessionWorkspaceLayout}
              projects={projects}
              sessions={sessions}
              thinkingLevel={debugThinkingLevel}
              onThinkingChange={setDebugThinkingLevel}
              onFocusTab={(panelId, tabId) =>
                setSessionWorkspaceLayout((layout) =>
                  focusSessionTabInLayout(layout, panelId, tabId)
                )
              }
            />
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed bg-card p-8 text-center">
              <div>
                <h2 className="text-sm font-medium">
                  {activeProject
                    ? t('sessions.workspace.emptyProjectTitle', { project: activeProject.name })
                    : t('sessions.workspace.emptyTitle')}
                </h2>
                <p className="mt-2 max-w-sm text-xs text-muted-foreground">
                  {activeProject
                    ? t('sessions.workspace.emptyProjectDescription')
                    : t('sessions.workspace.emptyDescription')}
                </p>
              </div>
            </div>
          )}
        </section>

        {isRightPanelOpen ? (
          <ResizeHandle
            label={t('workspace.resizeRightPanel')}
            value={rightPanelWidth}
            onPointerDown={rightPanelResize.startResize}
            onKeyDown={rightPanelResize.resizeWithKeyboard}
          />
        ) : null}

        {isRightPanelOpen ? (
          <aside
            aria-label={t('workspace.rightPanel')}
            className="min-w-0 border-l border-sidebar-border bg-sidebar p-4 text-sidebar-foreground"
          >
            <h2 className="text-sm font-medium">{t('workspace.rightPanel')}</h2>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

function SessionWorkspacePanels({
  layout,
  projects,
  sessions,
  thinkingLevel,
  onThinkingChange,
  onFocusTab
}: {
  layout: SessionWorkspaceLayout
  projects: Project[]
  sessions: ProjectSession[]
  thinkingLevel: AiChatThinkingLevel
  onThinkingChange: (level: AiChatThinkingLevel) => void
  onFocusTab: (panelId: string, tabId: string) => void
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'grid min-h-0 flex-1 gap-4',
        layout.panels.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
      )}
    >
      {layout.panels.map((panel, index) => (
        <SessionWorkspacePanelView
          key={panel.id}
          panel={panel}
          panelIndex={index}
          focused={layout.focusedPanelId === panel.id}
          projects={projects}
          sessions={sessions}
          thinkingLevel={thinkingLevel}
          onThinkingChange={onThinkingChange}
          onFocusTab={(tabId) => onFocusTab(panel.id, tabId)}
        />
      ))}
    </div>
  )
}

function SessionWorkspacePanelView({
  panel,
  panelIndex,
  focused,
  projects,
  sessions,
  thinkingLevel,
  onThinkingChange,
  onFocusTab
}: {
  panel: SessionWorkspacePanel
  panelIndex: number
  focused: boolean
  projects: Project[]
  sessions: ProjectSession[]
  thinkingLevel: AiChatThinkingLevel
  onThinkingChange: (level: AiChatThinkingLevel) => void
  onFocusTab: (tabId: string) => void
}): React.JSX.Element {
  const activeTab = panel.tabs.find((tab) => tab.id === panel.activeTabId) ?? panel.tabs[0]

  return (
    <section
      aria-label={`Session panel ${panelIndex + 1}`}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card',
        focused ? 'ring-1 ring-ring' : null
      )}
    >
      <div
        className="flex shrink-0 items-center gap-1 border-b bg-muted/30 px-2 py-1"
        role="tablist"
      >
        {panel.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-selected={tab.id === activeTab.id}
            className={cn(
              'min-w-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground',
              tab.id === activeTab.id ? 'bg-background text-foreground shadow-sm' : null
            )}
            role="tab"
            onClick={() => onFocusTab(tab.id)}
          >
            <span className="truncate">{tab.title}</span>
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col" role="tabpanel">
        <SessionWorkspaceTabSurface
          tab={activeTab}
          projects={projects}
          sessions={sessions}
          thinkingLevel={thinkingLevel}
          onThinkingChange={onThinkingChange}
        />
      </div>
    </section>
  )
}

function SessionWorkspaceTabSurface({
  tab,
  projects,
  sessions,
  thinkingLevel,
  onThinkingChange
}: {
  tab: SessionWorkspaceTab
  projects: Project[]
  sessions: ProjectSession[]
  thinkingLevel: AiChatThinkingLevel
  onThinkingChange: (level: AiChatThinkingLevel) => void
}): React.JSX.Element {
  const session =
    tab.kind === 'project' ? (sessions.find((item) => item.id === tab.sessionId) ?? null) : null
  const project = session ? (projects.find((item) => item.id === session.projectId) ?? null) : null
  const status = tab.kind === 'project' ? (session?.status ?? tab.status) : tab.session.status

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{tab.title}</h2>
          <p className="text-xs text-muted-foreground">
            {tab.kind === 'project' && project ? project.name : 'Workspace'} session
          </p>
        </div>
        <div
          aria-label={status === 'running' ? 'Running' : 'Idle'}
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            status === 'running'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'bg-muted text-muted-foreground'
          )}
          role="status"
        >
          {status === 'running' ? 'Running' : 'Idle'}
        </div>
      </div>
      {tab.kind === 'workspace' ? (
        <WorkspaceSessionHostSurface
          key={tab.session.id}
          session={tab.session}
          thinkingLevel={thinkingLevel}
          onThinkingChange={onThinkingChange}
        />
      ) : session && project ? (
        <ProjectSessionHostSurface
          key={session.id}
          project={project}
          session={session}
          thinkingLevel={thinkingLevel}
          onThinkingChange={onThinkingChange}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
          Session metadata is no longer available.
        </div>
      )}
    </div>
  )
}

function WorkspaceBreadcrumb({
  project,
  projectSession,
  workspaceSession
}: {
  project: Project | null
  projectSession: ProjectSession | null
  workspaceSession: WorkspaceSession | null
}): React.JSX.Element {
  return (
    <Breadcrumb>
      <BreadcrumbList className="justify-start text-xs">
        <BreadcrumbItem>
          <BreadcrumbPage>{project?.name ?? 'Workspace'}</BreadcrumbPage>
        </BreadcrumbItem>
        {projectSession ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{projectSession.title}</BreadcrumbPage>
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
