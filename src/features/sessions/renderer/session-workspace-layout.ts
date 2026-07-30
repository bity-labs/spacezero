import type { ProjectSession, SessionStatus } from '../shared'

export type ProjectSessionWorkspaceTab = {
  id: string
  kind: 'project'
  sessionId: string
  projectId: string
  title: string
  status: SessionStatus
}

export type SessionWorkspaceTab = ProjectSessionWorkspaceTab

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

export function openProjectSessionInLayout(
  layout: SessionWorkspaceLayout,
  session: ProjectSession
): SessionWorkspaceLayout {
  return openTabInLayout(layout, createProjectSessionWorkspaceTab(session))
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
  const sessionsById = new Map(sessions.map((session) => [session.id, session]))
  const panels = layout.panels.flatMap((panel) => {
    // Persisted layouts from before Global Chat may still contain ordinary Workspace Session tabs.
    const tabs = panel.tabs
      .filter((tab) => tab.kind === 'project')
      .map((tab) => {
        const session = sessionsById.get(tab.sessionId)
        return session ? createProjectSessionWorkspaceTab(session) : tab
      })
    if (tabs.length === 0) return []
    return [
      {
        ...panel,
        tabs,
        activeTabId: tabs.some((tab) => tab.id === panel.activeTabId)
          ? panel.activeTabId
          : tabs[0].id
      }
    ]
  })
  const focusedPanelId = panels.some((panel) => panel.id === layout.focusedPanelId)
    ? layout.focusedPanelId
    : (panels[0]?.id ?? null)

  return { panels, focusedPanelId }
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
