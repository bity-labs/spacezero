import type {
  FocusEvent,
  FormEvent,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
  RefObject,
  UIEvent
} from 'react'
import {
  ArrowsInLineVertical,
  FilePlus,
  FolderSimplePlus,
  MagnifyingGlass,
  SidebarSimple,
  TreeStructure
} from '@phosphor-icons/react'

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

export type FilesSearchResultView = {
  relativePath: string
  name: string
  snippets: Array<{ line: number; column: number; text: string }>
}

export type FilesContentSearchViewState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'ready'; query: string; results: FilesSearchResultView[] }
  | { status: 'error'; query: string; message: string }

export type FilesTreeViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; content: ReactNode }

export type FilesCreateDialogViewState = {
  kind: 'file' | 'folder'
  destination: string
  name: string
  error: string | null
  status: 'idle' | 'submitting'
}

export type FilesToolViewProps = {
  explorerCollapsed: boolean
  explorerWidth: number
  searchMode: 'files' | 'contents'
  filesSearchQuery: string
  contentSearchQuery: string
  treeState: FilesTreeViewState
  contentSearchState: FilesContentSearchViewState
  editorContent: ReactNode
  createDialog: FilesCreateDialogViewState | null
  closePromptFileName: string | null
  createInputRef?: RefObject<HTMLInputElement | null>
  searchInputRef?: RefObject<HTMLInputElement | null>
  treeContainerRef?: RefObject<HTMLDivElement | null>
  onCollapseAll: () => void
  onCollapseExplorer: () => void
  onContentSearchChange: (query: string) => void
  onCreateDialogCancel: () => void
  onCreateDialogChange: (name: string) => void
  onCreateDialogSubmit: () => void
  onCreateFile: () => void
  onCreateFolder: () => void
  onEditorFocusChange: (focused: boolean) => void
  onEditorKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onExpandExplorer: () => void
  onExplorerKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onExplorerPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onExplorerScroll: (event: UIEvent<HTMLDivElement>) => void
  onFilesSearchChange: (query: string) => void
  onOpenSearchResult: (result: FilesSearchResultView) => void
  onRetryContentSearch: () => void | Promise<void>
  onRetryTree: () => void | Promise<void>
  onSearchModeChange: (mode: 'files' | 'contents') => void
  onSubmitContentSearch: () => void
  onClosePromptCancel: () => void
  onClosePromptDiscard: () => void
  onClosePromptSave: () => void
}

