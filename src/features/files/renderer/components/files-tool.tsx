import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CaretDown,
  CaretRight,
  MagnifyingGlass,
  Plus,
  SidebarSimple,
  X
} from '@phosphor-icons/react'
import { Tree, type NodeRendererProps } from 'react-arborist'

import {
  RichMarkdownEditor,
  type RichMarkdownImageAdapter
} from '@renderer/components/rich-markdown-editor'
import { getRichMarkdownLimitation } from '@renderer/lib/rich-markdown'
import type { FilesContext, FilesEntry, FilesSearchResult } from '../../shared'
import {
  createDefaultFilesContext,
  getActiveFilesTab,
  isMarkdownDocumentPath,
  isMdxPath,
  useFilesStore,
  type FilesEditorMode,
  type FilesOpenTabIntent,
  type FilesTabDropPosition,
  type FilesTabState
} from '../files-store'
import { openFilesLocation } from '../files-open-location'
import { migrateFilesMonacoEditorState } from '../lib/files-editor-state-migration'
import { createFilesMonacoModelPath, getFilesEditorLanguage } from '../lib/files-editor-model'
import { configureFilesMonacoEnvironment } from '../lib/monaco-environment'
import { FilesIcon } from './files-icon'
import { FilesMonacoEditor, type FilesMonacoEditorMount } from './files-monaco-editor'

configureFilesMonacoEnvironment()

type FilesTreeItem =
  | (FilesEntry & { id: string; children?: FilesTreeItem[] })
  | {
      id: string
      name: string
      relativePath: string
      kind: 'status'
      status: 'loading' | 'empty' | 'error'
      message?: string
      parentPath: string
    }

type RootState =
  | { status: 'loading' }
  | { status: 'ready'; items: FilesTreeItem[] }
  | { status: 'error'; message: string }

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'ready'; query: string; results: FilesSearchResult[] }
  | { status: 'error'; query: string; message: string }

const EXPLORER_MIN_WIDTH = 180
const EXPLORER_MAX_WIDTH = 520
const EXPLORER_RESIZE_STEP = 20
const saveConflictMessage =
  'This file changed on disk. Reload from disk or review the external changes before saving.'

type FilesToolProps =
  | { sessionId: string; treeLabel?: string; createRichImageAdapter?: RichImageAdapterFactory }
  | {
      contextKey: string
      ipcContext: FilesContext
      treeLabel?: string
      createRichImageAdapter?: RichImageAdapterFactory
    }

type RichImageAdapterFactory = (documentRelativePath: string) => RichMarkdownImageAdapter

export function FilesTool(props: FilesToolProps): React.JSX.Element {
  const contextKey = 'sessionId' in props ? props.sessionId : props.contextKey
  const ipcContext: FilesContext =
    'sessionId' in props
      ? { kind: 'project-session', sessionId: props.sessionId }
      : props.ipcContext
  return (
    <FilesToolSession
      key={contextKey}
      contextKey={contextKey}
      ipcContext={ipcContext}
      createRichImageAdapter={props.createRichImageAdapter}
      treeLabel={props.treeLabel ?? 'Project files'}
    />
  )
}

