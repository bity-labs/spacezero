import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FilesContextState = {
  explorerWidth: number
  explorerCollapsed: boolean
  selectedPath: string | null
  expandedPaths: string[]
}

type FilesStore = {
  contexts: Record<string, FilesContextState>
  setExplorerWidth: (sessionId: string, width: number) => void
  setExplorerCollapsed: (sessionId: string, collapsed: boolean) => void
  setSelectedPath: (sessionId: string, path: string | null) => void
  setExpanded: (sessionId: string, path: string, expanded: boolean) => void
}

const DEFAULT_EXPLORER_WIDTH = 260
const initialFilesState = { contexts: {} }

const useFilesStore = create<FilesStore>()(
  persist(
    (set) => ({
      ...initialFilesState,
      setExplorerWidth: (sessionId, width) =>
        set((state) => updateContext(state, sessionId, { explorerWidth: width })),
      setExplorerCollapsed: (sessionId, explorerCollapsed) =>
        set((state) => updateContext(state, sessionId, { explorerCollapsed })),
      setSelectedPath: (sessionId, selectedPath) =>
        set((state) => updateContext(state, sessionId, { selectedPath })),
      setExpanded: (sessionId, path, expanded) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          const expandedPaths = expanded
            ? [...new Set([...context.expandedPaths, path])]
            : context.expandedPaths.filter((candidate) => candidate !== path)
          return updateContext(state, sessionId, { expandedPaths })
        })
    }),
    { name: 'spacezero.files' }
  )
)

function updateContext(
  state: Pick<FilesStore, 'contexts'>,
  sessionId: string,
  update: Partial<FilesContextState>
): Pick<FilesStore, 'contexts'> {
  return {
    contexts: {
      ...state.contexts,
      [sessionId]: { ...(state.contexts[sessionId] ?? createDefaultContext()), ...update }
    }
  }
}

export function createDefaultFilesContext(): FilesContextState {
  return createDefaultContext()
}

function createDefaultContext(): FilesContextState {
  return {
    explorerWidth: DEFAULT_EXPLORER_WIDTH,
    explorerCollapsed: false,
    selectedPath: null,
    expandedPaths: []
  }
}

export function resetFilesStore(): void {
  useFilesStore.setState(initialFilesState)
}

export { useFilesStore }