export function FilesToolView({
  explorerCollapsed,
  explorerWidth,
  searchMode,
  filesSearchQuery,
  contentSearchQuery,
  treeState,
  contentSearchState,
  editorContent,
  createDialog,
  closePromptFileName,
  createInputRef,
  searchInputRef,
  treeContainerRef,
  onCollapseAll,
  onCollapseExplorer,
  onContentSearchChange,
  onCreateDialogCancel,
  onCreateDialogChange,
  onCreateDialogSubmit,
  onCreateFile,
  onCreateFolder,
  onEditorFocusChange,
  onEditorKeyDown,
  onExpandExplorer,
  onExplorerKeyDown,
  onExplorerPointerDown,
  onExplorerScroll,
  onFilesSearchChange,
  onOpenSearchResult,
  onRetryContentSearch,
  onRetryTree,
  onSearchModeChange,
  onSubmitContentSearch,
  onClosePromptCancel,
  onClosePromptDiscard,
  onClosePromptSave
}: FilesToolViewProps): React.JSX.Element {
  const handleBlur = (event: FocusEvent<HTMLElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) onEditorFocusChange(false)
  }
  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (searchMode === 'contents') onSubmitContentSearch()
  }

  return (
    <section
      aria-label="Files explorer"
      className="flex h-full min-h-0 min-w-0 overflow-hidden bg-background"
      onFocusCapture={() => onEditorFocusChange(true)}
      onBlurCapture={handleBlur}
    >
      {explorerCollapsed ? (
        <button
          aria-label="Expand Files explorer"
          className="m-2 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          title="Expand Files explorer"
          type="button"
          onClick={onExpandExplorer}
        >
          <SidebarSimple aria-hidden className="size-4" />
        </button>
      ) : (
        <>
          <div
            className="flex min-h-0 shrink-0 flex-col border-r bg-background"
            style={{ width: explorerWidth }}
          >
            <header className="flex shrink-0 flex-col gap-2 border-b p-2">
              <div className="flex h-7 items-center justify-between gap-2">
                <div className="flex items-center gap-1" aria-label="Files explorer views">
                  <button
                    aria-label="Files search"
                    aria-pressed={searchMode === 'files'}
                    className={explorerViewButtonClass(searchMode === 'files')}
                    title="Files search"
                    type="button"
                    onClick={() => onSearchModeChange('files')}
                  >
                    <TreeStructure aria-hidden className="size-4" />
                  </button>
                  <button
                    aria-label="Contents search"
                    aria-pressed={searchMode === 'contents'}
                    className={explorerViewButtonClass(searchMode === 'contents')}
                    title="Contents search"
                    type="button"
                    onClick={() => onSearchModeChange('contents')}
                  >
                    <MagnifyingGlass aria-hidden className="size-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <ExplorerAction label="New file" onClick={onCreateFile}>
                    <FilePlus aria-hidden className="size-4" />
                  </ExplorerAction>
                  <ExplorerAction label="New folder" onClick={onCreateFolder}>
                    <FolderSimplePlus aria-hidden className="size-4" />
                  </ExplorerAction>
                  <ExplorerAction label="Collapse all folders" onClick={onCollapseAll}>
                    <ArrowsInLineVertical aria-hidden className="size-4" />
                  </ExplorerAction>
                  <ExplorerAction label="Collapse Files explorer" onClick={onCollapseExplorer}>
                    <SidebarSimple aria-hidden className="size-4" />
                  </ExplorerAction>
                </div>
              </div>
              <form
                aria-label={searchMode === 'files' ? 'Files search' : 'Contents search'}
                className="flex items-center gap-1"
                role="search"
                onSubmit={handleSearchSubmit}
              >
                <div className="flex min-w-0 flex-1 items-center rounded-md border px-2">
                  <MagnifyingGlass
                    aria-hidden
                    className="mr-1 size-3 shrink-0 text-muted-foreground"
                  />
                  <input
                    ref={searchMode === 'contents' ? searchInputRef : undefined}
                    aria-label={searchMode === 'files' ? 'Files search' : 'Contents search'}
                    className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    placeholder={
                      searchMode === 'files' ? 'Search files by path' : 'Search contents'
                    }
                    value={searchMode === 'files' ? filesSearchQuery : contentSearchQuery}
                    onChange={(event) =>
                      searchMode === 'files'
                        ? onFilesSearchChange(event.currentTarget.value)
                        : onContentSearchChange(event.currentTarget.value)
                    }
                  />
                </div>
              </form>
            </header>
            <div
              ref={treeContainerRef}
              className="min-h-0 flex-1 overflow-hidden"
              onScrollCapture={onExplorerScroll}
            >
              {searchMode === 'contents' ? (
                <FilesSearchResultsView
                  state={contentSearchState}
                  onOpen={onOpenSearchResult}
                  onRetry={onRetryContentSearch}
                />
              ) : (
                <FilesTreeStateView state={treeState} onRetry={onRetryTree} />
              )}
            </div>
          </div>
          <div
            aria-label="Resize Files explorer"
            aria-orientation="vertical"
            aria-valuemax={520}
            aria-valuemin={180}
            aria-valuenow={explorerWidth}
            className="w-1 shrink-0 cursor-col-resize focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            role="separator"
            tabIndex={0}
            onKeyDown={onExplorerKeyDown}
            onPointerDown={onExplorerPointerDown}
          />
        </>
      )}
      <div
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background"
        onKeyDown={onEditorKeyDown}
      >
        {editorContent}
        {closePromptFileName ? (
          <UnsavedChangesDialogView
            fileName={closePromptFileName}
            onCancel={onClosePromptCancel}
            onDiscard={onClosePromptDiscard}
            onSave={onClosePromptSave}
          />
        ) : null}
      </div>
      <CreateEntryDialogView
        inputRef={createInputRef}
        state={createDialog}
        onCancel={onCreateDialogCancel}
        onChange={onCreateDialogChange}
        onSubmit={onCreateDialogSubmit}
      />
    </section>
  )
}

