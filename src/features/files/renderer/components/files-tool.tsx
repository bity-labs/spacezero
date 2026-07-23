import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaretDown, CaretRight, SidebarSimple } from '@phosphor-icons/react'
import { Tree, type NodeRendererProps } from 'react-arborist'

import type { FilesDocument, FilesEntry } from '../../shared'
import {
  createDefaultFilesContext,
  toReadyDocument,
  useFilesStore,
  type FilesActiveDocumentState
} from '../files-store'
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

const EXPLORER_MIN_WIDTH = 180
const EXPLORER_MAX_WIDTH = 520
const EXPLORER_RESIZE_STEP = 20

export function FilesTool({ sessionId }: { sessionId: string }): React.JSX.Element {
  return <FilesToolSession key={sessionId} sessionId={sessionId} />
}

function FilesToolSession({ sessionId }: { sessionId: string }): React.JSX.Element {
  const context = useFilesStore((state) => state.contexts[sessionId]) ?? createDefaultFilesContext()
  const setExplorerWidth = useFilesStore((state) => state.setExplorerWidth)
  const setExplorerCollapsed = useFilesStore((state) => state.setExplorerCollapsed)
  const setSelectedPath = useFilesStore((state) => state.setSelectedPath)
  const setExpanded = useFilesStore((state) => state.setExpanded)
  const setActiveDocument = useFilesStore((state) => state.setActiveDocument)
  const updateDraft = useFilesStore((state) => state.updateDraft)
  const markSaving = useFilesStore((state) => state.markSaving)
  const markSaveFailed = useFilesStore((state) => state.markSaveFailed)
  const markSaved = useFilesStore((state) => state.markSaved)
  const [rootState, setRootState] = useState<RootState>({ status: 'loading' })
  const [treeHeight, setTreeHeight] = useState(480)
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const activeSessionRef = useRef(sessionId)
  const expandedPathsRef = useRef(context.expandedPaths)
  const restoredRootRef = useRef(false)
  const openRequestRef = useRef(0)
  expandedPathsRef.current = context.expandedPaths

  const loadRoot = useCallback(async (): Promise<void> => {
    const requestedSession = sessionId
    restoredRootRef.current = false
    setRootState({ status: 'loading' })
    try {
      const entries = await window.spacezero.files.listDirectory({
        sessionId: requestedSession,
        relativePath: ''
      })
      if (activeSessionRef.current !== requestedSession) return
      setRootState({ status: 'ready', items: entries.map(toTreeItem) })
    } catch (error) {
      if (activeSessionRef.current !== requestedSession) return
      setRootState({ status: 'error', message: filesErrorMessage(error) })
    }
  }, [sessionId])

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
          sessionId: requestedSession,
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
    [sessionId]
  )

  const openFile = useCallback(
    async (relativePath: string): Promise<void> => {
      if (!canReplaceActiveDocument(sessionId, relativePath)) return
      const requestId = openRequestRef.current + 1
      openRequestRef.current = requestId
      setSelectedPath(sessionId, relativePath)
      setActiveDocument(sessionId, { status: 'loading', relativePath })
      try {
        const document = await window.spacezero.files.openDocument({ sessionId, relativePath })
        if (activeSessionRef.current !== sessionId || openRequestRef.current !== requestId) return
        setActiveDocument(sessionId, toActiveDocument(document))
      } catch (error) {
        if (activeSessionRef.current !== sessionId || openRequestRef.current !== requestId) return
        setActiveDocument(sessionId, {
          status: 'error',
          relativePath,
          message: documentErrorMessage(error)
        })
      }
    },
    [sessionId, setActiveDocument, setSelectedPath]
  )

  const saveActiveDocument = useCallback(async (): Promise<void> => {
    const activeDocument = context.activeDocument
    if (
      !activeDocument ||
      activeDocument.status !== 'ready' ||
      activeDocument.saveStatus === 'saving'
    ) {
      return
    }
    const saveRequest = {
      relativePath: activeDocument.relativePath,
      content: activeDocument.draft,
      expectedRevision: activeDocument.revision
    }
    markSaving(sessionId, saveRequest)
    try {
      const result = await window.spacezero.files.saveDocument({
        sessionId,
        ...saveRequest
      })
      if (result.status === 'conflict') {
        markSaveFailed(
          sessionId,
          'This file changed on disk. Reload from disk or review the external changes before saving.',
          saveRequest
        )
        return
      }
      markSaved(sessionId, result.document, saveRequest)
    } catch (error) {
      markSaveFailed(sessionId, saveErrorMessage(error), saveRequest)
    }
  }, [context.activeDocument, markSaveFailed, markSaved, markSaving, sessionId])

  useEffect(() => {
    activeSessionRef.current = sessionId
    void loadRoot()
    return () => {
      if (activeSessionRef.current === sessionId) activeSessionRef.current = ''
    }
  }, [loadRoot, sessionId])

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
            <header className="flex h-9 shrink-0 items-center justify-between border-b px-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Explorer
              </span>
              <button
                aria-label="Collapse Files explorer"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                type="button"
                onClick={() => setExplorerCollapsed(sessionId, true)}
              >
                <SidebarSimple aria-hidden className="size-4" />
              </button>
            </header>
            <div ref={treeContainerRef} className="min-h-0 flex-1 overflow-hidden">
              {rootState.status === 'loading' ? (
                <FilesState message="Loading files…" />
              ) : rootState.status === 'error' ? (
                <FilesState message={rootState.message} actionLabel="Retry" onAction={loadRoot} />
              ) : rootState.items.length === 0 ? (
                <FilesState message="This worktree is empty." />
              ) : (
                <Tree<FilesTreeItem>
                  key={sessionId}
                  aria-label="Project files"
                  data={rootState.items}
                  disableDrag
                  disableDrop
                  disableEdit
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
                      void openFile(item.relativePath)
                    } else {
                      setSelectedPath(sessionId, item.relativePath)
                    }
                  }}
                  onToggle={(id) => {
                    const expanded = !context.expandedPaths.includes(id)
                    setExpanded(sessionId, id, expanded)
                    if (expanded) void loadDirectory(id)
                  }}
                >
                  {(props) => <FilesTreeRow {...props} onRetry={loadDirectory} />}
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
      <div className="flex min-w-0 flex-1 flex-col bg-background" onKeyDown={handleEditorKeyDown}>
        <FilesEditorPanel
          document={context.activeDocument}
          sessionId={sessionId}
          onChange={(draft) => updateDraft(sessionId, draft)}
          onSave={saveActiveDocument}
        />
      </div>
    </section>
  )
}

