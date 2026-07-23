import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaretDown, CaretRight, SidebarSimple } from '@phosphor-icons/react'
import { Tree, type NodeRendererProps } from 'react-arborist'

import type { FilesEntry } from '../../shared'
import { createDefaultFilesContext, useFilesStore } from '../files-store'
import { FilesIcon } from './files-icon'

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
  const [rootState, setRootState] = useState<RootState>({ status: 'loading' })
  const [treeHeight, setTreeHeight] = useState(480)
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const activeSessionRef = useRef(sessionId)
  const expandedPathsRef = useRef(context.expandedPaths)
  const restoredRootRef = useRef(false)
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
          if (
            entry.kind === 'directory' &&
            expandedPathsRef.current.includes(entry.relativePath)
          ) {
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
      (item) =>
        item.kind === 'directory' && expandedPathsRef.current.includes(item.relativePath)
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
                    if (item && item.kind !== 'status')
                      setSelectedPath(sessionId, item.relativePath)
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
      <div className="flex min-w-0 flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Select a file to open it in a future Files slice.
      </div>
    </section>
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

function statusMessage(status: 'loading' | 'empty' | 'error'): string {
  if (status === 'loading') return 'Loading…'
  if (status === 'empty') return 'Empty folder'
  return 'Couldn’t read this directory.'
}

function clampExplorerWidth(width: number): number {
  return Math.min(EXPLORER_MAX_WIDTH, Math.max(EXPLORER_MIN_WIDTH, width))
}