function FilesToolSession({
  contextKey,
  ipcContext,
  createRichImageAdapter,
  treeLabel
}: {
  contextKey: string
  ipcContext: FilesContext
  createRichImageAdapter?: RichImageAdapterFactory
  treeLabel: string
}): React.JSX.Element {
  const sessionId = contextKey
  const context =
    useFilesStore((state) => state.contexts[contextKey]) ?? createDefaultFilesContext()
  const setExplorerWidth = useFilesStore((state) => state.setExplorerWidth)
  const setExplorerCollapsed = useFilesStore((state) => state.setExplorerCollapsed)
  const setSelectedPath = useFilesStore((state) => state.setSelectedPath)
  const setExpanded = useFilesStore((state) => state.setExpanded)
  const activateTab = useFilesStore((state) => state.activateTab)
  const promoteTab = useFilesStore((state) => state.promoteTab)
  const closeTab = useFilesStore((state) => state.closeTab)
  const discardAndCloseTab = useFilesStore((state) => state.discardAndCloseTab)
  const reorderTabs = useFilesStore((state) => state.reorderTabs)
  const setEditorMode = useFilesStore((state) => state.setEditorMode)
  const updateDraft = useFilesStore((state) => state.updateDraft)
  const markSaving = useFilesStore((state) => state.markSaving)
  const markSaveFailed = useFilesStore((state) => state.markSaveFailed)
  const markSaved = useFilesStore((state) => state.markSaved)
  const discardDirtyTabsInPath = useFilesStore((state) => state.discardDirtyTabsInPath)
  const rewritePaths = useFilesStore((state) => state.rewritePaths)
  const closeTabsInPath = useFilesStore((state) => state.closeTabsInPath)
  const [rootState, setRootState] = useState<RootState>({ status: 'loading' })
  const [searchQuery, setSearchQuery] = useState('')
  const [includeIgnoredSearch, setIncludeIgnoredSearch] = useState(false)
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' })
  const [treeHeight, setTreeHeight] = useState(480)
  const [closePromptPath, setClosePromptPath] = useState<string | null>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const activeSessionRef = useRef(sessionId)
  const expandedPathsRef = useRef(context.expandedPaths)
  const restoredRootRef = useRef(false)
  const searchRequestRef = useRef(0)
  const activeSearchRequestIdRef = useRef<string | null>(null)
  const activeDocument = getActiveFilesTab(context)
  expandedPathsRef.current = context.expandedPaths

  const loadRoot = useCallback(async (): Promise<void> => {
    const requestedSession = sessionId
    restoredRootRef.current = false
    setRootState({ status: 'loading' })
    try {
      const entries = await window.spacezero.files.listDirectory({
        context: ipcContext,
        relativePath: ''
      })
      if (activeSessionRef.current !== requestedSession) return
      setRootState({ status: 'ready', items: entries.map(toTreeItem) })
    } catch (error) {
      if (activeSessionRef.current !== requestedSession) return
      setRootState({ status: 'error', message: filesErrorMessage(error) })
    }
  }, [ipcContext, sessionId])

  const loadDirectory = useCallback(
    async function loadDirectory(relativePath: string): Promise<void> {
      const requestedSession = sessionId
      setRootState((state) =>
        state.status === 'ready'
          ? {
              status: 'ready',
              items: replaceDirectoryChildren(state.items, relativePath, [
                statusItem(relativePath, 'loading')
              ])
            }
          : state
      )
      try {
        const entries = await window.spacezero.files.listDirectory({
          context: ipcContext,
          relativePath
        })
        if (activeSessionRef.current !== requestedSession) return
        setRootState((state) =>
          state.status === 'ready'
            ? {
                status: 'ready',
                items: replaceDirectoryChildren(
                  state.items,
                  relativePath,
                  entries.length > 0 ? entries.map(toTreeItem) : [statusItem(relativePath, 'empty')]
                )
              }
            : state
        )

        for (const entry of entries) {
          if (entry.kind === 'directory' && expandedPathsRef.current.includes(entry.relativePath)) {
            await loadDirectory(entry.relativePath)
          }
        }
      } catch (error) {
        if (activeSessionRef.current !== requestedSession) return
        setRootState((state) =>
          state.status === 'ready'
            ? {
                status: 'ready',
                items: replaceDirectoryChildren(state.items, relativePath, [
                  statusItem(relativePath, 'error', filesErrorMessage(error))
                ])
              }
            : state
        )
      }
    },
    [ipcContext, sessionId]
  )

  const openFile = useCallback(
    async (
      relativePath: string,
      intent: FilesOpenTabIntent,
      targetLine?: number
    ): Promise<void> => {
      await openFilesLocation({
        contextKey: sessionId,
        ipcContext,
        relativePath,
        intent,
        line: targetLine,
        revalidateExisting: false,
        allowMetadata: true
      })
    },
    [ipcContext, sessionId]
  )

  const cancelActiveSearch = useCallback((): void => {
    const requestId = activeSearchRequestIdRef.current
    if (!requestId) return
    activeSearchRequestIdRef.current = null
    void window.spacezero.files.cancelSearch({ context: ipcContext, requestId })
  }, [ipcContext])

  const invalidateSearchResults = useCallback((): void => {
    cancelActiveSearch()
    searchRequestRef.current += 1
    setSearchQuery('')
    setSearchState({ status: 'idle' })
  }, [cancelActiveSearch])

  const performSearch = useCallback(
    async (query: string, includeIgnored: boolean): Promise<void> => {
      const normalizedQuery = query.trim()
      cancelActiveSearch()
      const requestSequence = searchRequestRef.current + 1
      const requestId = `${sessionId}:${requestSequence}`
      searchRequestRef.current = requestSequence
      activeSearchRequestIdRef.current = requestId
      if (!normalizedQuery) {
        activeSearchRequestIdRef.current = null
        setSearchState({ status: 'idle' })
        return
      }
      setSearchState({ status: 'loading', query: normalizedQuery })
      try {
        const results = await window.spacezero.files.search({
          context: ipcContext,
          query: normalizedQuery,
          includeIgnored,
          requestId
        })
        if (activeSearchRequestIdRef.current === requestId) activeSearchRequestIdRef.current = null
        if (
          searchRequestRef.current !== requestSequence ||
          activeSessionRef.current !== sessionId
        ) {
          return
        }
        setSearchState({ status: 'ready', query: normalizedQuery, results })
      } catch (error) {
        if (activeSearchRequestIdRef.current === requestId) activeSearchRequestIdRef.current = null
        if (
          searchRequestRef.current !== requestSequence ||
          activeSessionRef.current !== sessionId
        ) {
          return
        }
        if (error instanceof Error && error.message.includes('files.searchCanceled')) return
        setSearchState({
          status: 'error',
          query: normalizedQuery,
          message: searchErrorMessage(error)
        })
      }
    },
    [cancelActiveSearch, ipcContext, sessionId]
  )

  const clearSearch = useCallback((): void => {
    invalidateSearchResults()
  }, [invalidateSearchResults])

  const refreshActiveSearch = useCallback((): void => {
    const state = searchState
    if (state.status === 'idle') return
    void performSearch(state.query, includeIgnoredSearch)
  }, [includeIgnoredSearch, performSearch, searchState])

  const revealTreePath = useCallback(
    async (relativePath: string): Promise<void> => {
      const ancestors = ancestorDirectoryPaths(relativePath)
      for (const ancestor of ancestors) setExpanded(sessionId, ancestor, true)
      await loadRoot()
      for (const ancestor of ancestors) await loadDirectory(ancestor)
      setSelectedPath(sessionId, relativePath)
    },
    [loadDirectory, loadRoot, sessionId, setExpanded, setSelectedPath]
  )

  const saveDocumentSnapshot = useCallback(
    async (document: Extract<FilesTabState, { status: 'ready' }>): Promise<boolean> => {
      if (document.saveStatus === 'saving') return false
      const saveRequest = {
        relativePath: document.relativePath,
        content: document.draft,
        expectedRevision: document.revision
      }
      markSaving(sessionId, saveRequest)
      try {
        const result = await window.spacezero.files.saveDocument({
          context: ipcContext,
          ...saveRequest
        })
        if (result.status === 'conflict') {
          markSaveFailed(sessionId, saveConflictMessage, saveRequest)
          return false
        }
        markSaved(sessionId, result.document, saveRequest)
        invalidateSearchResults()
        return true
      } catch (error) {
        markSaveFailed(sessionId, saveErrorMessage(error), saveRequest)
        return false
      }
    },
    [invalidateSearchResults, ipcContext, markSaveFailed, markSaved, markSaving, sessionId]
  )

  const saveActiveDocument = useCallback(async (): Promise<void> => {
    if (!activeDocument || activeDocument.status !== 'ready') return
    await saveDocumentSnapshot(activeDocument)
  }, [activeDocument, saveDocumentSnapshot])

  const saveAllDirtyDocuments = useCallback(async (): Promise<void> => {
    const dirtyDocuments = context.tabs.filter(
      (tab): tab is Extract<FilesTabState, { status: 'ready' }> =>
        tab.status === 'ready' && tab.dirty && tab.saveStatus !== 'saving'
    )
    await Promise.all(dirtyDocuments.map((document) => saveDocumentSnapshot(document)))
  }, [context.tabs, saveDocumentSnapshot])

  const prepareDirtyOperation = useCallback(
    async (relativePath: string): Promise<boolean> => {
      const dirtyTabs =
        useFilesStore
          .getState()
          .contexts[sessionId]?.tabs.filter(
            (tab): tab is Extract<FilesTabState, { status: 'ready' }> =>
              tab.status === 'ready' &&
              tab.dirty &&
              isPathAffectedBy(tab.relativePath, relativePath)
          ) ?? []
      if (dirtyTabs.length === 0) return true
      const choice = window
        .prompt(
          `Save, discard, or cancel before changing ${relativePath}? Type save, discard, or cancel.`,
          'cancel'
        )
        ?.trim()
        .toLowerCase()
      if (choice === 'save') {
        const results = await Promise.all(dirtyTabs.map((tab) => saveDocumentSnapshot(tab)))
        return results.every(Boolean)
      }
      if (choice === 'discard') {
        discardDirtyTabsInPath(sessionId, relativePath)
        return true
      }
      return false
    },
    [discardDirtyTabsInPath, saveDocumentSnapshot, sessionId]
  )

  const createEntry = useCallback(
    async (kind: 'file' | 'folder', parentPath = ''): Promise<void> => {
      const name = window.prompt(`New ${kind} name`)
      if (!name?.trim()) return
      const relativePath = joinRelativePath(parentPath, name.trim())
      try {
        await window.spacezero.files.createEntry({ context: ipcContext, relativePath, kind })
        await revealTreePath(relativePath)
        refreshActiveSearch()
        if (kind === 'file') await openFile(relativePath, 'permanent')
      } catch (error) {
        window.alert(fileOperationErrorMessage(error))
      }
    },
    [ipcContext, openFile, refreshActiveSearch, revealTreePath]
  )

  const moveEntry = useCallback(
    async (sourcePath: string, destinationPath?: string): Promise<void> => {
      const targetPath = destinationPath ?? window.prompt('Move to relative path', sourcePath)
      if (!targetPath?.trim() || targetPath.trim() === sourcePath) return
      if (!(await prepareDirtyOperation(sourcePath))) return
      try {
        await window.spacezero.files.moveEntry({
          context: ipcContext,
          sourcePath,
          destinationPath: targetPath.trim()
        })
        const destination = targetPath.trim()
        migrateFilesMonacoEditorState(sessionId, sourcePath, destination)
        rewritePaths(sessionId, sourcePath, destination)
        await revealTreePath(destination)
        refreshActiveSearch()
      } catch (error) {
        window.alert(fileOperationErrorMessage(error))
      }
    },
    [ipcContext, prepareDirtyOperation, refreshActiveSearch, revealTreePath, rewritePaths, sessionId]
  )

  const trashEntry = useCallback(
    async (relativePath: string): Promise<void> => {
      if (!window.confirm(`Move ${relativePath} to Trash?`)) return
      if (!(await prepareDirtyOperation(relativePath))) return
      try {
        await window.spacezero.files.trashEntry({ context: ipcContext, relativePath })
        closeTabsInPath(sessionId, relativePath)
        setSelectedPath(sessionId, parentDirectoryPath(relativePath) || null)
        await loadRoot()
        refreshActiveSearch()
      } catch (error) {
        window.alert(fileOperationErrorMessage(error))
      }
    },
    [
      closeTabsInPath,
      ipcContext,
      loadRoot,
      prepareDirtyOperation,
      refreshActiveSearch,
      sessionId,
      setSelectedPath
    ]
  )

  const requestCloseTab = useCallback(
    (targetSessionId: string, relativePath: string): void => {
      const tab = useFilesStore
        .getState()
        .contexts[targetSessionId]?.tabs.find(
          (candidate) => candidate.relativePath === relativePath
        )
      if (tab?.status === 'ready' && tab.dirty) {
        setClosePromptPath(relativePath)
        return
      }
      closeTab(targetSessionId, relativePath)
    },
    [closeTab]
  )

  const saveAndClosePromptTab = useCallback(async (): Promise<void> => {
    if (!closePromptPath) return
    const tab = useFilesStore
      .getState()
      .contexts[sessionId]?.tabs.find(
        (candidate): candidate is Extract<FilesTabState, { status: 'ready' }> =>
          candidate.relativePath === closePromptPath && candidate.status === 'ready'
      )
    if (!tab) {
      setClosePromptPath(null)
      return
    }
    const saved = await saveDocumentSnapshot(tab)
    const currentTab = useFilesStore
      .getState()
      .contexts[sessionId]?.tabs.find((candidate) => candidate.relativePath === closePromptPath)
    if (saved && !(currentTab?.status === 'ready' && currentTab.dirty)) {
      closeTab(sessionId, closePromptPath)
      setClosePromptPath(null)
    }
  }, [closePromptPath, closeTab, saveDocumentSnapshot, sessionId])

  const discardAndClosePromptTab = useCallback((): void => {
    if (!closePromptPath) return
    discardAndCloseTab(sessionId, closePromptPath)
    setClosePromptPath(null)
  }, [closePromptPath, discardAndCloseTab, sessionId])

  useEffect(() => {
    activeSessionRef.current = sessionId
    invalidateSearchResults()
    void loadRoot()
    return () => {
      cancelActiveSearch()
      if (activeSessionRef.current === sessionId) activeSessionRef.current = ''
    }
  }, [cancelActiveSearch, invalidateSearchResults, loadRoot, sessionId])

  useEffect(() => {
    const subscriptionId = `${sessionId}:files-observation`
    void window.spacezero.files.observe({ context: ipcContext, subscriptionId })
    const unsubscribeEvents = window.spacezero.files.onObservationEvent((event) => {
      if (event.subscriptionId === subscriptionId && event.contextKey === sessionId) {
        invalidateSearchResults()
      }
    })
    return () => {
      unsubscribeEvents()
      void window.spacezero.files.unobserve({ subscriptionId })
    }
  }, [invalidateSearchResults, ipcContext, sessionId])

  useEffect(() => {
    if (rootState.status !== 'ready' || restoredRootRef.current) return
    restoredRootRef.current = true
    const expandedRoots = rootState.items.filter(
      (item) => item.kind === 'directory' && expandedPathsRef.current.includes(item.relativePath)
    )
    void (async () => {
      for (const item of expandedRoots) await loadDirectory(item.relativePath)
    })()
  }, [loadDirectory, rootState])

  useEffect(() => {
    const element = treeContainerRef.current
    if (!element) return
    const updateHeight = (): void => {
      const height = Math.floor(element.getBoundingClientRect().height)
      if (height > 0) setTreeHeight(height)
    }
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [context.explorerCollapsed])

  const initialOpenState = useMemo(
    () => Object.fromEntries(context.expandedPaths.map((path) => [path, true])),
    [context.expandedPaths]
  )
  const selectedTreeItem = useMemo(
    () =>
      context.selectedPath && rootState.status === 'ready'
        ? findTreeItem(rootState.items, context.selectedPath)
        : null,
    [context.selectedPath, rootState]
  )

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = context.explorerWidth
    const move = (moveEvent: PointerEvent): void => {
      setExplorerWidth(sessionId, clampExplorerWidth(startWidth + moveEvent.clientX - startX))
    }
    const stop = (): void => window.removeEventListener('pointermove', move)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }

  function resizeWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>): void {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!direction) return
    event.preventDefault()
    setExplorerWidth(
      sessionId,
      clampExplorerWidth(context.explorerWidth + direction * EXPLORER_RESIZE_STEP)
    )
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void saveActiveDocument()
    }
  }

  return (
    <section aria-label="Files explorer" className="flex h-full min-h-0 bg-background">
      {context.explorerCollapsed ? (
        <button
          aria-label="Expand Files explorer"
          className="m-2 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          type="button"
          onClick={() => setExplorerCollapsed(sessionId, false)}
        >
          <SidebarSimple aria-hidden className="size-4" />
        </button>
      ) : (
        <>
          <div
            className="flex min-h-0 shrink-0 flex-col border-r bg-background"
            style={{ width: clampExplorerWidth(context.explorerWidth) }}
          >
            <header className="flex shrink-0 flex-col gap-2 border-b p-2">
              <div className="flex h-7 items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Explorer
                </span>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="New file"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                    type="button"
                    onClick={() =>
                      void createEntry(
                        'file',
                        selectedDirectoryPath(context.selectedPath, rootState)
                      )
                    }
                  >
                    <Plus aria-hidden className="size-3" />
                    <span className="sr-only">New file</span>
                  </button>
                  <button
                    aria-label="New folder"
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                    type="button"
                    onClick={() =>
                      void createEntry(
                        'folder',
                        selectedDirectoryPath(context.selectedPath, rootState)
                      )
                    }
                  >
                    Folder
                  </button>
                  <button
                    aria-label="Collapse Files explorer"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                    type="button"
                    onClick={() => setExplorerCollapsed(sessionId, true)}
                  >
                    <SidebarSimple aria-hidden className="size-4" />
                  </button>
                </div>
              </div>
              <form
                className="flex items-center gap-1"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault()
                  void performSearch(searchQuery, includeIgnoredSearch)
                }}
              >
                <div className="flex min-w-0 flex-1 items-center rounded-md border px-2">
                  <MagnifyingGlass
                    aria-hidden
                    className="mr-1 size-3 shrink-0 text-muted-foreground"
                  />
                  <input
                    aria-label="Search files"
                    className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    placeholder="Search files"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </div>
                {searchState.status !== 'idle' ? (
                  <button
                    aria-label="Return to file tree"
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                    type="button"
                    onClick={clearSearch}
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                ) : null}
              </form>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  checked={includeIgnoredSearch}
                  type="checkbox"
                  onChange={(event) => {
                    const checked = event.target.checked
                    setIncludeIgnoredSearch(checked)
                    if (searchState.status !== 'idle') void performSearch(searchQuery, checked)
                  }}
                />
                Include ignored files
              </label>
              {selectedTreeItem && selectedTreeItem.kind !== 'status' ? (
                <div className="flex flex-wrap items-center gap-1 border-t pt-2 text-xs">
                  <span
                    aria-label={`Selected ${selectedTreeItem.relativePath}`}
                    className="mr-1 min-w-0 truncate text-muted-foreground"
                    title={selectedTreeItem.relativePath}
                  />
                  {selectedTreeItem.kind !== 'symlink' ? (
                    <>
                      <button
                        className="rounded-md border px-2 py-1 hover:bg-accent"
                        type="button"
                        onClick={() => void moveEntry(selectedTreeItem.relativePath)}
                      >
                        Move
                      </button>
                      <button
                        className="rounded-md border px-2 py-1 hover:bg-accent"
                        type="button"
                        onClick={() => {
                          const destinationPath = window.prompt(
                            'Rename to relative path',
                            selectedTreeItem.relativePath
                          )
                          if (destinationPath?.trim()) {
                            void moveEntry(selectedTreeItem.relativePath, destinationPath.trim())
                          }
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="rounded-md border px-2 py-1 hover:bg-accent"
                        type="button"
                        onClick={() => void trashEntry(selectedTreeItem.relativePath)}
                      >
                        Trash
                      </button>
                    </>
                  ) : null}
                  <button
                    className="rounded-md border px-2 py-1 hover:bg-accent"
                    type="button"
                    onClick={() =>
                      void window.spacezero.files
                        .revealInSystemFileManager({
                          context: ipcContext,
                          relativePath: selectedTreeItem.relativePath
                        })
                        .catch((error) => window.alert(filesErrorMessage(error)))
                    }
                  >
                    Reveal selected item
                  </button>
                </div>
              ) : null}
            </header>
            <div ref={treeContainerRef} className="min-h-0 flex-1 overflow-hidden">
              {searchState.status !== 'idle' ? (
                <FilesSearchResults
                  state={searchState}
                  onOpen={(result) => {
                    const targetLine =
                      result.kind === 'content' ? result.snippets[0]?.line : undefined
                    void openFile(result.relativePath, 'preview', targetLine)
                  }}
                  onRetry={() => void performSearch(searchQuery, includeIgnoredSearch)}
                />
              ) : rootState.status === 'loading' ? (
                <FilesState message="Loading files…" />
              ) : rootState.status === 'error' ? (
                <FilesState message={rootState.message} actionLabel="Retry" onAction={loadRoot} />
              ) : rootState.items.length === 0 ? (
                <FilesState message="This worktree is empty." />
              ) : (
                <Tree<FilesTreeItem>
                  key={sessionId}
                  aria-label={treeLabel}
                  data={rootState.items}
                  disableMultiSelection
                  height={treeHeight}
                  idAccessor="id"
                  indent={16}
                  initialOpenState={initialOpenState}
                  openByDefault={false}
                  rowHeight={28}
                  selection={context.selectedPath ?? undefined}
                  width="100%"
                  onSelect={(nodes) => {
                    const item = nodes[0]?.data
                    if (!item || item.kind === 'status') return
                    if (item.kind === 'file') {
                      void openFile(item.relativePath, 'preview')
                    } else {
                      setSelectedPath(sessionId, item.relativePath)
                    }
                  }}
                  onMove={({ dragIds, parentId }) => {
                    const sourcePath = dragIds[0]
                    if (!sourcePath) return
                    const destinationPath = joinRelativePath(parentId ?? '', pathName(sourcePath))
                    void moveEntry(sourcePath, destinationPath)
                  }}
                  onRename={({ id, name }) => {
                    const destinationPath = joinRelativePath(parentDirectoryPath(id), name)
                    void moveEntry(id, destinationPath)
                  }}
                  onToggle={(id) => {
                    const expanded = !context.expandedPaths.includes(id)
                    setExpanded(sessionId, id, expanded)
                    if (expanded) void loadDirectory(id)
                  }}
                >
                  {(props) => (
                    <FilesTreeRow
                      {...props}
                      ipcContext={ipcContext}
                      onCreate={createEntry}
                      onMove={moveEntry}
                      onOpenPermanent={(relativePath) => openFile(relativePath, 'permanent')}
                      onRetry={loadDirectory}
                      onTrash={trashEntry}
                    />
                  )}
                </Tree>
              )}
            </div>
          </div>
          <div
            aria-label="Resize Files explorer"
            aria-orientation="vertical"
            aria-valuemax={EXPLORER_MAX_WIDTH}
            aria-valuemin={EXPLORER_MIN_WIDTH}
            aria-valuenow={context.explorerWidth}
            className="w-1 shrink-0 cursor-col-resize focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            role="separator"
            tabIndex={0}
            onKeyDown={resizeWithKeyboard}
            onPointerDown={startResize}
          />
        </>
      )}
      <div
        className="relative flex min-w-0 flex-1 flex-col bg-background"
        onKeyDown={handleEditorKeyDown}
      >
        <FilesTabStrip
          activeTabPath={context.activeTabPath}
          sessionId={sessionId}
          tabs={context.tabs}
          onActivate={activateTab}
          onClose={requestCloseTab}
          onReorder={reorderTabs}
          onSaveAll={saveAllDirtyDocuments}
        />
        <FilesEditorPanel
          document={activeDocument}
          sessionId={sessionId}
          ipcContext={ipcContext}
          onChange={(draft) => updateDraft(sessionId, draft)}
          onPin={(relativePath) => promoteTab(sessionId, relativePath)}
          createRichImageAdapter={createRichImageAdapter}
          onSave={saveActiveDocument}
          onSetEditorMode={(relativePath, mode) => setEditorMode(sessionId, relativePath, mode)}
        />
        {closePromptPath ? (
          <DirtyTabCloseDialog
            fileName={pathName(closePromptPath)}
            onCancel={() => setClosePromptPath(null)}
            onDiscard={discardAndClosePromptTab}
            onSave={() => void saveAndClosePromptTab()}
          />
        ) : null}
      </div>
    </section>
  )
}

