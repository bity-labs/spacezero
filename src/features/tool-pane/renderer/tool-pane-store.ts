import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { ToolId } from './tool-pane-shell'

export type ToolPaneLayoutState = {
  isOpen: boolean
  width: number | null
  activeToolId: ToolId | null
}

type ToolPaneStore = {
  contexts: Record<string, ToolPaneLayoutState>
  collapse: (contextKey: string) => void
  openTool: (contextKey: string, toolId: ToolId) => void
  setWidth: (contextKey: string, width: number) => void
}

const initialToolPaneState = {
  contexts: {}
}

const useToolPaneStore = create<ToolPaneStore>()(
  persist(
    (set) => ({
      ...initialToolPaneState,
      collapse: (contextKey) =>
        set((state) => {
          const context = state.contexts[contextKey]
          if (!context) return state
          return {
            contexts: {
              ...state.contexts,
              [contextKey]: { ...context, isOpen: false }
            }
          }
        }),
      openTool: (contextKey, toolId) =>
        set((state) => ({
          contexts: {
            ...state.contexts,
            [contextKey]: {
              isOpen: true,
              width: state.contexts[contextKey]?.width ?? null,
              activeToolId: toolId
            }
          }
        })),
      setWidth: (contextKey, width) =>
        set((state) => ({
          contexts: {
            ...state.contexts,
            [contextKey]: {
              isOpen: state.contexts[contextKey]?.isOpen ?? false,
              activeToolId: state.contexts[contextKey]?.activeToolId ?? null,
              width
            }
          }
        }))
    }),
    {
      name: 'spacezero.toolPane'
    }
  )
)

function resetToolPaneStore(): void {
  useToolPaneStore.setState(initialToolPaneState)
}

export { resetToolPaneStore, useToolPaneStore }
