import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { getRichMarkdownLimitation } from '@renderer/lib/rich-markdown'

import type { FilesDocument, FilesTextDocument } from '../shared'

export type FilesSaveRequestSnapshot = {
  relativePath: string
  content: string
  expectedRevision: string
  conflictResolution?:
    | { kind: 'overwrite'; acknowledgedRevision: string }
    | { kind: 'recreate'; acknowledgedMissingRevision: string }
}

export type FilesEditorMode = 'rich' | 'source'

type FilesTabBase = {
  relativePath: string
  name: string
  preview: boolean
  openRequestId?: number
  targetLine?: number
  targetCharacter?: number
  locationRequestId?: number
  editorStateKey: string
  restoreEditorMode?: FilesEditorMode
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
        externalStatus?:
          { kind: 'conflict'; diskRevision: string } | { kind: 'deleted'; missingRevision: string }
      })
  | (Exclude<FilesDocument, FilesTextDocument> & FilesTabBase & { status: 'metadata' })

export type FilesActiveDocumentState = FilesTabState

export type FilesEditorViewState = {
  sourceViewState?: unknown
  richScrollTop?: number
}

export type FilesContextState = {
  explorerWidth: number
  explorerCollapsed: boolean
  selectedPath: string | null
  expandedPaths: string[]
  tabs: FilesTabState[]
  activeTabPath: string | null
  editorViewStates: Record<string, FilesEditorViewState>
}

export type FilesOpenTabIntent = 'preview' | 'permanent'
export type FilesTabDropPosition = 'before' | 'after'

type PersistedFilesTabReference = {
  relativePath: string
  editorMode?: FilesEditorMode
}