function DirtyTabCloseDialog({
  fileName,
  onCancel,
  onDiscard,
  onSave
}: {
  fileName: string
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}): React.JSX.Element {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 p-4">
      <div
        aria-modal="true"
        className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-lg"
        role="dialog"
      >
        <h2 className="text-sm font-semibold">Save changes to {fileName}?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This tab has unsaved changes. Save, discard, or cancel before closing it.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-md border px-3 py-1 text-sm hover:bg-accent"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-md border px-3 py-1 text-sm hover:bg-accent"
            type="button"
            onClick={onDiscard}
          >
            Discard
          </button>
          <button
            className="rounded-md border px-3 py-1 text-sm hover:bg-accent"
            type="button"
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function FilesSearchResults({
  state,
  onOpen,
  onRetry
}: {
  state: SearchState
  onOpen: (result: FilesSearchResult) => void
  onRetry: () => void | Promise<void>
}): React.JSX.Element {
  if (state.status === 'loading') return <FilesState message="Searching files…" />
  if (state.status === 'error') {
    return <FilesState message={state.message} actionLabel="Retry" onAction={onRetry} />
  }
  if (state.status === 'idle') return <FilesState message="Enter a search query." />
  if (state.results.length === 0) return <FilesState message={`No results for “${state.query}”.`} />

  return (
    <div className="h-full overflow-auto p-2" aria-label="Search results">
      <p className="mb-2 text-xs text-muted-foreground">
        {state.results.length} result{state.results.length === 1 ? '' : 's'} for “{state.query}”
      </p>
      <div className="space-y-1">
        {state.results.map((result, index) => (
          <button
            key={`${result.kind}:${result.relativePath}:${index}`}
            className="w-full rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
            type="button"
            onClick={() => onOpen(result)}
          >
            <span className="block truncate font-medium text-foreground">{result.name}</span>
            <span className="block truncate text-muted-foreground">{result.relativePath}</span>
            {result.kind === 'content' ? (
              <span className="mt-1 block space-y-1 text-muted-foreground">
                {result.snippets.map((snippet) => (
                  <span key={`${snippet.line}:${snippet.column}`} className="block truncate">
                    {snippet.line}:{snippet.column} {snippet.text}
                  </span>
                ))}
              </span>
            ) : (
              <span className="mt-1 block text-muted-foreground">Filename match</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function FilesTabStrip({
  activeTabPath,
  sessionId,
  tabs,
  onActivate,
  onClose,
  onReorder,
  onSaveAll
}: {
  activeTabPath: string | null
  sessionId: string
  tabs: FilesTabState[]
  onActivate: (sessionId: string, relativePath: string) => void
  onClose: (sessionId: string, relativePath: string) => void
  onReorder: (
    sessionId: string,
    sourcePath: string,
    targetPath: string,
    dropPosition: FilesTabDropPosition
  ) => void
  onSaveAll: () => void | Promise<void>
}): React.JSX.Element | null {
  const activeTabRef = useRef<HTMLButtonElement | null>(null)
  const draggedPathRef = useRef<string | null>(null)

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabPath, tabs.length])

  if (tabs.length === 0) return null

  const dirtyCount = tabs.filter((tab) => tab.status === 'ready' && tab.dirty).length

  return (
    <div className="flex h-10 shrink-0 border-b bg-background">
      <div aria-label="Open files" className="flex min-w-0 flex-1 overflow-x-auto" role="tablist">
        {tabs.map((tab) => {
          const active = tab.relativePath === activeTabPath
          const dirty = tab.status === 'ready' && tab.dirty
          return (
            <div
              key={tab.relativePath}
              className="flex min-w-36 max-w-56 shrink-0 items-center border-r"
              draggable
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => {
                draggedPathRef.current = tab.relativePath
              }}
              onDrop={(event) => {
                event.preventDefault()
                const sourcePath = draggedPathRef.current
                draggedPathRef.current = null
                if (sourcePath) {
                  onReorder(sessionId, sourcePath, tab.relativePath, tabDropPosition(event))
                }
              }}
            >
              <button
                ref={active ? activeTabRef : undefined}
                aria-selected={active}
                className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-xs ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'} ${tab.preview ? 'italic' : ''}`}
                role="tab"
                type="button"
                onClick={() => onActivate(sessionId, tab.relativePath)}
              >
                <span>{dirty ? '● ' : ''}</span>
                <span>{tab.name}</span>
                {tab.preview ? <span className="sr-only"> preview</span> : null}
              </button>
              <button
                aria-label={`Close ${tab.name}`}
                className="mr-1 rounded px-1 text-muted-foreground hover:bg-accent disabled:opacity-40"
                title={
                  dirty ? 'Save or discard changes before closing this tab.' : `Close ${tab.name}`
                }
                type="button"
                onClick={() => onClose(sessionId, tab.relativePath)}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      <button
        className="m-1 shrink-0 rounded-md border px-2 text-xs text-foreground hover:bg-accent disabled:opacity-50"
        disabled={dirtyCount === 0}
        type="button"
        onClick={() => void onSaveAll()}
      >
        Save All
      </button>
    </div>
  )
}

function tabDropPosition(event: React.DragEvent<HTMLElement>): FilesTabDropPosition {
  const bounds = event.currentTarget.getBoundingClientRect()
  return event.clientX > bounds.left + bounds.width / 2 ? 'after' : 'before'
}

function FilesEditorPanel({
  document,
  sessionId,
  onChange,
  onPin,
  createRichImageAdapter,
  onSave,
  onSetEditorMode,
  ipcContext
}: {
  document: FilesTabState | null
  sessionId: string
  ipcContext: FilesContext
  createRichImageAdapter?: RichImageAdapterFactory
  onChange: (draft: string) => void
  onPin: (relativePath: string) => void
  onSave: () => void | Promise<void>
  onSetEditorMode: (relativePath: string, mode: FilesEditorMode) => void
}): React.JSX.Element {
  if (!document) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Select a file to open it.
      </div>
    )
  }

  if (document.status === 'loading') {
    return <FilesState message="Opening file…" />
  }

  if (document.status === 'error') {
    return <FilesState message={document.message} />
  }

  if (document.status === 'metadata') {
    if (document.contentKind === 'image') {
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-6 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="font-medium text-foreground">{document.name}</p>
              <p>{document.relativePath}</p>
            </div>
            <FilesRevealButton ipcContext={ipcContext} relativePath={document.relativePath} />
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md bg-muted/30 p-4">
            <img
              src={document.dataUrl}
              alt={document.name}
              className="max-h-full max-w-full object-contain"
              draggable={false}
            />
          </div>
          <p>
            {document.mediaType} · {formatBytes(document.size)} · Modified{' '}
            {formatTimestamp(document.modifiedAt)}
          </p>
        </div>
      )
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{document.name}</p>
        <p>{metadataMessage(document.contentKind, document.classification)}</p>
        <p>{document.relativePath}</p>
        <p>
          {formatBytes(document.size)} · Modified {formatTimestamp(document.modifiedAt)}
        </p>
        <p>Classification: {metadataClassificationLabel(document.classification)}</p>
        <FilesRevealButton ipcContext={ipcContext} relativePath={document.relativePath} />
      </div>
    )
  }

  return (
    <FilesReadyEditorPanel
      document={document}
      sessionId={sessionId}
      onChange={onChange}
      onPin={onPin}
      createRichImageAdapter={createRichImageAdapter}
      onSave={onSave}
      onSetEditorMode={onSetEditorMode}
    />
  )
}

function FilesReadyEditorPanel({
  document,
  sessionId,
  onChange,
  onPin,
  createRichImageAdapter,
  onSave,
  onSetEditorMode
}: {
  document: Extract<FilesTabState, { status: 'ready' }>
  sessionId: string
  createRichImageAdapter?: RichImageAdapterFactory
  onChange: (draft: string) => void
  onPin: (relativePath: string) => void
  onSave: () => void | Promise<void>
  onSetEditorMode: (relativePath: string, mode: FilesEditorMode) => void
}): React.JSX.Element {
  const onSaveRef = useRef(onSave)
  const editorRef = useRef<Parameters<FilesMonacoEditorMount>[0] | null>(null)
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])
  const editorOptions = useMemo(
    () => ({ minimap: { enabled: false }, scrollBeyondLastLine: false }),
    []
  )
  const handleEditorMount = useCallback<FilesMonacoEditorMount>((editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void onSaveRef.current()
    })
  }, [])

  useEffect(() => {
    if (document.targetLine === undefined) return
    const editor = editorRef.current
    if (!editor) return
    editor.revealLineInCenter(document.targetLine)
    editor.setPosition({ lineNumber: document.targetLine, column: 1 })
    editor.focus()
    if (document.locationRequestId !== undefined) {
      useFilesStore
        .getState()
        .clearLocationTarget(sessionId, document.relativePath, document.locationRequestId)
    }
  }, [document.locationRequestId, document.relativePath, document.targetLine, sessionId])
  const supportsRichMode = isMarkdownDocumentPath(document.relativePath)
  const richModeLimitation = supportsRichMode
    ? getRichMarkdownLimitation(document.draft, { isMdx: isMdxPath(document.relativePath) })
    : null
  const activeMode: FilesEditorMode =
    document.targetLine === undefined &&
    supportsRichMode &&
    !richModeLimitation &&
    document.editorMode === 'rich'
      ? 'rich'
      : 'source'
  const language = getFilesEditorLanguage(document.relativePath)
  const richImageAdapter = useMemo(
    () => createRichImageAdapter?.(document.relativePath),
    [createRichImageAdapter, document.relativePath]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-9 shrink-0 items-center justify-between border-b px-3 text-xs">
        <div className="min-w-0">
          <span className="font-medium">{document.name}</span>
          {document.preview ? <span className="ml-2 text-muted-foreground">Preview</span> : null}
          {document.dirty ? <span className="ml-2 text-amber-600">Unsaved changes</span> : null}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          {supportsRichMode ? (
            <div className="flex items-center rounded-md border p-0.5" aria-label="Editor mode">
              <button
                aria-pressed={activeMode === 'rich'}
                className={`rounded px-2 py-0.5 text-foreground disabled:opacity-50 ${activeMode === 'rich' ? 'bg-muted' : 'hover:bg-accent'}`}
                disabled={Boolean(richModeLimitation)}
                title={richModeLimitation ?? 'Use rich Markdown editing'}
                type="button"
                onClick={() => onSetEditorMode(document.relativePath, 'rich')}
              >
                Rich
              </button>
              <button
                aria-pressed={activeMode === 'source'}
                className={`rounded px-2 py-0.5 text-foreground ${activeMode === 'source' ? 'bg-muted' : 'hover:bg-accent'}`}
                type="button"
                onClick={() => onSetEditorMode(document.relativePath, 'source')}
              >
                Source
              </button>
            </div>
          ) : null}
          {document.saveStatus === 'saving' ? <span>Saving…</span> : null}
          {!document.dirty && document.saveStatus !== 'saving' ? <span>Saved</span> : null}
          {document.preview ? (
            <button
              className="rounded-md border px-2 py-1 text-foreground hover:bg-accent"
              type="button"
              onClick={() => onPin(document.relativePath)}
            >
              Pin preview
            </button>
          ) : null}
          <button
            className="rounded-md border px-2 py-1 text-foreground hover:bg-accent disabled:opacity-50"
            disabled={document.saveStatus === 'saving'}
            type="button"
            onClick={() => void onSave()}
          >
            Save
          </button>
        </div>
      </header>
      {document.error ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {document.error}
        </div>
      ) : null}
      {richModeLimitation ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          {richModeLimitation}
        </div>
      ) : null}
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {activeMode === 'rich' ? (
          <RichMarkdownEditor
            key={`${sessionId}:${document.editorStateKey}`}
            documentRelativePath={document.relativePath}
            imageAdapter={richImageAdapter}
            markdown={document.draft}
            onChange={onChange}
          />
        ) : (
          <FilesMonacoEditor
            height="100%"
            language={language}
            options={editorOptions}
            path={createFilesMonacoModelPath(sessionId, document.relativePath)}
            theme="vs-dark"
            value={document.draft}
            onChange={(value) => onChange(value ?? '')}
            onMount={handleEditorMount}
          />
        )}
      </div>
    </div>
  )
}

