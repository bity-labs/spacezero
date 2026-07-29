import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  FilePlus,
  FolderSimplePlus,
  MagnifyingGlass,
  SidebarSimple,
  TreeStructure
} from '@phosphor-icons/react'
import { preparePresortedFileTreeInput, type FileTreePreparedInput } from '@pierre/trees'
import { FileTree as TreesFileTree, useFileTree } from '@pierre/trees/react'
import type {
  ContextMenuItem,
  ContextMenuOpenContext,
  FileTreeDropContext,
  FileTreeDropResult,
  FileTreeIcons,
  FileTreeRenameEvent,
  FileTreeRenamingItem,
  FileTreeRowDecoration
} from '@pierre/trees'

import { useColorMode } from '@renderer/color-mode-provider'
import { useRegisterAppCommands } from '../../../app-commands/renderer/app-command-context'
import type { AppCommand } from '../../../app-commands/renderer/app-command.model'
import {
  RichMarkdownEditor,
  type RichMarkdownImageAdapter
} from '@renderer/components/rich-markdown-editor'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { getRichMarkdownLimitation } from '@renderer/lib/rich-markdown'
import type { FilesContext, FilesEntry, FilesSearchResult, FilesTree } from '../../shared'
import {
  createDefaultFilesContext,
  getActiveFilesTab,
  getFilesEditorViewState,
  isMarkdownDocumentPath,
  isMdxPath,
  useFilesStore,
  type FilesEditorMode,
  type FilesOpenTabIntent,
  type FilesTabDropPosition,
  type FilesTabState
} from '../files-store'
import { registerFilesEditorViewStateFlush } from '../files-editor-view-state-registry'
import { openFilesLocation } from '../files-open-location'
import { migrateFilesMonacoEditorState } from '../lib/files-editor-state-migration'
import { createFilesMonacoModelPath, getFilesEditorLanguage } from '../lib/files-editor-model'
import { configureFilesMonacoEnvironment } from '../lib/monaco-environment'
import { FilesMonacoEditor, type FilesMonacoEditorMount } from './files-monaco-editor'

configureFilesMonacoEnvironment()

type RootState =
  | { status: 'loading' }
  | { status: 'ready'; tree: FilesTree }
  | { status: 'error'; message: string }

type ExplorerSearchMode = 'files' | 'contents'

type ContentSearchResult = Extract<FilesSearchResult, { kind: 'content' }>

type ContentSearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'ready'; query: string; results: ContentSearchResult[] }
  | { status: 'error'; query: string; message: string }

type CreateDialogState = {
  kind: 'file' | 'folder'
  parentPath: string
  name: string
  error: string | null
  status: 'idle' | 'submitting'
}

const EXPLORER_MIN_WIDTH = 180
const EXPLORER_MAX_WIDTH = 520
const EXPLORER_RESIZE_STEP = 20
export const FILES_SAVE_ALL_COMMAND_ID = 'files.save-all'

const saveConflictMessage =
  'This file changed on disk. Reload from disk or review the external changes before saving.'

const filesTreeIcons = { set: 'complete', colored: true } satisfies FileTreeIcons

type FilesTreeHostStyle = CSSProperties & Record<`--${string}`, string | number>