function FilesEditorPanel({
  document,
  sessionId,
  onChange,
  onSave
}: {
  document: FilesActiveDocumentState | null
  sessionId: string
  onChange: (draft: string) => void
  onSave: () => void | Promise<void>
}): React.JSX.Element {
  const onSaveRef = useRef(onSave)
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])
  const editorOptions = useMemo(
    () => ({ minimap: { enabled: false }, scrollBeyondLastLine: false }),
    []
  )
  const handleEditorMount = useCallback<FilesMonacoEditorMount>((editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void onSaveRef.current()
    })
  }, [])

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
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{document.name}</p>
        <p>{metadataMessage(document.contentKind)}</p>
        <p>{formatBytes(document.size)}</p>
      </div>
    )
  }

  const language = getFilesEditorLanguage(document.relativePath)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-9 shrink-0 items-center justify-between border-b px-3 text-xs">
        <div className="min-w-0">
          <span className="font-medium">{document.name}</span>
          {document.dirty ? <span className="ml-2 text-amber-600">Unsaved changes</span> : null}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          {document.saveStatus === 'saving' ? <span>Saving…</span> : null}
          {!document.dirty && document.saveStatus !== 'saving' ? <span>Saved</span> : null}
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
      <div className="min-h-0 flex-1">
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
      </div>
    </div>
  )
}

function FilesTreeRow({
  node,
  style,
  dragHandle,
  onRetry
}: NodeRendererProps<FilesTreeItem> & {
  onRetry: (relativePath: string) => Promise<void>
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
      className={`flex cursor-default items-center gap-1 pr-2 text-sm outline-none ${node.isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
      style={style}
      title={item.kind === 'symlink' ? `${item.name} — Symbolic link` : item.name}
      onClick={() => node.select()}
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
      {item.kind === 'symlink' ? <span className="sr-only">Symbolic link</span> : null}
    </div>
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

function canReplaceActiveDocument(sessionId: string, nextRelativePath: string): boolean {
  const activeDocument = useFilesStore.getState().contexts[sessionId]?.activeDocument
  if (!activeDocument || activeDocument.status !== 'ready') return true
  if (activeDocument.relativePath === nextRelativePath) return false
  if (!activeDocument.dirty) return true
  return window.confirm(
    `Discard unsaved changes to ${activeDocument.name} before opening another file?`
  )
}

function toTreeItem(entry: FilesEntry): FilesTreeItem {
  return {
    ...entry,
    id: entry.relativePath,
    ...(entry.kind === 'directory' ? { children: [statusItem(entry.relativePath, 'loading')] } : {})
  }
}

function toActiveDocument(document: FilesDocument): FilesActiveDocumentState {
  return document.contentKind === 'text'
    ? toReadyDocument(document)
    : { ...document, status: 'metadata' }
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

function documentErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('files.notFile')) return 'This item is not a regular file.'
  if (code.includes('files.gitProtected'))
    return 'Git internals are protected and cannot be opened.'
  if (code.includes('files.symlinkTraversalDenied'))
    return 'Symbolic links cannot be opened in Files.'
  if (code.includes('files.notFound'))
    return 'This file no longer exists. Refresh the explorer and try again.'
  if (code.includes('files.inaccessible')) {
    return 'Space Zero cannot access this file. Check its permissions and try again.'
  }
  return 'Couldn’t open this file. Try again.'
}

function saveErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('files.contentTooLarge')) return 'This file is too large to save from Files.'
  if (code.includes('files.notEditableText')) return 'This file is not editable text.'
  return 'Couldn’t save this file. Your changes are still in memory.'
}

function metadataMessage(contentKind: 'binary' | 'oversized'): string {
  return contentKind === 'oversized'
    ? 'This file is larger than 2 MiB and cannot be edited here.'
    : 'This file is binary and cannot be edited here.'
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
