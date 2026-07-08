import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_RIGHT_DEFAULT_WIDTH,
  clampSidebarWidth
} from '@renderer/components/sidebar/sidebar-layout'

type UiLayoutState = {
  leftSidebarWidth: number
  rightSidebarWidth: number
  isLeftSidebarOpen: boolean
  isRightSidebarOpen: boolean
  setLeftSidebarWidth: (width: number) => void
  setRightSidebarWidth: (width: number) => void
  setLeftSidebarOpen: (isOpen: boolean) => void
  setRightSidebarOpen: (isOpen: boolean) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
}

const initialUiLayoutState = {
  leftSidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  rightSidebarWidth: SIDEBAR_RIGHT_DEFAULT_WIDTH,
  isLeftSidebarOpen: true,
  isRightSidebarOpen: true
}

const useUiLayoutStore = create<UiLayoutState>()(
  persist(
    (set) => ({
      ...initialUiLayoutState,
      setLeftSidebarWidth: (width) => set({ leftSidebarWidth: clampSidebarWidth(width) }),
      setRightSidebarWidth: (width) => set({ rightSidebarWidth: clampSidebarWidth(width) }),
      setLeftSidebarOpen: (isOpen) => set({ isLeftSidebarOpen: isOpen }),
      setRightSidebarOpen: (isOpen) => set({ isRightSidebarOpen: isOpen }),
      toggleLeftSidebar: () => set((state) => ({ isLeftSidebarOpen: !state.isLeftSidebarOpen })),
      toggleRightSidebar: () => set((state) => ({ isRightSidebarOpen: !state.isRightSidebarOpen }))
    }),
    {
      name: 'spacezero.uiLayout',
      partialize: (state) => ({
        leftSidebarWidth: state.leftSidebarWidth,
        rightSidebarWidth: state.rightSidebarWidth,
        isLeftSidebarOpen: state.isLeftSidebarOpen,
        isRightSidebarOpen: state.isRightSidebarOpen
      })
    }
  )
)

function resetUiLayoutStore(): void {
  useUiLayoutStore.setState(initialUiLayoutState)
}

export { resetUiLayoutStore, useUiLayoutStore }