function createFilesTreeHostStyle(height: number): FilesTreeHostStyle {
  return {
    height,
    width: '100%',
    '--trees-bg-override': 'var(--background)',
    '--trees-bg-muted-override': 'var(--muted)',
    '--trees-fg-override': 'var(--foreground)',
    '--trees-fg-muted-override': 'var(--muted-foreground)',
    '--trees-selected-bg-override': 'var(--accent)',
    '--trees-selected-fg-override': 'var(--accent-foreground)',
    '--trees-selected-focused-border-color-override': 'var(--ring)',
    '--trees-border-color-override': 'var(--border)',
    '--trees-focus-ring-color-override': 'var(--ring)',
    '--trees-input-bg-override': 'var(--background)',
    '--trees-search-bg-override': 'var(--background)',
    '--trees-indent-guide-bg-override': 'var(--border)',
    '--trees-scrollbar-thumb-override': 'var(--muted-foreground)',
    '--trees-font-family-override': 'var(--font-sans)'
  }
}

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
  const projectSessionId = 'sessionId' in props ? props.sessionId : null
  const providedIpcContext = 'sessionId' in props ? null : props.ipcContext
  const ipcContext: FilesContext = useMemo(
    () =>
      projectSessionId
        ? { kind: 'project-session', sessionId: projectSessionId }
        : (providedIpcContext as FilesContext),
    [projectSessionId, providedIpcContext]
  )
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
  const reloadCleanExternalDocument = useFilesStore((state) => state.reloadCleanExternalDocument)
  const reloadExternalDocument = useFilesStore((state) => state.reloadExternalDocument)
  const markExternalConflict = useFilesStore((state) => state.markExternalConflict)
  const markDeletedOnDisk = useFilesStore((state) => state.markDeletedOnDisk)
  const markExternalReadFailed = useFilesStore((state) => state.markExternalReadFailed)
  const discardDirtyTabsInPath = useFilesStore((state) => state.discardDirtyTabsInPath)
  const rewritePaths = useFilesStore((state) => state.rewritePaths)
  const closeTabsInPath = useFilesStore((state) => state.closeTabsInPath)
  const [rootState, setRootState] = useState<RootState>({ status: 'loading' })
  const [explorerSearchMode, setExplorerSearchMode] = useState<ExplorerSearchMode>('files')
  const [filesSearchQuery, setFilesSearchQuery] = useState('')
  const [contentSearchQuery, setContentSearchQuery] = useState('')
  const [contentSearchState, setContentSearchState] = useState<ContentSearchState>({
    status: 'idle'
  })
  const [treeHeight, setTreeHeight] = useState(480)
  const [closePromptPath, setClosePromptPath] = useState<string | null>(null)
  const [createDialog, setCreateDialog] = useState<CreateDialogState | null>(null)
  const createInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const activeSessionRef = useRef(sessionId)
  const expandedPathsRef = useRef(context.expandedPaths)
  const restoredRootRef = useRef(false)
  const searchRequestRef = useRef(0)
  const activeSearchRequestIdRef = useRef<string | null>(null)
  const observedDocumentReadSequencesRef = useRef(new Map<string, number>())
  const observedPathGenerationsRef = useRef(new Map<string, number>())
  const contentSearchStateRef = useRef(contentSearchState)
  const explorerSearchModeRef = useRef(explorerSearchMode)
  const filesSearchQueryRef = useRef(filesSearchQuery)
  const treeEntriesRef = useRef<FilesEntry[]>([])
  const treeDropHandlerRef = useRef<(event: FileTreeDropResult) => Promise<void>>(async () => undefined)
  const treeDropValidatorRef = useRef<(event: FileTreeDropContext) => boolean>(() => false)
  const treeRenameHandlerRef = useRef<(event: FileTreeRenameEvent) => Promise<void>>(
    async () => undefined
  )
  const treeSelectionHandlerRef = useRef<(paths: readonly string[]) => void>(() => undefined)
  const { model: treeModel } = useFileTree({
    composition: {
      contextMenu: {
        buttonVisibility: 'when-needed',
        enabled: true,
        triggerMode: 'both'
      }
    },
    density: 'compact',
    dragAndDrop: {
      canDrag: (paths) =>
        explorerSearchModeRef.current === 'files' &&
        !filesSearchQueryRef.current.trim() &&
        paths.length === 1 &&
        canMoveTreePath(paths[0] ?? '', treeEntriesRef.current),
      canDrop: (event) => treeDropValidatorRef.current(event),
      onDropComplete: (event) => void treeDropHandlerRef.current(event),
      onDropError: (error) => window.alert(treeMutationErrorMessage(error))
    },
    fileTreeSearchMode: 'hide-non-matches',
    flattenEmptyDirectories: true,
    icons: filesTreeIcons,
    id: `files-tree-${sessionId}`,
    initialExpansion: 'closed',
    initialExpandedPaths: context.expandedPaths,
    initialSelectedPaths: context.selectedPath ? [context.selectedPath] : [],
    paths: [],
    renaming: {
      canRename: (item) => canRenameTreeItem(item, treeEntriesRef.current),
      onError: (error) => window.alert(treeMutationErrorMessage(error)),
      onRename: (event) => void treeRenameHandlerRef.current(event)
    },
    search: false,
    stickyFolders: true,
    onSearchChange: (value) => {
      if (value === null) setFilesSearchQuery('')
    },
    onSelectionChange: (paths) => treeSelectionHandlerRef.current(paths),
    renderRowDecoration: ({ item }) =>
      renderFilesTreeRowDecoration(item.path, treeEntriesRef.current)
  })
  const activeDocument = getActiveFilesTab(context)
  const preparedTreeInput = useMemo<FileTreePreparedInput | null>(
    () =>
      rootState.status === 'ready'
        ? preparePresortedFileTreeInput(rootState.tree.presortedPaths)
        : null,
    [rootState]
  )
  const expandedPathsKey = context.expandedPaths.join('\0')
  const treeHostStyle = useMemo(() => createFilesTreeHostStyle(treeHeight), [treeHeight])

  useEffect(() => {
    expandedPathsRef.current = context.expandedPaths
  }, [context.expandedPaths])

  useEffect(() => {
    contentSearchStateRef.current = contentSearchState
  }, [contentSearchState])

  useEffect(() => {
    explorerSearchModeRef.current = explorerSearchMode
  }, [explorerSearchMode])

  useEffect(() => {
    filesSearchQueryRef.current = filesSearchQuery
  }, [filesSearchQuery])

  useEffect(() => {
    treeModel.setSearch(explorerSearchMode === 'files' ? filesSearchQuery : null)
  }, [explorerSearchMode, filesSearchQuery, treeModel])

  const loadRoot = useCallback(async (): Promise<void> => {
    const requestedSession = sessionId
    restoredRootRef.current = false
    setRootState({ status: 'loading' })
    try {
      const tree = await window.spacezero.files.listTree({
        context: ipcContext
      })
      if (activeSessionRef.current !== requestedSession) return
      setRootState({ status: 'ready', tree })
    } catch (error) {
      if (activeSessionRef.current !== requestedSession) return
      setRootState({ status: 'error', message: filesErrorMessage(error) })
    }
  }, [ipcContext, sessionId])

  const loadDirectory = useCallback(
    async function loadDirectory(_relativePath: string): Promise<void> {
      await loadRoot()
    },
    [loadRoot]
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
    setContentSearchQuery('')
    setContentSearchState({ status: 'idle' })
    setExplorerSearchMode('files')
  }, [cancelActiveSearch])

  const performSearch = useCallback(
    async (query: string): Promise<void> => {
      const normalizedQuery = query.trim()
      cancelActiveSearch()
      const requestSequence = searchRequestRef.current + 1
      const requestId = `${sessionId}:${requestSequence}`
      searchRequestRef.current = requestSequence
      activeSearchRequestIdRef.current = requestId
      if (!normalizedQuery) {
        activeSearchRequestIdRef.current = null
        setContentSearchState({ status: 'idle' })
        return
      }
      setContentSearchState({ status: 'loading', query: normalizedQuery })
      try {
        const results = await window.spacezero.files.search({
          context: ipcContext,
          query: normalizedQuery,
          includeIgnored: true,
          requestId
        })
        if (activeSearchRequestIdRef.current === requestId) activeSearchRequestIdRef.current = null
        if (
          searchRequestRef.current !== requestSequence ||
          activeSessionRef.current !== sessionId
        ) {
          return
        }
        setContentSearchState({
          status: 'ready',
          query: normalizedQuery,
          results: results.filter(isContentSearchResult)
        })
      } catch (error) {
        if (activeSearchRequestIdRef.current === requestId) activeSearchRequestIdRef.current = null
        if (
          searchRequestRef.current !== requestSequence ||
          activeSessionRef.current !== sessionId
        ) {
          return
        }
        if (error instanceof Error && error.message.includes('files.searchCanceled')) return
        setContentSearchState({
          status: 'error',
          query: normalizedQuery,
          message: searchErrorMessage(error)
        })
      }
    },
    [cancelActiveSearch, ipcContext, sessionId]
  )

  const refreshActiveSearch = useCallback((): void => {
    const state = contentSearchStateRef.current
    if (state.status === 'idle') return
    void performSearch(state.query)
  }, [performSearch])

  const invalidateObservedPathGeneration = useCallback((relativePath: string): void => {
    observedPathGenerationsRef.current.set(
      relativePath,
      (observedPathGenerationsRef.current.get(relativePath) ?? 0) + 1
    )
  }, [])

  const revealTreePath = useCallback(
    async (relativePath: string): Promise<void> => {
      const ancestors = ancestorDirectoryPaths(relativePath)
      for (const ancestor of ancestors) setExpanded(sessionId, ancestor, true)
      await loadRoot()
      setSelectedPath(sessionId, relativePath)
      treeModel.scrollToPath(toFilesTreePath(relativePath, treeEntriesRef.current), {
        focus: false,
        offset: 'nearest'
      })
    },
    [loadRoot, sessionId, setExpanded, setSelectedPath, treeModel]
  )

  const saveDocumentSnapshot = useCallback(
    async (document: Extract<FilesTabState, { status: 'ready' }>): Promise<boolean> => {
      if (document.saveStatus === 'saving' || document.externalStatus) return false
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
          markExternalConflict(sessionId, document.relativePath, result.document.revision)
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
    [
      invalidateSearchResults,
      ipcContext,
      markExternalConflict,
      markSaveFailed,
      markSaved,
      markSaving,
      sessionId
    ]
  )

  const saveActiveDocument = useCallback(async (): Promise<void> => {
    if (!activeDocument || activeDocument.status !== 'ready') return
    await saveDocumentSnapshot(activeDocument)
  }, [activeDocument, saveDocumentSnapshot])

  const saveAllDirtyDocuments = useCallback(async (): Promise<void> => {
    const dirtyDocuments = context.tabs.filter(
      (tab): tab is Extract<FilesTabState, { status: 'ready' }> =>
        tab.status === 'ready' && tab.dirty && tab.saveStatus !== 'saving' && !tab.externalStatus
    )
    await Promise.all(dirtyDocuments.map((document) => saveDocumentSnapshot(document)))
  }, [context.tabs, saveDocumentSnapshot])

  const saveAllDirtyDocumentsRef = useRef(saveAllDirtyDocuments)
  useEffect(() => {
    saveAllDirtyDocumentsRef.current = saveAllDirtyDocuments
  }, [saveAllDirtyDocuments])

  const filesCommands = useMemo<readonly AppCommand[]>(
    () => [
      {
        id: FILES_SAVE_ALL_COMMAND_ID,
        title: 'Save All',
        category: 'Files',
        keywords: ['dirty', 'documents', 'tabs'],
        handler: () => void saveAllDirtyDocumentsRef.current()
      }
    ],
    []
  )
  useRegisterAppCommands(filesCommands)

  const reloadFromDisk = useCallback(
    async (relativePath: string): Promise<void> => {
      const document = await window.spacezero.files.openDocument({
        context: ipcContext,
        relativePath
      })
      reloadExternalDocument(sessionId, document)
      invalidateObservedPathGeneration(relativePath)
    },
    [invalidateObservedPathGeneration, ipcContext, reloadExternalDocument, sessionId]
  )

  const overwriteDisk = useCallback(
    async (document: Extract<FilesTabState, { status: 'ready' }>): Promise<void> => {
      if (document.externalStatus?.kind !== 'conflict') return
      if (!window.confirm(`Overwrite disk with your local changes to ${document.relativePath}?`)) {
        return
      }
      const saveRequest = {
        relativePath: document.relativePath,
        content: document.draft,
        expectedRevision: document.revision,
        conflictResolution: {
          kind: 'overwrite' as const,
          acknowledgedRevision: document.externalStatus.diskRevision
        }
      }
      markSaving(sessionId, saveRequest)
      try {
        const result = await window.spacezero.files.saveDocument({
          context: ipcContext,
          ...saveRequest
        })
        if (result.status === 'conflict') {
          markSaveFailed(sessionId, saveConflictMessage, saveRequest)
          markExternalConflict(sessionId, document.relativePath, result.document.revision)
          return
        }
        markSaved(sessionId, result.document, saveRequest)
        invalidateObservedPathGeneration(document.relativePath)
        refreshActiveSearch()
      } catch (error) {
        markSaveFailed(sessionId, saveErrorMessage(error), saveRequest)
      }
    },
    [
      invalidateObservedPathGeneration,
      ipcContext,
      markExternalConflict,
      markSaveFailed,
      markSaved,
      markSaving,
      refreshActiveSearch,
      sessionId
    ]
  )

  const recreateDeletedFile = useCallback(
    async (document: Extract<FilesTabState, { status: 'ready' }>): Promise<void> => {
      if (document.externalStatus?.kind !== 'deleted') return
      if (!window.confirm(`Recreate ${document.relativePath} on disk?`)) return
      const saveRequest = {
        relativePath: document.relativePath,
        content: document.draft,
        expectedRevision: document.revision,
        conflictResolution: {
          kind: 'recreate' as const,
          acknowledgedMissingRevision: document.externalStatus.missingRevision
        }
      }
      markSaving(sessionId, saveRequest)
      try {
        const result = await window.spacezero.files.saveDocument({
          context: ipcContext,
          ...saveRequest
        })
        if (result.status === 'conflict') {
          markSaveFailed(sessionId, saveConflictMessage, saveRequest)
          markExternalConflict(sessionId, document.relativePath, result.document.revision)
          return
        }
        markSaved(sessionId, result.document, saveRequest)
        invalidateObservedPathGeneration(document.relativePath)
        refreshActiveSearch()
      } catch (error) {
        markSaveFailed(sessionId, saveErrorMessage(error), saveRequest)
      }
    },
    [
      invalidateObservedPathGeneration,
      ipcContext,
      markExternalConflict,
      markSaveFailed,
      markSaved,
      markSaving,
      refreshActiveSearch,
      sessionId
    ]
  )

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

  const openCreateDialog = useCallback((kind: 'file' | 'folder', parentPath = ''): void => {
    setCreateDialog({ kind, parentPath, name: '', error: null, status: 'idle' })
  }, [])

  useEffect(() => {
    if (!createDialog) return
    const focusTimeout = window.setTimeout(() => createInputRef.current?.focus(), 0)
    return () => window.clearTimeout(focusTimeout)
  }, [createDialog?.kind, createDialog?.parentPath])

  useEffect(() => {
    if (explorerSearchMode !== 'contents') return
    const focusTimeout = window.setTimeout(() => searchInputRef.current?.focus(), 0)
    return () => window.clearTimeout(focusTimeout)
  }, [explorerSearchMode])

  const confirmCreateEntry = useCallback(async (): Promise<void> => {
    const dialog = createDialog
    if (!dialog || dialog.status === 'submitting') return
    const name = dialog.name.trim()
    const validationError = createEntryNameError(dialog.kind, name)
    if (validationError) {
      setCreateDialog({ ...dialog, name, error: validationError })
      return
    }
    const relativePath = joinRelativePath(dialog.parentPath, name)
    setCreateDialog({ ...dialog, name, error: null, status: 'submitting' })
    try {
      await window.spacezero.files.createEntry({
        context: ipcContext,
        relativePath,
        kind: dialog.kind
      })
      await revealTreePath(relativePath)
      refreshActiveSearch()
      if (dialog.kind === 'file') await openFile(relativePath, 'permanent')
      setCreateDialog(null)
    } catch (error) {
      setCreateDialog({ ...dialog, name, error: fileOperationErrorMessage(error), status: 'idle' })
    }
  }, [createDialog, ipcContext, openFile, refreshActiveSearch, revealTreePath])

  const applyMoveEntry = useCallback(
    async (sourcePath: string, destinationPath: string): Promise<boolean> => {
      if (!destinationPath.trim() || destinationPath.trim() === sourcePath) return false
      if (!(await prepareDirtyOperation(sourcePath))) return false
      await window.spacezero.files.moveEntry({
        context: ipcContext,
        sourcePath,
        destinationPath: destinationPath.trim()
      })
      const destination = destinationPath.trim()
      migrateFilesMonacoEditorState(sessionId, sourcePath, destination)
      rewritePaths(sessionId, sourcePath, destination)
      await revealTreePath(destination)
      refreshActiveSearch()
      return true
    },
    [
      ipcContext,
      prepareDirtyOperation,
      refreshActiveSearch,
      revealTreePath,
      rewritePaths,
      sessionId
    ]
  )

  useEffect(() => {
    treeDropValidatorRef.current = (event): boolean =>
      explorerSearchModeRef.current === 'files' &&
      !filesSearchQueryRef.current.trim() &&
      isValidTreeDrop(event, treeEntriesRef.current)
  }, [])

  useEffect(() => {
    treeDropHandlerRef.current = async (event): Promise<void> => {
      const moveRequest = createMoveRequestFromTreeDrop(event, treeEntriesRef.current)
      if (!moveRequest) {
        await loadRoot()
        return
      }
      try {
        const moved = await applyMoveEntry(moveRequest.sourcePath, moveRequest.destinationPath)
        if (!moved) await loadRoot()
      } catch (error) {
        await loadRoot()
        window.alert(fileOperationErrorMessage(error))
      }
    }
  }, [applyMoveEntry, loadRoot])

  useEffect(() => {
    treeRenameHandlerRef.current = async (event): Promise<void> => {
      try {
        const moved = await applyMoveEntry(
          fromFilesTreePath(event.sourcePath),
          fromFilesTreePath(event.destinationPath)
        )
        if (!moved) await loadRoot()
      } catch (error) {
        await loadRoot()
        window.alert(fileOperationErrorMessage(error))
      }
    }
  }, [applyMoveEntry, loadRoot])

  const startInlineRename = useCallback(
    (relativePath: string): void => {
      treeModel.startRenaming(toFilesTreePath(relativePath, treeEntriesRef.current))
    },
    [treeModel]
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session changes must reset local search before loading the new tree.
    invalidateSearchResults()
    void loadRoot()
    return () => {
      cancelActiveSearch()
      if (activeSessionRef.current === sessionId) activeSessionRef.current = ''
    }
  }, [cancelActiveSearch, invalidateSearchResults, loadRoot, sessionId])

  useEffect(() => {
    const restoredTabs =
      useFilesStore
        .getState()
        .contexts[sessionId]?.tabs.filter(
          (tab) =>
            tab.status === 'loading' &&
            typeof tab.openRequestId === 'number' &&
            tab.openRequestId < 0
        ) ?? []
    if (restoredTabs.length === 0) return
    let cancelled = false
    void (async () => {
      await Promise.all(
        restoredTabs.map(async (tab) => {
          if (tab.openRequestId === undefined) return
          try {
            const document = await window.spacezero.files.openDocument({
              context: ipcContext,
              relativePath: tab.relativePath
            })
            if (cancelled) return
            useFilesStore.getState().finishOpenTab(sessionId, document, tab.openRequestId)
          } catch (error) {
            if (cancelled) return
            useFilesStore
              .getState()
              .failOpenTab(
                sessionId,
                tab.relativePath,
                restoredOpenErrorMessage(error),
                tab.openRequestId
              )
          }
        })
      )
    })()
    return () => {
      cancelled = true
    }
  }, [ipcContext, sessionId])

  useEffect(() => {
    const subscriptionId = `${sessionId}:files-observation`
    let closed = false
    void window.spacezero.files.observe({ context: ipcContext, subscriptionId })
    const refreshOpenTab = async (relativePath: string, deleted: boolean): Promise<void> => {
      const observedReadSequence =
        (observedDocumentReadSequencesRef.current.get(relativePath) ?? 0) + 1
      observedDocumentReadSequencesRef.current.set(relativePath, observedReadSequence)
      const observedGeneration = observedPathGenerationsRef.current.get(relativePath) ?? 0
      const observedTab = useFilesStore
        .getState()
        .contexts[sessionId]?.tabs.find((candidate) => candidate.relativePath === relativePath)
      if (!observedTab || observedTab.status !== 'ready') return
      if (deleted) {
        markDeletedOnDisk(sessionId, relativePath)
        return
      }
      const getCurrentObservedTab = (): Extract<FilesTabState, { status: 'ready' }> | null => {
        if (closed) return null
        if (observedDocumentReadSequencesRef.current.get(relativePath) !== observedReadSequence) {
          return null
        }
        if ((observedPathGenerationsRef.current.get(relativePath) ?? 0) !== observedGeneration) {
          return null
        }
        const latestTab = useFilesStore
          .getState()
          .contexts[sessionId]?.tabs.find((candidate) => candidate.relativePath === relativePath)
        if (!latestTab || latestTab.status !== 'ready') return null
        if (latestTab.revision !== observedTab.revision && !latestTab.externalStatus) return null
        return latestTab
      }
      try {
        const document = await window.spacezero.files.openDocument({
          context: ipcContext,
          relativePath
        })
        const latestTab = getCurrentObservedTab()
        if (!latestTab) return
        if (latestTab.dirty || latestTab.externalStatus) {
          markExternalConflict(sessionId, relativePath, document.revision)
        } else {
          reloadCleanExternalDocument(sessionId, document)
        }
      } catch (error) {
        const latestTab = getCurrentObservedTab()
        if (!latestTab) return
        if (isFilesNotFoundError(error)) {
          markDeletedOnDisk(sessionId, relativePath)
        } else {
          markExternalReadFailed(sessionId, relativePath, externalReadErrorMessage(error))
        }
      }
    }
    const refreshAffectedTree = (relativePath: string | null): void => {
      if (!relativePath) {
        void loadRoot()
        return
      }
      const parentPath = parentDirectoryPath(relativePath)
      if (!parentPath) {
        void loadRoot()
        return
      }
      void loadDirectory(parentPath)
    }
    const unsubscribeEvents = window.spacezero.files.onObservationEvent((event) => {
      if (event.subscriptionId !== subscriptionId || event.contextKey !== sessionId) return
      if (event.kind === 'watch-error') {
        window.console.warn('Files watcher error', event.message)
        return
      }
      refreshActiveSearch()
      refreshAffectedTree(event.relativePath)
      if (event.relativePath) void refreshOpenTab(event.relativePath, event.kind === 'deleted')
    })
    return () => {
      closed = true
      unsubscribeEvents()
      void window.spacezero.files.unobserve({ subscriptionId })
    }
  }, [
    ipcContext,
    loadDirectory,
    loadRoot,
    markDeletedOnDisk,
    markExternalConflict,
    markExternalReadFailed,
    refreshActiveSearch,
    reloadCleanExternalDocument,
    sessionId
  ])

  useEffect(() => {
    if (rootState.status !== 'ready' || !preparedTreeInput) return
    treeEntriesRef.current = rootState.tree.entries
    treeModel.resetPaths({
      preparedInput: preparedTreeInput,
      initialExpandedPaths: context.expandedPaths.map((path) =>
        toFilesTreePath(path, rootState.tree.entries)
      )
    })
    treeModel.setGitStatus(rootState.tree.gitStatus)
    restoredRootRef.current = true
  }, [context.expandedPaths, expandedPathsKey, preparedTreeInput, rootState, treeModel])

  useEffect(() => {
    return treeModel.subscribe(() => {
      const rows = treeModel.getVisibleRows(0, treeModel.getVisibleCount())
      for (const row of rows) {
        if (row.kind !== 'directory') continue
        const relativePath = fromFilesTreePath(row.path)
        if (!relativePath) continue
        if (context.expandedPaths.includes(relativePath) !== row.isExpanded) {
          setExpanded(sessionId, relativePath, row.isExpanded)
        }
      }
    })
  }, [context.expandedPaths, sessionId, setExpanded, treeModel])

  useEffect(() => {
    if (rootState.status !== 'ready' || !context.selectedPath) return
    treeModel.getItem(toFilesTreePath(context.selectedPath, rootState.tree.entries))?.select()
  }, [context.selectedPath, rootState, treeModel])

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

  useEffect(() => {
    treeSelectionHandlerRef.current = (paths): void => {
      const relativePath = fromFilesTreePath(paths[0] ?? '')
      if (!relativePath) return
      const entry = findTreeEntry(treeEntriesRef.current, relativePath)
      if (!entry) return
      if (entry.kind === 'file') {
        void openFile(entry.relativePath, 'preview')
      } else {
        setSelectedPath(sessionId, entry.relativePath)
      }
    }
  }, [openFile, sessionId, setSelectedPath])

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

  const selectFilesSearchMode = useCallback((): void => {
    cancelActiveSearch()
    setContentSearchState({ status: 'idle' })
    setExplorerSearchMode('files')
  }, [cancelActiveSearch])

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
          title="Expand Files explorer"
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
              <div className="flex h-7 items-center justify-between gap-2">
                <div className="flex items-center gap-1" aria-label="Files explorer views">
                  <button
                    aria-label="Files search"
                    aria-pressed={explorerSearchMode === 'files'}
                    className={explorerViewButtonClass(explorerSearchMode === 'files')}
                    title="Files search"
                    type="button"
                    onClick={selectFilesSearchMode}
                  >
                    <TreeStructure aria-hidden className="size-4" />
                  </button>
                  <button
                    aria-label="Contents search"
                    aria-pressed={explorerSearchMode === 'contents'}
                    className={explorerViewButtonClass(explorerSearchMode === 'contents')}
                    title="Contents search"
                    type="button"
                    onClick={() => setExplorerSearchMode('contents')}
                  >
                    <MagnifyingGlass aria-hidden className="size-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="New file"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                    title="New file"
                    type="button"
                    onClick={() => openCreateDialog('file')}
                  >
                    <FilePlus aria-hidden className="size-4" />
                  </button>
                  <button
                    aria-label="New folder"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                    title="New folder"
                    type="button"
                    onClick={() => openCreateDialog('folder')}
                  >
                    <FolderSimplePlus aria-hidden className="size-4" />
                  </button>
                  <button
                    aria-label="Collapse Files explorer"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                    title="Collapse Files explorer"
                    type="button"
                    onClick={() => setExplorerCollapsed(sessionId, true)}
                  >
                    <SidebarSimple aria-hidden className="size-4" />
                  </button>
                </div>
              </div>
              <form
                aria-label={explorerSearchMode === 'files' ? 'Files search' : 'Contents search'}
                className="flex items-center gap-1"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (explorerSearchMode === 'contents') void performSearch(contentSearchQuery)
                }}
              >
                <div className="flex min-w-0 flex-1 items-center rounded-md border px-2">
                  <MagnifyingGlass
                    aria-hidden
                    className="mr-1 size-3 shrink-0 text-muted-foreground"
                  />
                  <input
                    ref={explorerSearchMode === 'contents' ? searchInputRef : undefined}
                    aria-label={explorerSearchMode === 'files' ? 'Files search' : 'Contents search'}
                    className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    placeholder={
                      explorerSearchMode === 'files' ? 'Search files by path' : 'Search contents'
                    }
                    value={explorerSearchMode === 'files' ? filesSearchQuery : contentSearchQuery}
                    onChange={(event) => {
                      if (explorerSearchMode === 'files') setFilesSearchQuery(event.target.value)
                      else setContentSearchQuery(event.target.value)
                    }}
                  />
                </div>
              </form>
            </header>
            <div ref={treeContainerRef} className="min-h-0 flex-1 overflow-hidden">
              {explorerSearchMode === 'contents' ? (
                <FilesSearchResults
                  state={contentSearchState}
                  onOpen={(result) => {
                    const targetLine = result.snippets[0]?.line
                    void openFile(result.relativePath, 'preview', targetLine)
                  }}
                  onRetry={() => void performSearch(contentSearchQuery)}
                />
              ) : rootState.status === 'loading' ? (
                <FilesState message="Loading files…" />
              ) : rootState.status === 'error' ? (
                <FilesState message={rootState.message} actionLabel="Retry" onAction={loadRoot} />
              ) : rootState.tree.entries.length === 0 ? (
                <FilesState message="This worktree is empty." />
              ) : (
                <TreesFileTree
                  key={sessionId}
                  aria-label={treeLabel}
                  model={treeModel}
                  style={treeHostStyle}
                  onDoubleClick={() => {
                    const relativePath = fromFilesTreePath(
                      treeModel.getFocusedPath() ?? treeModel.getSelectedPaths()[0] ?? ''
                    )
                    const entry = findTreeEntry(treeEntriesRef.current, relativePath)
                    if (entry?.kind === 'file') void openFile(entry.relativePath, 'permanent')
                  }}
                  renderContextMenu={(item, menuContext) => (
                    <FilesTreeContextMenu
                      item={item}
                      menuContext={menuContext}
                      entries={treeEntriesRef.current}
                      ipcContext={ipcContext}
                      onCreate={(kind, parentPath) => openCreateDialog(kind, parentPath)}
                      onRename={startInlineRename}
                      onTrash={trashEntry}
                    />
                  )}
                />
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
          onPromote={promoteTab}
          onReorder={reorderTabs}
        />
        <FilesEditorPanel
          document={activeDocument}
          sessionId={sessionId}
          ipcContext={ipcContext}
          onChange={(draft) => updateDraft(sessionId, draft)}
          createRichImageAdapter={createRichImageAdapter}
          onSave={saveActiveDocument}
          onReloadFromDisk={reloadFromDisk}
          onOverwriteDisk={(document) => void overwriteDisk(document)}
          onRecreateDeletedFile={(document) => void recreateDeletedFile(document)}
          onCloseDeletedTab={(relativePath) => discardAndCloseTab(sessionId, relativePath)}
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
      <CreateEntryDialog
        inputRef={createInputRef}
        rootLabel={createRootDestinationLabel(ipcContext)}
        state={createDialog}
        onCancel={() => setCreateDialog(null)}
        onChange={(name) =>
          setCreateDialog((dialog) => (dialog ? { ...dialog, name, error: null } : dialog))
        }
        onSubmit={() => void confirmCreateEntry()}
      />
    </section>
  )
}

