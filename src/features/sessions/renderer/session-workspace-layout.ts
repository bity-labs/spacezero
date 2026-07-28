import type { ProjectSession, SessionStatus, WorkspaceSession } from '../shared'

export type ProjectSessionWorkspaceTab = {
  id: string
  kind: 'project'
  sessionId: string
  projectId: string
  title: string
  status: SessionStatus
}

export type WorkspaceSessionWorkspaceTab = {
  id: string
  kind: 'workspace'
  session: WorkspaceSession
  title: string
  status: SessionStatus
}

export type SessionWorkspaceTab = ProjectSessionWorkspaceTab | WorkspaceSessionWorkspaceTab

export type SessionWorkspacePanel = {
  id: string
  tabs: SessionWorkspaceTab[]
  activeTabId: string
}

export type SessionWorkspaceLayout = {
  panels: SessionWorkspacePanel[]
  focusedPanelId: string | null
}

export const emptySessionWorkspaceLayout: SessionWorkspaceLayout = {
  panels: [],
  focusedPanelId: null
}

export function createProjectSessionWorkspaceTab(
  session: ProjectSession
): ProjectSessionWorkspaceTab {
  return {
    id: projectSessionTabId(session.id),
    kind: 'project',
    sessionId: session.id,
    projectId: session.projectId,
    title: session.title,
    status: session.status
  }
}

export function createWorkspaceSessionWorkspaceTab(
  session: WorkspaceSession
): WorkspaceSessionWorkspaceTab {
  return {
    id: workspaceSessionTabId(session.id),
    kind: 'workspace',
    session,
    title: session.title,
    status: session.status
  }
}

export function openProjectSessionInLayout(
  layout: SessionWorkspaceLayout,
  session: ProjectSession
): SessionWorkspaceLayout {
  return openTabInLayout(layout, createProjectSessionWorkspaceTab(session))
}

export function openWorkspaceSessionInLayout(
  layout: SessionWorkspaceLayout,
  session: WorkspaceSession
): SessionWorkspaceLayout {
  return openTabInLayout(layout, createWorkspaceSessionWorkspaceTab(session))
}

export function focusSessionTabInLayout(
  layout: SessionWorkspaceLayout,
  panelId: string,
  tabId: string
): SessionWorkspaceLayout {
  if (
    !layout.panels.some(
      (panel) => panel.id === panelId && panel.tabs.some((tab) => tab.id === tabId)
    )
  ) {
    return layout
  }

  return {
    panels: layout.panels.map((panel) =>
      panel.id === panelId ? { ...panel, activeTabId: tabId } : panel
    ),
    focusedPanelId: panelId
  }
}

export function syncProjectSessionTabs(
  layout: SessionWorkspaceLayout,
  sessions: ProjectSession[]
): SessionWorkspaceLayout {
  return syncSessionTabs(layout, sessions, [])
}

export function syncSessionTabs(
  layout: SessionWorkspaceLayout,
  projectSessions: ProjectSession[],
  workspaceSessions: WorkspaceSession[]
): SessionWorkspaceLayout {
  const projectSessionsById = new Map(projectSessions.map((session) => [session.id, session]))
  const workspaceSessionsById = new Map(workspaceSessions.map((session) => [session.id, session]))

  return {
    ...layout,
    panels: layout.panels.map((panel) => ({
      ...panel,
      tabs: panel.tabs.map((tab) => {
        if (tab.kind === 'project') {
          const session = projectSessionsById.get(tab.sessionId)
          return session ? createProjectSessionWorkspaceTab(session) : tab
        }
        const session = workspaceSessionsById.get(tab.session.id)
        return session ? createWorkspaceSessionWorkspaceTab(session) : tab
      })
    }))
  }
}

export function getFocusedSessionTab(layout: SessionWorkspaceLayout): SessionWorkspaceTab | null {
  const panel = layout.panels.find((candidate) => candidate.id === layout.focusedPanelId)
  return panel?.tabs.find((tab) => tab.id === panel.activeTabId) ?? null
}

function openTabInLayout(
  _layout: SessionWorkspaceLayout,
  tab: SessionWorkspaceTab
): SessionWorkspaceLayout {
  const panel = createPanel(tab, 1)
  return { panels: [panel], focusedPanelId: panel.id }
}

function createPanel(tab: SessionWorkspaceTab, index: number): SessionWorkspacePanel {
  return {
    id: `session-panel-${index}`,
    tabs: [tab],
    activeTabId: tab.id
  }
}

function projectSessionTabId(sessionId: string): string {
  return `project:${sessionId}`
}

function workspaceSessionTabId(sessionId: string): string {
  return `workspace:${sessionId}`
}
