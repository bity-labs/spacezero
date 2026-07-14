import type { ProjectSession } from '../shared'

import {
  emptySessionWorkspaceLayout,
  focusSessionTabInLayout,
  openProjectSessionInLayout
} from './session-workspace-layout'

describe('session workspace layout', () => {
  it('opens the first two sessions as two visible panels', () => {
    const layout = [
      session('session-1', 'Session 1', 'running'),
      session('session-2', 'Session 2', 'idle')
    ].reduce(openProjectSessionInLayout, emptySessionWorkspaceLayout)

    expect(layout.panels).toHaveLength(2)
    expect(layout.panels[0].tabs).toMatchObject([{ title: 'Session 1', status: 'running' }])
    expect(layout.panels[1].tabs).toMatchObject([{ title: 'Session 2', status: 'idle' }])
  })

  it('adds later sessions as tabs in the focused panel', () => {
    const layout = [
      session('session-1', 'Session 1', 'running'),
      session('session-2', 'Session 2', 'idle'),
      session('session-3', 'Session 3', 'idle')
    ].reduce(openProjectSessionInLayout, emptySessionWorkspaceLayout)

    expect(layout.panels).toHaveLength(2)
    expect(layout.panels[0].tabs).toMatchObject([{ title: 'Session 1', status: 'running' }])
    expect(layout.panels[1].tabs.map((tab) => tab.title)).toEqual(['Session 2', 'Session 3'])
    expect(layout.panels[1].activeTabId).toBe('project:session-3')
  })

  it('focuses a tab without changing other panel state', () => {
    const layout = [
      session('session-1', 'Session 1', 'running'),
      session('session-2', 'Session 2', 'idle'),
      session('session-3', 'Session 3', 'idle')
    ].reduce(openProjectSessionInLayout, emptySessionWorkspaceLayout)

    const focused = focusSessionTabInLayout(layout, 'session-panel-2', 'project:session-2')

    expect(focused.panels).toHaveLength(2)
    expect(focused.panels[0].tabs).toMatchObject([{ title: 'Session 1', status: 'running' }])
    expect(focused.panels[1].activeTabId).toBe('project:session-2')
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