function CreateEntryDialog({
  inputRef,
  rootLabel,
  state,
  onCancel,
  onChange,
  onSubmit
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  rootLabel: string
  state: CreateDialogState | null
  onCancel: () => void
  onChange: (name: string) => void
  onSubmit: () => void
}): React.JSX.Element | null {
  if (!state) return null
  const title = state.kind === 'file' ? 'New File' : 'New Folder'
  const placeholder = state.kind === 'file' ? 'File name' : 'Folder name'
  const destination = formatCreateDestination(state.parentPath, rootLabel)
  const isSubmitting = state.status === 'submitting'

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onCancel()
      }}
    >
      <DialogContent showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Create in {destination}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <div className="grid gap-2">
            <Input
              ref={inputRef}
              aria-describedby={state.error ? 'files-create-error' : undefined}
              aria-invalid={state.error ? true : undefined}
              disabled={isSubmitting}
              placeholder={placeholder}
              value={state.name}
              onChange={(event) => onChange(event.currentTarget.value)}
            />
            {state.error ? (
              <p id="files-create-error" className="text-xs text-destructive">
                {state.error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button disabled={isSubmitting} type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit">
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  state: ContentSearchState
  onOpen: (result: ContentSearchResult) => void
  onRetry: () => void | Promise<void>
}): React.JSX.Element {
  if (state.status === 'loading') return <FilesState message="Searching contents…" />
  if (state.status === 'error') {
    return <FilesState message={state.message} actionLabel="Retry" onAction={onRetry} />
  }
  if (state.status === 'idle') return <FilesState message="Enter a content search query." />
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
            <span className="mt-1 block space-y-1 text-muted-foreground">
              {result.snippets.map((snippet) => (
                <span key={`${snippet.line}:${snippet.column}`} className="block truncate">
                  {snippet.line}:{snippet.column} {snippet.text}
                </span>
              ))}
            </span>
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
  onPromote,
  onReorder
}: {
  activeTabPath: string | null
  sessionId: string
  tabs: FilesTabState[]
  onActivate: (sessionId: string, relativePath: string) => void
  onClose: (sessionId: string, relativePath: string) => void
  onPromote: (sessionId: string, relativePath: string) => void
  onReorder: (
    sessionId: string,
    sourcePath: string,
    targetPath: string,
    dropPosition: FilesTabDropPosition
  ) => void
}): React.JSX.Element | null {
  const activeTabRef = useRef<HTMLButtonElement | null>(null)
  const draggedPathRef = useRef<string | null>(null)

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabPath, tabs.length])

  if (tabs.length === 0) return null

  return (
    <div className="flex h-10 shrink-0 border-b bg-background">
      <div
        aria-label="Open files"
        className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
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
                onDoubleClick={() => onPromote(sessionId, tab.relativePath)}
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
  createRichImageAdapter,
  onSave,
  onReloadFromDisk,
  onOverwriteDisk,
  onRecreateDeletedFile,
  onCloseDeletedTab,
  onSetEditorMode,
  ipcContext
}: {
  document: FilesTabState | null
  sessionId: string
  ipcContext: FilesContext
  createRichImageAdapter?: RichImageAdapterFactory
  onChange: (draft: string) => void
  onSave: () => void | Promise<void>
  onReloadFromDisk: (relativePath: string) => void | Promise<void>
  onOverwriteDisk: (document: Extract<FilesTabState, { status: 'ready' }>) => void | Promise<void>
  onRecreateDeletedFile: (
    document: Extract<FilesTabState, { status: 'ready' }>
  ) => void | Promise<void>
  onCloseDeletedTab: (relativePath: string) => void
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
      createRichImageAdapter={createRichImageAdapter}
      onSave={onSave}
      onReloadFromDisk={onReloadFromDisk}
      onOverwriteDisk={onOverwriteDisk}
      onRecreateDeletedFile={onRecreateDeletedFile}
      onCloseDeletedTab={onCloseDeletedTab}
      onSetEditorMode={onSetEditorMode}
    />
  )
}

