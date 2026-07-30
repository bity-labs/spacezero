import type { ProjectSession } from '../shared'

import {
  emptySessionWorkspaceLayout,
  openProjectSessionInLayout,
  syncProjectSessionTabs,
  type SessionWorkspaceLayout
} from './session-workspace-layout'

describe('session workspace layout', () => {
  it('opens a single active session panel', () => {
    const layout = openProjectSessionInLayout(
      emptySessionWorkspaceLayout,
      session('session-1', 'Session 1', 'running')
    )

    expect(layout.panels).toHaveLength(1)
    expect(layout.panels[0].tabs).toMatchObject([{ title: 'Session 1', status: 'running' }])
    expect(layout.focusedPanelId).toBe('session-panel-1')
  })

  it('replaces the active session when another session opens', () => {
    const layout = [
      session('session-1', 'Session 1', 'running'),
      session('session-2', 'Session 2', 'idle'),
      session('session-3', 'Session 3', 'idle')
    ].reduce(openProjectSessionInLayout, emptySessionWorkspaceLayout)

    expect(layout.panels).toHaveLength(1)
    expect(layout.panels[0].tabs.map((tab) => tab.title)).toEqual(['Session 3'])
    expect(layout.panels[0].activeTabId).toBe('project:session-3')
    expect(layout.focusedPanelId).toBe('session-panel-1')
  })

  it('does not restore an ordinary Workspace Session tab from persisted legacy layout data', () => {
    const legacyLayout = {
      panels: [
        {
          id: 'session-panel-1',
          tabs: [
            {
              id: 'workspace:legacy-session',
              kind: 'workspace',
              session: {
                id: 'legacy-session',
                kind: 'workspace',
                title: 'Legacy Workspace Session',
                status: 'idle',
                createdAt: new Date(0).toISOString(),
                updatedAt: new Date(0).toISOString()
              },
              title: 'Legacy Workspace Session',
              status: 'idle'
            }
          ],
          activeTabId: 'workspace:legacy-session'
        }
      ],
      focusedPanelId: 'session-panel-1'
    } as unknown as SessionWorkspaceLayout

    expect(syncProjectSessionTabs(legacyLayout, [])).toEqual(emptySessionWorkspaceLayout)
  })
})

function session(id: string, title: string, status: ProjectSession['status']): ProjectSession {
  return {
    id,
    projectId: 'project-1',
    title,
    status,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  }
}
