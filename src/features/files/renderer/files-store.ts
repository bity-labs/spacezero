import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { FilesDocument, FilesTextDocument } from '../shared'

export type FilesSaveRequestSnapshot = {
  relativePath: string
  content: string
  expectedRevision: string
}

export type FilesActiveDocumentState =
  | { status: 'loading'; relativePath: string }
  | { status: 'error'; relativePath: string; message: string }
  | (FilesTextDocument & {
      status: 'ready'
      draft: string
      dirty: boolean
      saveStatus: 'idle' | 'saving' | 'error'
      error?: string
      saveRequest?: FilesSaveRequestSnapshot
    })
  | (Exclude<FilesDocument, FilesTextDocument> & { status: 'metadata' })

export type FilesContextState = {
  explorerWidth: number
  explorerCollapsed: boolean
  selectedPath: string | null
  expandedPaths: string[]
  activeDocument: FilesActiveDocumentState | null
}

type PersistedFilesContextState = Omit<FilesContextState, 'activeDocument'>

type FilesStore = {
  contexts: Record<string, FilesContextState>
  setExplorerWidth: (sessionId: string, width: number) => void
  setExplorerCollapsed: (sessionId: string, collapsed: boolean) => void
  setSelectedPath: (sessionId: string, path: string | null) => void
  setExpanded: (sessionId: string, path: string, expanded: boolean) => void
  setActiveDocument: (sessionId: string, document: FilesActiveDocumentState | null) => void
  updateDraft: (sessionId: string, draft: string) => void
  markSaving: (sessionId: string, request: FilesSaveRequestSnapshot) => void
  markSaveFailed: (sessionId: string, message: string, request: FilesSaveRequestSnapshot) => void
  markSaved: (
    sessionId: string,
    document: FilesTextDocument,
    request: FilesSaveRequestSnapshot
  ) => void
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
        }),
      setActiveDocument: (sessionId, activeDocument) =>
        set((state) => updateContext(state, sessionId, { activeDocument })),
      updateDraft: (sessionId, draft) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          const activeDocument = context.activeDocument
          if (!activeDocument || activeDocument.status !== 'ready') return state
          return updateContext(state, sessionId, {
            activeDocument: {
              ...activeDocument,
              draft,
              dirty: draft !== activeDocument.content,
              saveStatus: activeDocument.saveStatus === 'saving' ? 'saving' : 'idle',
              error: undefined
            }
          })
        }),
      markSaving: (sessionId, request) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          const activeDocument = context.activeDocument
          if (!activeDocument || activeDocument.status !== 'ready') return state
          if (
            activeDocument.relativePath !== request.relativePath ||
            activeDocument.draft !== request.content ||
            activeDocument.revision !== request.expectedRevision
          ) {
            return state
          }
          return updateContext(state, sessionId, {
            activeDocument: {
              ...activeDocument,
              saveStatus: 'saving',
              error: undefined,
              saveRequest: request
            }
          })
        }),
      markSaveFailed: (sessionId, message, request) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          const activeDocument = context.activeDocument
          if (!activeDocument || activeDocument.status !== 'ready') return state
          if (!matchesSaveRequest(activeDocument, request)) return state
          return updateContext(state, sessionId, {
            activeDocument: {
              ...activeDocument,
              dirty: true,
              saveStatus: 'error',
              error: message,
              saveRequest: undefined
            }
          })
        }),
      markSaved: (sessionId, document, request) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          const activeDocument = context.activeDocument
          if (!activeDocument || activeDocument.status !== 'ready') return state
          if (!matchesSaveRequest(activeDocument, request)) return state
          const draft =
            activeDocument.draft === request.content ? document.content : activeDocument.draft
          return updateContext(state, sessionId, {
            activeDocument: {
              ...document,
              status: 'ready',
              draft,
              dirty: draft !== document.content,
              saveStatus: 'idle',
              error: undefined,
              saveRequest: undefined
            }
          })
        })
    }),
    {
      name: 'spacezero.files',
      partialize: (state) => ({
        contexts: Object.fromEntries(
          Object.entries(state.contexts).map(([sessionId, context]) => [
            sessionId,
            toPersistedContext(context)
          ])
        )
      }),
      merge: (persistedState, currentState) => {
        const persistedContexts =
          typeof persistedState === 'object' &&
          persistedState !== null &&
          'contexts' in persistedState
            ? (persistedState.contexts as Record<string, PersistedFilesContextState>)
            : {}
        return {
          ...currentState,
          contexts: Object.fromEntries(
            Object.entries(persistedContexts).map(([sessionId, context]) => [
              sessionId,
              { ...createDefaultContext(), ...context, activeDocument: null }
            ])
          )
        }
      }
    }
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

export function toReadyDocument(document: FilesTextDocument): FilesActiveDocumentState {
  return {
    ...document,
    status: 'ready',
    draft: document.content,
    dirty: false,
    saveStatus: 'idle',
    saveRequest: undefined
  }
}

function matchesSaveRequest(
  activeDocument: Extract<FilesActiveDocumentState, { status: 'ready' }>,
  request: FilesSaveRequestSnapshot
): boolean {
  return (
    activeDocument.relativePath === request.relativePath &&
    activeDocument.saveRequest?.relativePath === request.relativePath &&
    activeDocument.saveRequest.content === request.content &&
    activeDocument.saveRequest.expectedRevision === request.expectedRevision
  )
}

function toPersistedContext(context: FilesContextState): PersistedFilesContextState {
  return {
    explorerWidth: context.explorerWidth,
    explorerCollapsed: context.explorerCollapsed,
    selectedPath: context.selectedPath,
    expandedPaths: context.expandedPaths
  }
}

function createDefaultContext(): FilesContextState {
  return {
    explorerWidth: DEFAULT_EXPLORER_WIDTH,
    explorerCollapsed: false,
    selectedPath: null,
    expandedPaths: [],
    activeDocument: null
  }
}

export function resetFilesStore(): void {
  useFilesStore.setState(initialFilesState)
}

export { useFilesStore }
