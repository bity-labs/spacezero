import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { getRichMarkdownLimitation } from '@renderer/lib/rich-markdown'

import type { FilesDocument, FilesTextDocument } from '../shared'

export type FilesSaveRequestSnapshot = {
  relativePath: string
  content: string
  expectedRevision: string
}

export type FilesEditorMode = 'rich' | 'source'

type FilesTabBase = {
  relativePath: string
  name: string
  preview: boolean
  openRequestId?: number
  targetLine?: number
  locationRequestId?: number
  editorStateKey: string
}

export type FilesTabState =
  | (FilesTabBase & { status: 'loading' })
  | (FilesTabBase & { status: 'error'; message: string })
  | (FilesTextDocument &
      FilesTabBase & {
        status: 'ready'
        draft: string
        dirty: boolean
        saveStatus: 'idle' | 'saving' | 'error'
        error?: string
        saveRequest?: FilesSaveRequestSnapshot
        editorMode: FilesEditorMode
      })
  | (Exclude<FilesDocument, FilesTextDocument> & FilesTabBase & { status: 'metadata' })

export type FilesActiveDocumentState = FilesTabState

export type FilesContextState = {
  explorerWidth: number
  explorerCollapsed: boolean
  selectedPath: string | null
  expandedPaths: string[]
  tabs: FilesTabState[]
  activeTabPath: string | null
}

export type FilesOpenTabIntent = 'preview' | 'permanent'
export type FilesTabDropPosition = 'before' | 'after'

type PersistedFilesContextState = Omit<FilesContextState, 'tabs' | 'activeTabPath'>