function FilesReadyEditorPanel({
  document,
  sessionId,
  onChange,
  createRichImageAdapter,
  onSave,
  onReloadFromDisk,
  onOverwriteDisk,
  onRecreateDeletedFile,
  onCloseDeletedTab,
  onSetEditorMode
}: {
  document: Extract<FilesTabState, { status: 'ready' }>
  sessionId: string
  createRichImageAdapter?: RichImageAdapterFactory
  onChange: (draft: string) => void
  onSave: () => void | Promise<void>
  onReloadFromDisk: (relativePath: string) => void | Promise<void>
  onOverwriteDisk: (document: Extract<FilesTabState, { status: 'ready' }>) => void | Promise<void>
  onRecreateDeletedFile: (
    document: Extract<FilesTabState, { status: 'ready' }>
  ) => void | Promise<void>
  onCloseDeletedTab: (relativePath: string) => void
  onSetEditorMode: (relativePath: string, mode: FilesEditorMode) => void
}): React.JSX.Element {
  const onSaveRef = useRef(onSave)
  const editorRef = useRef<Parameters<FilesMonacoEditorMount>[0] | null>(null)
  const richScrollContainerRef = useRef<HTMLElement | null>(null)
  const flushEditorViewState = useCallback(() => {
    const editor = editorRef.current
    const viewState = typeof editor?.saveViewState === 'function' ? editor.saveViewState() : null
    if (viewState) {
      useFilesStore.getState().setMonacoViewState(sessionId, document.relativePath, viewState)
    }
    const richScrollContainer = richScrollContainerRef.current
    if (richScrollContainer) {
      useFilesStore
        .getState()
        .setRichScrollTop(sessionId, document.relativePath, richScrollContainer.scrollTop)
    }
  }, [document.relativePath, sessionId])
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])
  const editorOptions = useMemo(
    () => ({ minimap: { enabled: false }, scrollBeyondLastLine: false }),
    []
  )
  const handleEditorMount = useCallback<FilesMonacoEditorMount>(
    (editor, monaco) => {
      editorRef.current = editor
      const savedViewState = getFilesEditorViewState(
        sessionId,
        document.relativePath
      )?.monacoViewState
      if (savedViewState) {
        editor.restoreViewState(savedViewState as Parameters<typeof editor.restoreViewState>[0])
      }
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void onSaveRef.current()
      })
    },
    [document.relativePath, sessionId]
  )

  useEffect(() => {
    return registerFilesEditorViewStateFlush(flushEditorViewState)
  }, [flushEditorViewState])

  useEffect(() => {
    return () => {
      flushEditorViewState()
      editorRef.current = null
      richScrollContainerRef.current = null
    }
  }, [flushEditorViewState])

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
  const { resolvedTheme } = useColorMode()
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs'
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
        </div>
      </header>
      {document.externalStatus ? (
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
          <span>
            {document.externalStatus.kind === 'deleted'
              ? 'Deleted on disk. Your buffer is still open.'
              : 'Changed on disk. Choose how to resolve before saving.'}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {document.externalStatus.kind === 'conflict' ? (
              <>
                <button
                  className="rounded-md border px-2 py-1 hover:bg-background"
                  type="button"
                  onClick={() => void onReloadFromDisk(document.relativePath)}
                >
                  Reload from disk
                </button>
                <button
                  className="rounded-md border px-2 py-1 hover:bg-background"
                  type="button"
                  onClick={() => void onOverwriteDisk(document)}
                >
                  Overwrite disk
                </button>
              </>
            ) : (
              <>
                <button
                  className="rounded-md border px-2 py-1 hover:bg-background"
                  type="button"
                  onClick={() => void onRecreateDeletedFile(document)}
                >
                  Recreate file
                </button>
                <button
                  className="rounded-md border px-2 py-1 hover:bg-background"
                  type="button"
                  onClick={() => onCloseDeletedTab(document.relativePath)}
                >
                  Close tab
                </button>
              </>
            )}
          </span>
        </div>
      ) : null}
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
            initialScrollTop={
              getFilesEditorViewState(sessionId, document.relativePath)?.richScrollTop ?? 0
            }
            markdown={document.draft}
            onChange={onChange}
            onScrollContainerChange={(element) => {
              richScrollContainerRef.current = element
            }}
            onScrollTopChange={(scrollTop) => {
              useFilesStore.getState().setRichScrollTop(sessionId, document.relativePath, scrollTop)
            }}
          />
        ) : (
          <FilesMonacoEditor
            height="100%"
            language={language}
            options={editorOptions}
            path={createFilesMonacoModelPath(sessionId, document.relativePath)}
            theme={monacoTheme}
            value={document.draft}
            onChange={(value) => onChange(value ?? '')}
            onMount={handleEditorMount}
          />
        )}
      </div>
    </div>
  )
}

