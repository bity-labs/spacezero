import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  SIDEBAR_DEFAULT_WIDTH,
  clampSidebarWidth
} from '@renderer/components/sidebar/sidebar-layout'

type UiLayoutState = {
  leftSidebarWidth: number
  isLeftSidebarOpen: boolean
  setLeftSidebarWidth: (width: number) => void
  setLeftSidebarOpen: (isOpen: boolean) => void
  toggleLeftSidebar: () => void
}

const initialUiLayoutState = {
  leftSidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  isLeftSidebarOpen: true
}

const useUiLayoutStore = create<UiLayoutState>()(
  persist(
    (set) => ({
      ...initialUiLayoutState,
      setLeftSidebarWidth: (width) => set({ leftSidebarWidth: clampSidebarWidth(width) }),
      setLeftSidebarOpen: (isOpen) => set({ isLeftSidebarOpen: isOpen }),
      toggleLeftSidebar: () => set((state) => ({ isLeftSidebarOpen: !state.isLeftSidebarOpen }))
    }),
    {
      name: 'spacezero.uiLayout',
      partialize: (state) => ({
        leftSidebarWidth: state.leftSidebarWidth,
        isLeftSidebarOpen: state.isLeftSidebarOpen
      })
    }
  )
)

function resetUiLayoutStore(): void {
  useUiLayoutStore.setState(initialUiLayoutState)
}

export { resetUiLayoutStore, useUiLayoutStore }