type FilesStore = {
  contexts: Record<string, FilesContextState>
  setExplorerWidth: (sessionId: string, width: number) => void
  setExplorerCollapsed: (sessionId: string, collapsed: boolean) => void
  setSelectedPath: (sessionId: string, path: string | null) => void
  setExpanded: (sessionId: string, path: string, expanded: boolean) => void
  beginOpenTab: (
    sessionId: string,
    relativePath: string,
    intent: FilesOpenTabIntent,
    openRequestId: number,
    targetLine?: number,
    revalidateExisting?: boolean
  ) => boolean
  finishOpenTab: (sessionId: string, document: FilesDocument, openRequestId: number) => boolean
  failOpenTab: (
    sessionId: string,
    relativePath: string,
    message: string,
    openRequestId: number
  ) => boolean
  clearLocationTarget: (sessionId: string, relativePath: string, locationRequestId: number) => void
  activateTab: (sessionId: string, relativePath: string) => void
  promoteTab: (sessionId: string, relativePath: string) => void
  closeTab: (sessionId: string, relativePath: string) => void
  discardAndCloseTab: (sessionId: string, relativePath: string) => void
  reorderTabs: (
    sessionId: string,
    sourcePath: string,
    targetPath: string,
    dropPosition: FilesTabDropPosition
  ) => void
  setEditorMode: (sessionId: string, relativePath: string, mode: FilesEditorMode) => void
  updateDraft: (sessionId: string, draft: string) => void
  markSaving: (sessionId: string, request: FilesSaveRequestSnapshot) => void
  markSaveFailed: (sessionId: string, message: string, request: FilesSaveRequestSnapshot) => void
  markSaved: (
    sessionId: string,
    document: FilesTextDocument,
    request: FilesSaveRequestSnapshot
  ) => void
  discardDirtyTabsInPath: (sessionId: string, relativePath: string) => void
  rewritePaths: (sessionId: string, sourcePath: string, destinationPath: string) => void
  closeTabsInPath: (sessionId: string, relativePath: string) => void
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
      beginOpenTab: (
        sessionId,
        relativePath,
        intent,
        openRequestId,
        targetLine,
        revalidateExisting = false
      ) => {
        let shouldOpen = false
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          const existingIndex = context.tabs.findIndex((tab) => tab.relativePath === relativePath)
          if (existingIndex >= 0) {
            const existing = context.tabs[existingIndex]
            const shouldRevalidate = revalidateExisting && shouldRevalidateExistingTab(existing)
            shouldOpen = shouldRevalidate
            const tabs = context.tabs.map((tab, index) => {
              if (index !== existingIndex) return tab
              const nextPreview = intent === 'permanent' ? false : tab.preview
              if (!shouldRevalidate) {
                return {
                  ...tab,
                  preview: nextPreview,
                  targetLine,
                  locationRequestId: openRequestId
                }
              }
              return loadingTab(relativePath, nextPreview, openRequestId, targetLine)
            })
            return updateContext(state, sessionId, {
              tabs,
              activeTabPath: relativePath,
              selectedPath: relativePath
            })
          }

          shouldOpen = true
          const previewIndex = context.tabs.findIndex(canReplacePreviewTab)
          const nextTab = loadingTab(relativePath, intent === 'preview', openRequestId, targetLine)
          const tabs =
            intent === 'preview' && previewIndex >= 0
              ? context.tabs.map((tab, index) => (index === previewIndex ? nextTab : tab))
              : [...context.tabs, nextTab]
          return updateContext(state, sessionId, {
            tabs,
            activeTabPath: relativePath,
            selectedPath: relativePath
          })
        })
        return shouldOpen
      },
      finishOpenTab: (sessionId, document, openRequestId) => {
        let accepted = false
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          const tab = context.tabs.find(
            (candidate) =>
              candidate.relativePath === document.relativePath &&
              candidate.status === 'loading' &&
              candidate.openRequestId === openRequestId
          )
          if (!tab) return state
          accepted = true
          return updateContext(state, sessionId, {
            tabs: context.tabs.map((candidate) =>
              candidate === tab
                ? toTabDocument(
                    document,
                    tab.preview,
                    tab.targetLine,
                    tab.locationRequestId,
                    tab.editorStateKey
                  )
                : candidate
            )
          })
        })
        return accepted
      },
      failOpenTab: (sessionId, relativePath, message, openRequestId) => {
        let accepted = false
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          return updateContext(state, sessionId, {
            tabs: context.tabs.map((tab) => {
              const matchesRequest =
                tab.relativePath === relativePath &&
                tab.status === 'loading' &&
                tab.openRequestId === openRequestId
              if (!matchesRequest) return tab
              accepted = true
              return {
                relativePath,
                name: pathName(relativePath),
                editorStateKey: tab.editorStateKey,
                status: 'error' as const,
                message,
                preview: tab.preview,
                targetLine: tab.targetLine,
                locationRequestId: tab.locationRequestId
              }
            })
          })
        })
        return accepted
      },
      clearLocationTarget: (sessionId, relativePath, locationRequestId) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          return updateContext(state, sessionId, {
            tabs: context.tabs.map((tab) =>
              tab.relativePath === relativePath && tab.locationRequestId === locationRequestId
                ? { ...tab, targetLine: undefined, locationRequestId: undefined }
                : tab
            )
          })
        }),
      activateTab: (sessionId, relativePath) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          if (!context.tabs.some((tab) => tab.relativePath === relativePath)) return state
          return updateContext(state, sessionId, {
            activeTabPath: relativePath,
            selectedPath: relativePath
          })
        }),
      promoteTab: (sessionId, relativePath) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          return updateContext(state, sessionId, {
            tabs: context.tabs.map((tab) =>
              tab.relativePath === relativePath ? { ...tab, preview: false } : tab
            )
          })
        }),
      closeTab: (sessionId, relativePath) =>
        set((state) => closeTabIfAllowed(state, sessionId, relativePath, false)),
      discardAndCloseTab: (sessionId, relativePath) =>
        set((state) => closeTabIfAllowed(state, sessionId, relativePath, true)),
      reorderTabs: (sessionId, sourcePath, targetPath, dropPosition) =>
        set((state) => {
          if (sourcePath === targetPath) return state
          const context = state.contexts[sessionId] ?? createDefaultContext()
          const sourceIndex = context.tabs.findIndex((tab) => tab.relativePath === sourcePath)
          if (sourceIndex < 0) return state
          const tabs = [...context.tabs]
          const [source] = tabs.splice(sourceIndex, 1)
          if (!source) return state
          const targetIndex = tabs.findIndex((tab) => tab.relativePath === targetPath)
          if (targetIndex < 0) return state
          const insertIndex = dropPosition === 'after' ? targetIndex + 1 : targetIndex
          tabs.splice(insertIndex, 0, source)
          return updateContext(state, sessionId, { tabs })
        }),
      setEditorMode: (sessionId, relativePath, editorMode) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          return updateContext(state, sessionId, {
            tabs: context.tabs.map((tab) =>
              tab.relativePath === relativePath && tab.status === 'ready'
                ? { ...tab, editorMode }
                : tab
            )
          })
        }),
      updateDraft: (sessionId, draft) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          const activeTabPath = context.activeTabPath
          if (!activeTabPath) return state
          return updateActiveReadyTab(state, sessionId, (activeDocument) => ({
            ...activeDocument,
            draft,
            dirty: draft !== activeDocument.content,
            preview: false,
            saveStatus: activeDocument.saveStatus === 'saving' ? 'saving' : 'idle',
            error: undefined
          }))
        }),
      markSaving: (sessionId, request) =>
        set((state) =>
          updateMatchingReadyTab(state, sessionId, request.relativePath, (document) => {
            if (
              document.draft !== request.content ||
              document.revision !== request.expectedRevision
            ) {
              return document
            }
            return {
              ...document,
              preview: false,
              saveStatus: 'saving',
              error: undefined,
              saveRequest: request
            }
          })
        ),
      markSaveFailed: (sessionId, message, request) =>
        set((state) =>
          updateMatchingSaveRequest(state, sessionId, request, (activeDocument) => ({
            ...activeDocument,
            dirty: true,
            saveStatus: 'error',
            error: message,
            saveRequest: undefined
          }))
        ),
      markSaved: (sessionId, document, request) =>
        set((state) =>
          updateMatchingSaveRequest(state, sessionId, request, (activeDocument) => {
            const draft =
              activeDocument.draft === request.content ? document.content : activeDocument.draft
            return {
              ...document,
              editorStateKey: activeDocument.editorStateKey,
              status: 'ready',
              draft,
              dirty: draft !== document.content,
              preview: false,
              saveStatus: 'idle',
              editorMode: activeDocument.editorMode,
              error: undefined,
              saveRequest: undefined
            }
          })
        ),
      discardDirtyTabsInPath: (sessionId, relativePath) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          return updateContext(state, sessionId, {
            tabs: context.tabs.map((tab) =>
              isPathAffectedBy(tab.relativePath, relativePath) && tab.status === 'ready'
                ? {
                    ...tab,
                    draft: tab.content,
                    dirty: false,
                    saveStatus: 'idle',
                    error: undefined,
                    saveRequest: undefined
                  }
                : tab
            )
          })
        }),
      rewritePaths: (sessionId, sourcePath, destinationPath) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          const rewrite = (path: string): string =>
            rewriteAffectedPath(path, sourcePath, destinationPath)
          return updateContext(state, sessionId, {
            selectedPath: context.selectedPath
              ? rewrite(context.selectedPath)
              : context.selectedPath,
            expandedPaths: context.expandedPaths.map(rewrite),
            activeTabPath: context.activeTabPath
              ? rewrite(context.activeTabPath)
              : context.activeTabPath,
            tabs: context.tabs.map((tab) => ({
              ...tab,
              relativePath: rewrite(tab.relativePath),
              name: pathName(rewrite(tab.relativePath))
            }))
          })
        }),
      closeTabsInPath: (sessionId, relativePath) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          const activeIndex = context.tabs.findIndex(
            (tab) => tab.relativePath === context.activeTabPath
          )
          const tabs = context.tabs.filter(
            (tab) => !isPathAffectedBy(tab.relativePath, relativePath)
          )
          const activeTabPath =
            context.activeTabPath && isPathAffectedBy(context.activeTabPath, relativePath)
              ? (tabs[activeIndex]?.relativePath ??
                tabs[activeIndex - 1]?.relativePath ??
                tabs[0]?.relativePath ??
                null)
              : context.activeTabPath
          const selectedPath = context.selectedPath
            ? isPathAffectedBy(context.selectedPath, relativePath)
              ? (activeTabPath ?? parentDirectoryPath(relativePath)) || null
              : context.selectedPath
            : activeTabPath
          return updateContext(state, sessionId, {
            tabs,
            activeTabPath,
            selectedPath
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
              { ...createDefaultContext(), ...context, tabs: [], activeTabPath: null }
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

export function toReadyDocument(
  document: FilesTextDocument,
  preview = false,
  targetLine?: number,
  locationRequestId?: number,
  editorStateKey = `${document.relativePath}:ready`
): Extract<FilesTabState, { status: 'ready' }> {
  return {
    ...document,
    name: document.name,
    editorStateKey,
    preview,
    targetLine,
    locationRequestId,
    status: 'ready',
    draft: document.content,
    dirty: false,
    saveStatus: 'idle',
    saveRequest: undefined,
    editorMode: getDefaultEditorMode(document.relativePath, document.content)
  }
}

export function getActiveFilesTab(context: FilesContextState): FilesTabState | null {
  if (!context.activeTabPath) return null
  return context.tabs.find((tab) => tab.relativePath === context.activeTabPath) ?? null
}

function updateActiveReadyTab(
  state: Pick<FilesStore, 'contexts'>,
  sessionId: string,
  update: (
    activeDocument: Extract<FilesTabState, { status: 'ready' }>
  ) => Extract<FilesTabState, { status: 'ready' }>
): Pick<FilesStore, 'contexts'> {
  const context = state.contexts[sessionId] ?? createDefaultContext()
  const activeTabPath = context.activeTabPath
  if (!activeTabPath) return state
  const activeDocument = context.tabs.find(
    (tab): tab is Extract<FilesTabState, { status: 'ready' }> =>
      tab.relativePath === activeTabPath && tab.status === 'ready'
  )
  if (!activeDocument) return state
  return updateContext(state, sessionId, {
    tabs: context.tabs.map((tab) => (tab === activeDocument ? update(activeDocument) : tab))
  })
}

function updateMatchingReadyTab(
  state: Pick<FilesStore, 'contexts'>,
  sessionId: string,
  relativePath: string,
  update: (
    document: Extract<FilesTabState, { status: 'ready' }>
  ) => Extract<FilesTabState, { status: 'ready' }>
): Pick<FilesStore, 'contexts'> {
  const context = state.contexts[sessionId] ?? createDefaultContext()
  const matchingDocument = context.tabs.find(
    (tab): tab is Extract<FilesTabState, { status: 'ready' }> =>
      tab.status === 'ready' && tab.relativePath === relativePath
  )
  if (!matchingDocument) return state
  return updateContext(state, sessionId, {
    tabs: context.tabs.map((tab) => (tab === matchingDocument ? update(matchingDocument) : tab))
  })
}

function updateMatchingSaveRequest(
  state: Pick<FilesStore, 'contexts'>,
  sessionId: string,
  request: FilesSaveRequestSnapshot,
  update: (
    document: Extract<FilesTabState, { status: 'ready' }>
  ) => Extract<FilesTabState, { status: 'ready' }>
): Pick<FilesStore, 'contexts'> {
  return updateMatchingReadyTab(state, sessionId, request.relativePath, (document) =>
    matchesSaveRequest(document, request) ? update(document) : document
  )
}

function matchesSaveRequest(
  document: Extract<FilesTabState, { status: 'ready' }>,
  request: FilesSaveRequestSnapshot
): boolean {
  return (
    document.relativePath === request.relativePath &&
    document.saveRequest?.relativePath === request.relativePath &&
    document.saveRequest.content === request.content &&
    document.saveRequest.expectedRevision === request.expectedRevision
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
    tabs: [],
    activeTabPath: null
  }
}

function loadingTab(
  relativePath: string,
  preview: boolean,
  openRequestId: number,
  targetLine?: number
): Extract<FilesTabState, { status: 'loading' }> {
  return {
    relativePath,
    name: pathName(relativePath),
    editorStateKey: `${relativePath}:${openRequestId}`,
    preview,
    openRequestId,
    targetLine,
    locationRequestId: openRequestId,
    status: 'loading'
  }
}

function toTabDocument(
  document: FilesDocument,
  preview: boolean,
  targetLine?: number,
  locationRequestId?: number,
  editorStateKey = `${document.relativePath}:ready`
): FilesTabState {
  return document.contentKind === 'text'
    ? toReadyDocument(document, preview, targetLine, locationRequestId, editorStateKey)
    : {
        ...document,
        name: document.name,
        editorStateKey,
        preview,
        targetLine,
        locationRequestId,
        status: 'metadata'
      }
}

function isPathAffectedBy(candidatePath: string, relativePath: string): boolean {
  return candidatePath === relativePath || candidatePath.startsWith(`${relativePath}/`)
}

function rewriteAffectedPath(
  candidatePath: string,
  sourcePath: string,
  destinationPath: string
): string {
  if (candidatePath === sourcePath) return destinationPath
  if (candidatePath.startsWith(`${sourcePath}/`)) {
    return `${destinationPath}${candidatePath.slice(sourcePath.length)}`
  }
  return candidatePath
}

function canReplacePreviewTab(tab: FilesTabState): boolean {
  return tab.preview && !(tab.status === 'ready' && tab.dirty)
}

function shouldRevalidateExistingTab(tab: FilesTabState): boolean {
  if (tab.status === 'ready' && tab.dirty) return false
  return (
    tab.status === 'loading' ||
    tab.status === 'error' ||
    tab.status === 'ready' ||
    tab.status === 'metadata'
  )
}

function closeTabIfAllowed(
  state: Pick<FilesStore, 'contexts'>,
  sessionId: string,
  relativePath: string,
  allowDirty: boolean
): Pick<FilesStore, 'contexts'> {
  const context = state.contexts[sessionId] ?? createDefaultContext()
  const tabIndex = context.tabs.findIndex((tab) => tab.relativePath === relativePath)
  if (tabIndex < 0) return state
  const tab = context.tabs[tabIndex]
  if (!allowDirty && tab.status === 'ready' && tab.dirty) return state
  const tabs = context.tabs.filter((candidate) => candidate.relativePath !== relativePath)
  const activeTabPath = selectTabAfterClose(context, tabs, tabIndex, relativePath)
  return updateContext(state, sessionId, {
    tabs,
    activeTabPath,
    selectedPath: activeTabPath ?? context.selectedPath
  })
}

function selectTabAfterClose(
  context: FilesContextState,
  tabs: FilesTabState[],
  closedIndex: number,
  closedPath: string
): string | null {
  if (context.activeTabPath !== closedPath) return context.activeTabPath
  return tabs[closedIndex]?.relativePath ?? tabs[closedIndex - 1]?.relativePath ?? null
}

function getDefaultEditorMode(relativePath: string, content: string): FilesEditorMode {
  if (!isMarkdownDocumentPath(relativePath)) return 'source'
  return getRichMarkdownLimitation(content, { isMdx: isMdxPath(relativePath) }) ? 'source' : 'rich'
}

export function isMarkdownDocumentPath(relativePath: string): boolean {
  const lowerPath = relativePath.toLowerCase()
  return lowerPath.endsWith('.md') || lowerPath.endsWith('.mdx')
}

export function isMdxPath(relativePath: string): boolean {
  return relativePath.toLowerCase().endsWith('.mdx')
}

function parentDirectoryPath(relativePath: string): string {
  const index = relativePath.lastIndexOf('/')
  return index < 0 ? '' : relativePath.slice(0, index)
}

function pathName(relativePath: string): string {
  return relativePath.split('/').at(-1) ?? relativePath
}

export function resetFilesStore(): void {
  useFilesStore.setState(initialFilesState)
}

export { useFilesStore }