type PersistedFilesContextState = Omit<FilesContextState, 'tabs'> & {
  tabs: PersistedFilesTabReference[]
}

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
    revalidateExisting?: boolean,
    targetCharacter?: number
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
  reloadCleanExternalDocument: (sessionId: string, document: FilesDocument) => void
  reloadExternalDocument: (sessionId: string, document: FilesDocument) => void
  markExternalConflict: (sessionId: string, relativePath: string, diskRevision: string) => void
  markDeletedOnDisk: (sessionId: string, relativePath: string) => void
  markExternalReadFailed: (sessionId: string, relativePath: string, message: string) => void
  discardDirtyTabsInPath: (sessionId: string, relativePath: string) => void
  discardAllDirtyTabs: (sessionId: string) => void
  rewritePaths: (sessionId: string, sourcePath: string, destinationPath: string) => void
  closeTabsInPath: (sessionId: string, relativePath: string) => void
  setSourceViewState: (sessionId: string, relativePath: string, viewState: unknown) => void
  setRichScrollTop: (sessionId: string, relativePath: string, scrollTop: number) => void
  clearContext: (sessionId: string) => void
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
        revalidateExisting = false,
        targetCharacter
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
                  targetCharacter,
                  locationRequestId: openRequestId
                }
              }
              return loadingTab(
                relativePath,
                nextPreview,
                openRequestId,
                targetLine,
                undefined,
                targetCharacter
              )
            })
            return updateContext(state, sessionId, {
              tabs,
              activeTabPath: relativePath,
              selectedPath: relativePath
            })
          }

          shouldOpen = true
          const previewIndex = context.tabs.findIndex(canReplacePreviewTab)
          const nextTab = loadingTab(
            relativePath,
            intent === 'preview',
            openRequestId,
            targetLine,
            undefined,
            targetCharacter
          )
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
                    tab.editorStateKey,
                    tab.restoreEditorMode,
                    tab.targetCharacter
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
                targetCharacter: tab.targetCharacter,
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
                ? {
                    ...tab,
                    targetLine: undefined,
                    targetCharacter: undefined,
                    locationRequestId: undefined
                  }
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
              tab.relativePath === relativePath &&
              tab.status === 'ready' &&
              tab.editorMode !== editorMode
                ? {
                    ...tab,
                    editorMode,
                    editorStateKey: `${tab.editorStateKey}:mode:${editorMode}`
                  }
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
              (document.externalStatus && !request.conflictResolution) ||
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
              editorStateKey:
                request.conflictResolution?.kind === 'recreate' &&
                activeDocument.editorMode === 'source'
                  ? createRevisionBaselineKey(document)
                  : activeDocument.editorStateKey,
              status: 'ready',
              draft,
              dirty: draft !== document.content,
              preview: false,
              saveStatus: 'idle',
              editorMode: activeDocument.editorMode,
              error: undefined,
              saveRequest: undefined,
              externalStatus: undefined
            }
          })
        ),
      reloadCleanExternalDocument: (sessionId, document) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          return updateContext(state, sessionId, {
            tabs: context.tabs.map((tab) => {
              if (tab.relativePath !== document.relativePath) return tab
              if (tab.status === 'ready' && (tab.dirty || tab.externalStatus)) return tab
              return toTabDocument(
                document,
                tab.preview,
                tab.targetLine,
                tab.locationRequestId,
                createRevisionBaselineKey(document),
                tab.status === 'ready' ? tab.editorMode : undefined,
                tab.targetCharacter
              )
            })
          })
        }),
      reloadExternalDocument: (sessionId, document) =>
        set((state) => {
          const context = state.contexts[sessionId] ?? createDefaultContext()
          return updateContext(state, sessionId, {
            tabs: context.tabs.map((tab) =>
              tab.relativePath === document.relativePath
                ? toTabDocument(
                    document,
                    false,
                    tab.targetLine,
                    tab.locationRequestId,
                    createRevisionBaselineKey(document),
                    tab.status === 'ready' ? tab.editorMode : undefined,
                    tab.targetCharacter
                  )
                : tab
            )
          })
        }),
      markExternalConflict: (sessionId, relativePath, diskRevision) =>
        set((state) =>
          updateMatchingReadyTab(state, sessionId, relativePath, (document) => ({
            ...document,
            preview: false,
            dirty: true,
            saveStatus: 'error',
            error: 'This file changed on disk. Reload from disk or explicitly overwrite disk.',
            saveRequest: undefined,
            externalStatus: { kind: 'conflict', diskRevision }
          }))
        ),
      markDeletedOnDisk: (sessionId, relativePath) =>
        set((state) =>
          updateMatchingReadyTab(state, sessionId, relativePath, (document) => ({
            ...document,
            preview: false,
            dirty: true,
            saveStatus: 'error',
            error: 'Deleted on disk. Recreate file or close the tab.',
            saveRequest: undefined,
            externalStatus: { kind: 'deleted', missingRevision: document.revision }
          }))
        ),
      markExternalReadFailed: (sessionId, relativePath, message) =>
        set((state) =>
          updateMatchingReadyTab(state, sessionId, relativePath, (document) => ({
            ...document,
            preview: false,
            saveStatus: 'error',
            error: message,
            saveRequest: undefined
          }))
        ),
      discardDirtyTabsInPath: (sessionId, relativePath) =>
        set((state) =>
          discardDirtyTabs(state, sessionId, (path) => isPathAffectedBy(path, relativePath))
        ),
      discardAllDirtyTabs: (sessionId) =>
        set((state) => discardDirtyTabs(state, sessionId, () => true)),
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
            editorViewStates: Object.fromEntries(
              Object.entries(context.editorViewStates).map(([path, viewState]) => [
                rewrite(path),
                viewState
              ])
            ),
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
            selectedPath,
            editorViewStates: Object.fromEntries(
              Object.entries(context.editorViewStates).filter(
                ([path]) => !isPathAffectedBy(path, relativePath)
              )
            )
          })
        }),
      setSourceViewState: (sessionId, relativePath, sourceViewState) =>
        set((state) => setEditorViewState(state, sessionId, relativePath, { sourceViewState })),
      setRichScrollTop: (sessionId, relativePath, richScrollTop) =>
        set((state) => setEditorViewState(state, sessionId, relativePath, { richScrollTop })),
      clearContext: (sessionId) =>
        set((state) => {
          if (!(sessionId in state.contexts)) return state
          const contexts = { ...state.contexts }
          delete contexts[sessionId]
          return { contexts }
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
            Object.entries(persistedContexts).map(([sessionId, context]) => {
              const restoredTabs = Array.isArray(context.tabs)
                ? context.tabs.map((tab, index) =>
                    loadingTab(
                      tab.relativePath,
                      false,
                      restoredOpenRequestId(index),
                      undefined,
                      tab.editorMode
                    )
                  )
                : []
              const restoredActiveTabPath = restoredTabs.some(
                (tab) => tab.relativePath === context.activeTabPath
              )
                ? context.activeTabPath
                : (restoredTabs[0]?.relativePath ?? null)
              return [
                sessionId,
                {
                  ...createDefaultContext(),
                  ...context,
                  tabs: restoredTabs,
                  activeTabPath: restoredActiveTabPath,
                  editorViewStates: sanitizeEditorViewStates(context.editorViewStates)
                }
              ]
            })
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

function setEditorViewState(
  state: Pick<FilesStore, 'contexts'>,
  sessionId: string,
  relativePath: string,
  update: FilesEditorViewState
): Pick<FilesStore, 'contexts'> {
  const context = state.contexts[sessionId] ?? createDefaultContext()
  return updateContext(state, sessionId, {
    editorViewStates: {
      ...context.editorViewStates,
      [relativePath]: { ...context.editorViewStates[relativePath], ...update }
    }
  })
}

export function getFilesEditorViewState(
  sessionId: string,
  relativePath: string
): FilesEditorViewState | undefined {
  return useFilesStore.getState().contexts[sessionId]?.editorViewStates[relativePath]
}

export function createDefaultFilesContext(): FilesContextState {
  return createDefaultContext()
}

export function toReadyDocument(
  document: FilesTextDocument,
  preview = false,
  targetLine?: number,
  locationRequestId?: number,
  editorStateKey = `${document.relativePath}:ready`,
  preferredEditorMode?: FilesEditorMode,
  targetCharacter?: number
): Extract<FilesTabState, { status: 'ready' }> {
  const defaultEditorMode = getDefaultEditorMode(document.relativePath, document.content)
  return {
    ...document,
    name: document.name,
    editorStateKey,
    preview,
    targetLine,
    targetCharacter,
    locationRequestId,
    status: 'ready',
    draft: document.content,
    dirty: false,
    saveStatus: 'idle',
    saveRequest: undefined,
    editorMode: preferredEditorMode === 'source' ? 'source' : defaultEditorMode
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

function discardDirtyTabs(
  state: Pick<FilesStore, 'contexts'>,
  sessionId: string,
  matchesPath: (relativePath: string) => boolean
): Pick<FilesStore, 'contexts'> {
  const context = state.contexts[sessionId] ?? createDefaultContext()
  return updateContext(state, sessionId, {
    tabs: context.tabs.map((tab) =>
      matchesPath(tab.relativePath) && tab.status === 'ready'
        ? {
            ...tab,
            draft: tab.content,
            dirty: false,
            saveStatus: 'idle',
            error: undefined,
            saveRequest: undefined,
            externalStatus: undefined
          }
        : tab
    )
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
  const permanentTabs = context.tabs.filter((tab) => !tab.preview)
  const activeTabPath = permanentTabs.some((tab) => tab.relativePath === context.activeTabPath)
    ? context.activeTabPath
    : (permanentTabs[0]?.relativePath ?? null)
  return {
    explorerWidth: context.explorerWidth,
    explorerCollapsed: context.explorerCollapsed,
    selectedPath: context.selectedPath,
    expandedPaths: context.expandedPaths,
    tabs: permanentTabs.map((tab) => ({
      relativePath: tab.relativePath,
      editorMode: tab.status === 'ready' ? tab.editorMode : tab.restoreEditorMode
    })),
    activeTabPath,
    editorViewStates: Object.fromEntries(
      Object.entries(context.editorViewStates).filter(([relativePath]) =>
        permanentTabs.some((tab) => tab.relativePath === relativePath)
      )
    )
  }
}

function createDefaultContext(): FilesContextState {
  return {
    explorerWidth: DEFAULT_EXPLORER_WIDTH,
    explorerCollapsed: false,
    selectedPath: null,
    expandedPaths: [],
    tabs: [],
    activeTabPath: null,
    editorViewStates: {}
  }
}

function loadingTab(
  relativePath: string,
  preview: boolean,
  openRequestId: number,
  targetLine?: number,
  restoreEditorMode?: FilesEditorMode,
  targetCharacter?: number
): Extract<FilesTabState, { status: 'loading' }> {
  return {
    relativePath,
    name: pathName(relativePath),
    editorStateKey: `${relativePath}:${openRequestId}`,
    preview,
    openRequestId,
    targetLine,
    targetCharacter,
    locationRequestId: openRequestId,
    restoreEditorMode,
    status: 'loading'
  }
}

function toTabDocument(
  document: FilesDocument,
  preview: boolean,
  targetLine?: number,
  locationRequestId?: number,
  editorStateKey = `${document.relativePath}:ready`,
  preferredEditorMode?: FilesEditorMode,
  targetCharacter?: number
): FilesTabState {
  return document.contentKind === 'text'
    ? toReadyDocument(
        document,
        preview,
        targetLine,
        locationRequestId,
        editorStateKey,
        preferredEditorMode,
        targetCharacter
      )
    : {
        ...document,
        name: document.name,
        editorStateKey,
        preview,
        targetLine,
        targetCharacter,
        locationRequestId,
        status: 'metadata'
      }
}

function createRevisionBaselineKey(document: FilesDocument): string {
  return `${document.relativePath}:revision:${document.revision}`
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
    selectedPath: activeTabPath ?? context.selectedPath,
    editorViewStates: Object.fromEntries(
      Object.entries(context.editorViewStates).filter(([path]) => path !== relativePath)
    )
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

function restoredOpenRequestId(index: number): number {
  return -(index + 1)
}

function sanitizeEditorViewStates(editorViewStates: unknown): Record<string, FilesEditorViewState> {
  if (!editorViewStates || typeof editorViewStates !== 'object') return {}
  return editorViewStates as Record<string, FilesEditorViewState>
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