function FilesTreeContextMenu({
  item,
  menuContext,
  entries,
  ipcContext,
  onCreate,
  onRename,
  onTrash
}: {
  item: ContextMenuItem
  menuContext: ContextMenuOpenContext
  entries: FilesEntry[]
  ipcContext: FilesContext
  onCreate: (kind: 'file' | 'folder', parentPath?: string) => void
  onRename: (relativePath: string) => void
  onTrash: (relativePath: string) => Promise<void>
}): React.JSX.Element | null {
  const relativePath = fromFilesTreePath(item.path)
  const entry = findTreeEntry(entries, relativePath)
  if (!entry) return null

  const closeMenu = (options?: { restoreFocus?: boolean }): void => menuContext.close(options)
  const revealEntry = (): void => {
    closeMenu()
    void window.spacezero.files
      .revealInSystemFileManager({ context: ipcContext, relativePath: entry.relativePath })
      .catch((error) => window.alert(filesErrorMessage(error)))
  }

  if (entry.kind === 'symlink') {
    return (
      <div
        aria-label={`${entry.relativePath} actions`}
        className="min-w-40 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        role="menu"
      >
        <button
          className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
          role="menuitem"
          type="button"
          onClick={revealEntry}
        >
          Show in Finder
        </button>
      </div>
    )
  }

  const siblingParentPath = parentDirectoryPath(entry.relativePath)
  return (
    <div
      aria-label={`${entry.relativePath} actions`}
      className="min-w-40 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
      role="menu"
    >
      <button
        className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
        role="menuitem"
        type="button"
        onClick={() => {
          closeMenu({ restoreFocus: false })
          onCreate('file', siblingParentPath)
        }}
      >
        New File
      </button>
      <button
        className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
        role="menuitem"
        type="button"
        onClick={() => {
          closeMenu({ restoreFocus: false })
          onCreate('folder', siblingParentPath)
        }}
      >
        New Folder
      </button>
      <div className="my-1 h-px bg-border" role="separator" />
      <button
        className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
        role="menuitem"
        type="button"
        onClick={() => {
          closeMenu({ restoreFocus: false })
          onRename(entry.relativePath)
        }}
      >
        Rename
      </button>
      <button
        className="w-full rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-accent"
        role="menuitem"
        type="button"
        onClick={() => {
          closeMenu()
          void onTrash(entry.relativePath)
        }}
      >
        Delete
      </button>
      <div className="my-1 h-px bg-border" role="separator" />
      <button
        className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
        role="menuitem"
        type="button"
        onClick={revealEntry}
      >
        Show in Finder
      </button>
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
        aria-label={compact ? `Reveal ${relativePath} in system file manager` : undefined}
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

function toFilesTreePath(
  entryOrPath: FilesEntry | string,
  entries?: readonly FilesEntry[]
): string {
  const relativePath = typeof entryOrPath === 'string' ? entryOrPath : entryOrPath.relativePath
  const entry =
    typeof entryOrPath === 'string' ? findTreeEntry(entries ?? [], relativePath) : entryOrPath
  return entry?.kind === 'directory' ? `${relativePath}/` : relativePath
}

function fromFilesTreePath(path: string): string {
  return path.endsWith('/') ? path.slice(0, -1) : path
}

function findTreeEntry(
  entries: readonly FilesEntry[],
  relativePath: string
): FilesEntry | undefined {
  return entries.find((entry) => entry.relativePath === relativePath)
}

function renderFilesTreeRowDecoration(
  path: string,
  entries: readonly FilesEntry[]
): FileTreeRowDecoration | null {
  const entry = findTreeEntry(entries, fromFilesTreePath(path))
  return entry?.kind === 'symlink' ? { text: 'Symbolic link', title: 'Symbolic link' } : null
}

function canMoveTreePath(path: string, entries: readonly FilesEntry[]): boolean {
  const entry = findTreeEntry(entries, fromFilesTreePath(path))
  return entry?.kind === 'file' || entry?.kind === 'directory'
}

function canRenameTreeItem(item: FileTreeRenamingItem, entries: readonly FilesEntry[]): boolean {
  return canMoveTreePath(item.path, entries)
}

function isValidTreeDrop(event: FileTreeDropContext, entries: readonly FilesEntry[]): boolean {
  return createMoveRequestFromTreeDrop(event, entries) !== null
}

function createMoveRequestFromTreeDrop(
  event: FileTreeDropContext,
  entries: readonly FilesEntry[]
): { sourcePath: string; destinationPath: string } | null {
  if (event.draggedPaths.length !== 1) return null
  const sourcePath = fromFilesTreePath(event.draggedPaths[0] ?? '')
  const sourceEntry = findTreeEntry(entries, sourcePath)
  if (!sourceEntry || sourceEntry.kind === 'symlink') return null
  const targetDirectoryPath = fromFilesTreePath(event.target.directoryPath ?? '')
  if (targetDirectoryPath) {
    const targetEntry = findTreeEntry(entries, targetDirectoryPath)
    if (targetEntry?.kind !== 'directory') return null
  }
  if (
    sourceEntry.kind === 'directory' &&
    (targetDirectoryPath === sourcePath || targetDirectoryPath.startsWith(`${sourcePath}/`))
  ) {
    return null
  }
  const destinationPath = joinRelativePath(targetDirectoryPath, pathName(sourcePath))
  if (destinationPath === sourcePath) return null
  const collidingEntry = findTreeEntry(entries, destinationPath)
  if (collidingEntry && collidingEntry.relativePath !== sourcePath) return null
  return { sourcePath, destinationPath }
}

function createEntryNameError(kind: 'file' | 'folder', name: string): string | null {
  if (!name) return `Enter a ${kind} name.`
  if (
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0') ||
    name.includes(':') ||
    name === '.' ||
    name === '..' ||
    name.toLowerCase().replace(/[ .]+$/u, '') === '.git'
  ) {
    return `Use a valid ${kind} name.`
  }
  return null
}

function createRootDestinationLabel(context: FilesContext): string {
  return context.kind === 'knowledge-base' ? 'Knowledge Base root' : 'project root'
}

function formatCreateDestination(parentPath: string, rootLabel: string): string {
  return parentPath || rootLabel
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

function restoredOpenErrorMessage(error: unknown): string {
  if (isFilesNotFoundError(error))
    return 'This restored file no longer exists. Close the tab or choose another file.'
  const code = error instanceof Error ? error.message : ''
  if (code.includes('files.contentTooLarge'))
    return 'This restored file is too large to edit. Reveal it or close the tab.'
  if (code.includes('files.notEditableText'))
    return 'This restored file is no longer editable text. Reveal it or close the tab.'
  return 'Couldn’t restore this file. Other restored tabs are still available.'
}

function saveErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('files.contentTooLarge')) return 'This file is too large to save from Files.'
  if (code.includes('files.notEditableText')) return 'This file is not editable text.'
  return 'Couldn’t save this file. Your changes are still in memory.'
}

function isFilesNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('files.notFound')
}

function externalReadErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('files.inaccessible')) {
    return 'Space Zero cannot access this file. Check its permissions and try again.'
  }
  return 'Couldn’t reload this file from disk. Your changes are still in memory.'
}

function treeMutationErrorMessage(error: unknown): string {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  if (message.toLowerCase().includes('empty')) return 'Enter a name.'
  if (message.toLowerCase().includes('exists') || message.toLowerCase().includes('collision')) {
    return 'An item already exists at that path.'
  }
  if (message.toLowerCase().includes('invalid')) return 'Use a valid name inside this Files root.'
  return 'The file operation failed. No local Files state was changed.'
}

function fileOperationErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('files.collision')) return 'An item already exists at that path.'
  if (code.includes('files.notFound')) {
    return 'The destination folder no longer exists. Refresh the explorer and try again.'
  }
  if (code.includes('files.inaccessible')) {
    return 'Space Zero cannot access this destination. Check directory permissions and try again.'
  }
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

function isContentSearchResult(result: FilesSearchResult): result is ContentSearchResult {
  return result.kind === 'content'
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function explorerViewButtonClass(isActive: boolean): string {
  const base = 'flex size-7 items-center justify-center rounded-md hover:bg-accent'
  return isActive
    ? `${base} bg-accent text-accent-foreground ring-1 ring-ring`
    : `${base} text-muted-foreground`
}

function clampExplorerWidth(width: number): number {
  return Math.min(EXPLORER_MAX_WIDTH, Math.max(EXPLORER_MIN_WIDTH, width))
}
