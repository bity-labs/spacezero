import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { ProjectSession, WorkspaceSession } from '../shared'
import {
  emptySessionWorkspaceLayout,
  focusSessionTabInLayout,
  openProjectSessionInLayout,
  openWorkspaceSessionInLayout,
  type SessionWorkspaceLayout
} from './session-workspace-layout'

type SessionWorkspaceState = {
  layout: SessionWorkspaceLayout
  resetLayout: () => void
  openProjectSession: (session: ProjectSession) => void
  openWorkspaceSession: (session: WorkspaceSession) => void
  focusTab: (panelId: string, tabId: string) => void
}

const initialSessionWorkspaceState = {
  layout: emptySessionWorkspaceLayout
}

const useSessionWorkspaceStore = create<SessionWorkspaceState>()(
  persist(
    (set) => ({
      ...initialSessionWorkspaceState,
      resetLayout: () => set(initialSessionWorkspaceState),
      openProjectSession: (session) =>
        set((state) => ({ layout: openProjectSessionInLayout(state.layout, session) })),
      openWorkspaceSession: (session) =>
        set((state) => ({ layout: openWorkspaceSessionInLayout(state.layout, session) })),
      focusTab: (panelId, tabId) =>
        set((state) => ({ layout: focusSessionTabInLayout(state.layout, panelId, tabId) }))
    }),
    {
      name: 'spacezero.sessionWorkspace',
      partialize: (state) => ({ layout: state.layout })
    }
  )
)

function resetSessionWorkspaceStore(): void {
  useSessionWorkspaceStore.setState(initialSessionWorkspaceState)
}

export { resetSessionWorkspaceStore, useSessionWorkspaceStore }