function FilesTreeRow({
  node,
  style,
  dragHandle,
  onCreate,
  onMove,
  onOpenPermanent,
  onRetry,
  onTrash,
  ipcContext
}: NodeRendererProps<FilesTreeItem> & {
  ipcContext: FilesContext
  onCreate: (kind: 'file' | 'folder', parentPath?: string) => Promise<void>
  onMove: (sourcePath: string, destinationPath?: string) => Promise<void>
  onOpenPermanent: (relativePath: string) => Promise<void>
  onRetry: (relativePath: string) => Promise<void>
  onTrash: (relativePath: string) => Promise<void>
}): React.JSX.Element {
  const item = node.data
  if (item.kind === 'status') {
    return (
      <div className="flex items-center gap-2 pr-2 text-xs text-muted-foreground" style={style}>
        <span className="truncate">{item.message ?? statusMessage(item.status)}</span>
        {item.status === 'error' ? (
          <button
            className="underline underline-offset-2"
            type="button"
            onClick={() => void onRetry(item.parentPath)}
          >
            Retry
          </button>
        ) : null}
      </div>
    )
  }

  const expandable = item.kind === 'directory'
  return (
    <div
      ref={dragHandle}
      className={`group flex cursor-default items-center gap-1 pr-2 text-sm outline-none ${node.isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
      style={style}
      title={item.kind === 'symlink' ? `${item.name} — Symbolic link` : item.name}
      onClick={() => node.select()}
      onDoubleClick={() => {
        if (item.kind === 'file') void onOpenPermanent(item.relativePath)
      }}
    >
      {expandable ? (
        <button
          aria-label={`${node.isOpen ? 'Collapse' : 'Expand'} ${item.name}`}
          className="flex size-5 shrink-0 items-center justify-center"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            node.toggle()
          }}
        >
          {node.isOpen ? (
            <CaretDown aria-hidden className="size-3" />
          ) : (
            <CaretRight aria-hidden className="size-3" />
          )}
        </button>
      ) : (
        <span className="size-5 shrink-0" />
      )}
      <FilesIcon name={item.name} kind={item.kind} expanded={node.isOpen} />
      <span className="truncate">{item.name}</span>
      <span
        aria-hidden="true"
        className="ml-auto hidden items-center gap-1 group-hover:flex group-focus-within:flex"
      >
        {item.kind === 'directory' ? (
          <button
            className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground"
            tabIndex={-1}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              void onCreate('file', item.relativePath)
            }}
          >
            New
          </button>
        ) : null}
        {item.kind !== 'symlink' ? (
          <>
            <button
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground"
              tabIndex={-1}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void onMove(item.relativePath)
              }}
            >
              Move
            </button>
            <button
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground"
              tabIndex={-1}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                node.edit()
              }}
            >
              Rename
            </button>
            <button
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground"
              tabIndex={-1}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void onTrash(item.relativePath)
              }}
            >
              Trash
            </button>
          </>
        ) : null}
        {item.kind === 'symlink' ? <span className="sr-only">Symbolic link</span> : null}
        <FilesRevealButton ipcContext={ipcContext} relativePath={item.relativePath} compact />
      </span>
    </div>
  )
}

function FilesRevealButton({
  ipcContext,
  relativePath,
  compact = false
}: {
  ipcContext: FilesContext
  relativePath: string
  compact?: boolean
}): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  return (
    <span
      className={
        compact ? 'ml-auto inline-flex items-center' : 'inline-flex flex-col items-center gap-1'
      }
    >
      <button
        className={
          compact
            ? 'rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-background/80 hover:text-foreground'
            : 'rounded-md border px-3 py-1.5 text-sm text-foreground hover:bg-accent'
        }
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setError(null)
          void window.spacezero.files
            .revealInSystemFileManager({ context: ipcContext, relativePath })
            .catch((caughtError) => setError(filesErrorMessage(caughtError)))
        }}
      >
        Reveal in system file manager
      </button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  )
}

function FilesState({
  message,
  actionLabel,
  onAction
}: {
  message: string
  actionLabel?: string
  onAction?: () => void | Promise<void>
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-28 flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
      <p>{message}</p>
      {actionLabel && onAction ? (
        <button
          className="underline underline-offset-2"
          type="button"
          onClick={() => void onAction()}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

function toTreeItem(entry: FilesEntry): FilesTreeItem {
  return {
    ...entry,
    id: entry.relativePath,
    ...(entry.kind === 'directory' ? { children: [statusItem(entry.relativePath, 'loading')] } : {})
  }
}

function statusItem(
  parentPath: string,
  status: 'loading' | 'empty' | 'error',
  message?: string
): FilesTreeItem {
  return {
    id: `${parentPath}::${status}`,
    name: status,
    relativePath: `${parentPath}::${status}`,
    kind: 'status',
    status,
    message,
    parentPath
  }
}

function replaceDirectoryChildren(
  items: FilesTreeItem[],
  relativePath: string,
  children: FilesTreeItem[]
): FilesTreeItem[] {
  return items.map((item) => {
    if (item.kind === 'status') return item
    if (item.relativePath === relativePath && item.kind === 'directory') {
      return { ...item, children }
    }
    return item.children
      ? { ...item, children: replaceDirectoryChildren(item.children, relativePath, children) }
      : item
  })
}

function selectedDirectoryPath(selectedPath: string | null, rootState: RootState): string {
  if (!selectedPath || rootState.status !== 'ready') return ''
  const selectedItem = findTreeItem(rootState.items, selectedPath)
  if (selectedItem?.kind === 'directory') return selectedItem.relativePath
  return selectedPath.includes('/') ? selectedPath.slice(0, selectedPath.lastIndexOf('/')) : ''
}

function findTreeItem(items: FilesTreeItem[], relativePath: string): FilesTreeItem | null {
  for (const item of items) {
    if (item.relativePath === relativePath) return item
    if (item.kind !== 'status' && item.children) {
      const child = findTreeItem(item.children, relativePath)
      if (child) return child
    }
  }
  return null
}

function joinRelativePath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name
}

function parentDirectoryPath(relativePath: string): string {
  const index = relativePath.lastIndexOf('/')
  return index < 0 ? '' : relativePath.slice(0, index)
}

function ancestorDirectoryPaths(relativePath: string): string[] {
  const ancestors: string[] = []
  let current = parentDirectoryPath(relativePath)
  while (current) {
    ancestors.unshift(current)
    current = parentDirectoryPath(current)
  }
  return ancestors
}

function isPathAffectedBy(candidatePath: string, relativePath: string): boolean {
  return candidatePath === relativePath || candidatePath.startsWith(`${relativePath}/`)
}

function filesErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('files.worktreeMissing') || code.includes('files.worktreeInvalid')) {
    return 'This Session’s managed worktree is missing or invalid. Repair or recreate the Session.'
  }
  if (code.includes('files.directoryNotFound')) {
    return 'This directory no longer exists. Refresh the explorer and try again.'
  }
  if (code.includes('files.directoryInaccessible')) {
    return 'Space Zero cannot access this directory. Check its permissions and try again.'
  }
  return 'Couldn’t read this directory. Try again.'
}

function saveErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('files.contentTooLarge')) return 'This file is too large to save from Files.'
  if (code.includes('files.notEditableText')) return 'This file is not editable text.'
  return 'Couldn’t save this file. Your changes are still in memory.'
}

function fileOperationErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('files.collision')) return 'An item already exists at that path.'
  if (code.includes('files.invalidPath') || code.includes('files.invalidDestination')) {
    return 'Use a valid path inside this Files root.'
  }
  if (code.includes('files.gitProtected')) return 'Files cannot change .git internals.'
  if (code.includes('files.symlink')) return 'Symbolic links cannot be changed from Files.'
  if (code.includes('files.directoryMoveIntoSelf')) return 'A folder cannot be moved inside itself.'
  if (code.includes('files.trashFailed'))
    return 'Could not move this item to Trash. It was not deleted.'
  return 'The file operation failed. No local Files state was changed.'
}

function searchErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('files.worktreeMissing') || code.includes('files.worktreeInvalid')) {
    return 'This Session’s managed worktree is missing or invalid. Repair or recreate the Session.'
  }
  return 'Couldn’t search these files. Adjust the query or try again.'
}

function pathName(relativePath: string): string {
  return relativePath.split('/').at(-1) ?? relativePath
}

function metadataMessage(
  contentKind: 'binary' | 'oversized',
  classification: 'binary' | 'oversized-text' | 'oversized-image'
): string {
  if (classification === 'oversized-image') {
    return 'This image is larger than 10 MiB and cannot be previewed here.'
  }
  return contentKind === 'oversized'
    ? 'This file is larger than 2 MiB and cannot be edited here.'
    : 'This file is binary and cannot be edited here.'
}

function metadataClassificationLabel(
  classification: 'binary' | 'oversized-text' | 'oversized-image'
): string {
  if (classification === 'oversized-image') return 'Oversized supported image'
  if (classification === 'oversized-text') return 'Oversized text'
  return 'Unsupported binary'
}

function formatTimestamp(value: string): string {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return value
  return timestamp.toLocaleString()
}

function statusMessage(status: 'loading' | 'empty' | 'error'): string {
  if (status === 'loading') return 'Loading…'
  if (status === 'empty') return 'Empty folder'
  return 'Couldn’t read this directory.'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function clampExplorerWidth(width: number): number {
  return Math.min(EXPLORER_MAX_WIDTH, Math.max(EXPLORER_MIN_WIDTH, width))
}