function ExplorerAction({
  label,
  children,
  onClick
}: {
  label: string
  children: ReactNode
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
      title={label}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function FilesTreeStateView({
  state,
  onRetry
}: {
  state: FilesTreeViewState
  onRetry: () => void | Promise<void>
}): React.JSX.Element {
  if (state.status === 'loading') return <FilesStateView message="Loading files…" />
  if (state.status === 'error') {
    return <FilesStateView message={state.message} actionLabel="Retry" onAction={onRetry} />
  }
  if (state.status === 'empty') return <FilesStateView message="This worktree is empty." />
  return <>{state.content}</>
}

export function FilesSearchResultsView({
  state,
  onOpen,
  onRetry
}: {
  state: FilesContentSearchViewState
  onOpen: (result: FilesSearchResultView) => void
  onRetry: () => void | Promise<void>
}): React.JSX.Element {
  if (state.status === 'loading') return <FilesStateView message="Searching contents…" />
  if (state.status === 'error') {
    return <FilesStateView message={state.message} actionLabel="Retry" onAction={onRetry} />
  }
  if (state.status === 'idle') return <FilesStateView message="Enter a content search query." />
  if (state.results.length === 0) {
    return <FilesStateView message={`No results for “${state.query}”.`} />
  }

  return (
    <div className="h-full overflow-auto p-2" aria-label="Search results">
      <p className="mb-2 text-xs text-muted-foreground">
        {state.results.length} result{state.results.length === 1 ? '' : 's'} for “{state.query}”
      </p>
      <div className="space-y-1">
        {state.results.map((result, index) => (
          <button
            key={`${result.relativePath}:${index}`}
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

export type FilesEditorViewModel =
  | { status: 'empty'; emptyRoot: boolean }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      name: string
      preview: boolean
      dirty?: boolean
      supportsRichMode?: boolean
      activeMode?: 'rich' | 'source'
      richModeLimitation?: string | null
      externalStatus?: 'conflict' | 'deleted'
      error?: string | null
      content: ReactNode
    }

export function FilesEditorView({
  state,
  onCreateFile = () => undefined,
  onSetEditorMode = () => undefined,
  onReloadFromDisk = () => undefined,
  onOverwriteDisk = () => undefined,
  onRecreateFile = () => undefined,
  onCloseTab = () => undefined
}: {
  state: FilesEditorViewModel
  onCreateFile?: () => void
  onSetEditorMode?: (mode: 'rich' | 'source') => void
  onReloadFromDisk?: () => void
  onOverwriteDisk?: () => void
  onRecreateFile?: () => void
  onCloseTab?: () => void
}): React.JSX.Element {
  if (state.status === 'empty') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <p>{state.emptyRoot ? 'No files yet.' : 'Select a file to open it.'}</p>
        {state.emptyRoot ? (
          <Button type="button" onClick={onCreateFile}>
            Create new file
          </Button>
        ) : null}
      </div>
    )
  }
  if (state.status === 'loading') return <FilesStateView message="Opening file…" />
  if (state.status === 'error') return <FilesStateView message={state.message} />

  const activeMode = state.activeMode ?? 'source'
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-9 shrink-0 items-center justify-between border-b px-3 text-xs">
        <div className="min-w-0">
          <span className="font-medium">{state.name}</span>
          {state.preview ? <span className="ml-2 text-muted-foreground">Preview</span> : null}
          {state.dirty ? <span className="ml-2 text-muted-foreground">Unsaved</span> : null}
        </div>
        {state.supportsRichMode ? (
          <div className="flex items-center rounded-md border p-0.5" aria-label="Editor mode">
            <button
              aria-pressed={activeMode === 'rich'}
              className={`rounded px-2 py-0.5 text-foreground disabled:opacity-50 ${activeMode === 'rich' ? 'bg-muted' : 'hover:bg-accent'}`}
              disabled={Boolean(state.richModeLimitation)}
              title={state.richModeLimitation ?? 'Use rich Markdown editing'}
              type="button"
              onClick={() => onSetEditorMode('rich')}
            >
              Rich
            </button>
            <button
              aria-pressed={activeMode === 'source'}
              className={`rounded px-2 py-0.5 text-foreground ${activeMode === 'source' ? 'bg-muted' : 'hover:bg-accent'}`}
              type="button"
              onClick={() => onSetEditorMode('source')}
            >
              Source
            </button>
          </div>
        ) : null}
      </header>
      {state.externalStatus ? (
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
          <span>
            {state.externalStatus === 'deleted'
              ? 'Deleted on disk. Your buffer is still open.'
              : 'Changed on disk. Choose how to resolve before saving.'}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {state.externalStatus === 'conflict' ? (
              <>
                <EditorAction onClick={onReloadFromDisk}>Reload from disk</EditorAction>
                <EditorAction onClick={onOverwriteDisk}>Overwrite disk</EditorAction>
              </>
            ) : (
              <>
                <EditorAction onClick={onRecreateFile}>Recreate file</EditorAction>
                <EditorAction onClick={onCloseTab}>Close tab</EditorAction>
              </>
            )}
          </span>
        </div>
      ) : null}
      {state.error ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {state.error}
        </div>
      ) : null}
      {state.richModeLimitation ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          {state.richModeLimitation}
        </div>
      ) : null}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {state.content}
      </div>
    </div>
  )
}

function EditorAction({
  children,
  onClick
}: {
  children: ReactNode
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      className="rounded-md border px-2 py-1 hover:bg-background"
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function CreateEntryDialogView({
  inputRef,
  state,
  onCancel,
  onChange,
  onSubmit
}: {
  inputRef?: RefObject<HTMLInputElement | null>
  state: FilesCreateDialogViewState | null
  onCancel: () => void
  onChange: (name: string) => void
  onSubmit: () => void
}): React.JSX.Element | null {
  if (!state) return null
  const title = state.kind === 'file' ? 'New File' : 'New Folder'
  const placeholder = state.kind === 'file' ? 'File name' : 'Folder name'
  const isSubmitting = state.status === 'submitting'
  return (
    <Dialog open onOpenChange={(open) => !open && !isSubmitting && onCancel()}>
      <DialogContent showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Create in {state.destination}</DialogDescription>
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

export function UnsavedChangesDialogView({
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
          <DialogAction onClick={onCancel}>Cancel</DialogAction>
          <DialogAction onClick={onDiscard}>Discard</DialogAction>
          <DialogAction onClick={onSave}>Save</DialogAction>
        </div>
      </div>
    </div>
  )
}

function DialogAction({
  children,
  onClick
}: {
  children: ReactNode
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      className="rounded-md border px-3 py-1 text-sm hover:bg-accent"
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function FilesStateView({
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

function explorerViewButtonClass(active: boolean): string {
  const base = 'flex size-7 items-center justify-center rounded-md hover:bg-accent'
  return active
    ? `${base} bg-accent text-accent-foreground ring-1 ring-ring`
    : `${base} text-muted-foreground`
}
