import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BookOpenText,
  CaretRight,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  GitBranch,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  SignOut,
  Trash
} from '@phosphor-icons/react'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import {
  KnowledgeBaseDocumentEditor,
  type KnowledgeBaseDocumentEditorHandle
} from './knowledge-base-document-editor'
import type {
  KnowledgeBaseDocument,
  KnowledgeBaseSearchResult,
  KnowledgeBaseStatus,
  KnowledgeBaseSyncStatus,
  KnowledgeBaseTreeItem
} from '../shared'

export function KnowledgeBasePage(): React.JSX.Element {
  const [status, setStatus] = useState<KnowledgeBaseStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setCreating] = useState(false)
  const [isCloneFormOpen, setCloneFormOpen] = useState(false)
  const [isCloning, setCloning] = useState(false)
  const [gitUrl, setGitUrl] = useState('')

  useEffect(() => {
    let current = true
    window.spacezero.knowledgeBase
      .getStatus()
      .then((nextStatus) => {
        if (current) setStatus(nextStatus)
      })
      .catch((loadError: unknown) => {
        if (current) setError(getErrorMessage(loadError, 'Unable to load the Knowledge Base.'))
      })
    return () => {
      current = false
    }
  }, [])

  async function createNew(): Promise<void> {
    setCreating(true)
    setError(null)
    try {
      setStatus(await window.spacezero.knowledgeBase.createNew())
    } catch (setupError) {
      setError(getErrorMessage(setupError, 'Unable to create the Knowledge Base.'))
    } finally {
      setCreating(false)
    }
  }

  async function cloneFromGit(): Promise<void> {
    if (!gitUrl.trim()) return
    setCloning(true)
    setError(null)
    try {
      setStatus(await window.spacezero.knowledgeBase.cloneFromGit({ gitUrl: gitUrl.trim() }))
    } catch (setupError) {
      setError(getErrorMessage(setupError, 'Unable to clone the Knowledge Base.'))
    } finally {
      setCloning(false)
    }
  }

  if (!status && !error) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading Knowledge Base…</div>
  }

  if (status?.setupState === 'configured') {
    return <ConfiguredKnowledgeBase status={status} />
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <BookOpenText className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">Set up your Knowledge Base</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Keep durable notes and project knowledge in a user-owned Git repository.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="gap-4 p-5">
            <Plus className="size-5 text-muted-foreground" aria-hidden="true" />
            <div className="flex-1">
              <h2 className="font-medium">Create new</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create ~/SpaceZero/knowledge-base and initialize it on main.
              </p>
            </div>
            <Button disabled={isCreating} onClick={() => void createNew()}>
              {isCreating ? 'Creating…' : 'Create new'}
            </Button>
          </Card>

          <Card className="gap-4 p-5">
            <GitBranch className="size-5 text-muted-foreground" aria-hidden="true" />
            <div className="flex-1">
              <h2 className="font-medium">Clone from Git repository</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Bring an existing Git-backed Knowledge Base into Space Zero.
              </p>
            </div>
            <Button variant="outline" onClick={() => setCloneFormOpen(true)}>
              Clone from Git repository
            </Button>
          </Card>
        </div>

        {isCloneFormOpen ? (
          <Card className="mt-4 gap-4 p-5">
            <div>
              <label htmlFor="knowledge-base-git-url" className="text-sm font-medium">
                Git repository URL
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Space Zero uses your local Git credentials and SSH configuration.
              </p>
            </div>
            <Input
              id="knowledge-base-git-url"
              value={gitUrl}
              autoFocus
              placeholder="https://github.com/you/knowledge-base.git"
              onChange={(event) => setGitUrl(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCloneFormOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!gitUrl.trim() || isCloning}
                onClick={() => void cloneFromGit()}
              >
                {isCloning ? 'Cloning…' : 'Clone repository'}
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function ConfiguredKnowledgeBase({
  status
}: {
  status: Extract<KnowledgeBaseStatus, { setupState: 'configured' }>
}): React.JSX.Element {
  const [tree, setTree] = useState<KnowledgeBaseTreeItem[]>([])
  const [document, setDocument] = useState<KnowledgeBaseDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<KnowledgeBaseSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selectedItem, setSelectedItem] = useState<KnowledgeBaseTreeItem | null>(null)
  const [syncStatus, setSyncStatus] = useState<KnowledgeBaseSyncStatus | null>(null)
  const [isAddRemoteOpen, setAddRemoteOpen] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [itemAction, setItemAction] = useState<KnowledgeBaseItemAction | null>(null)
  const [mutatingItem, setMutatingItem] = useState(false)
  const documentEditorRef = useRef<KnowledgeBaseDocumentEditorHandle>(null)
  const treeRequestIdRef = useRef(0)
  const hasObservedSyncStatusRef = useRef(false)
  const lastObservedSyncAtRef = useRef<string | undefined>(undefined)

  const refreshTree = useCallback(async (): Promise<void> => {
    const requestId = treeRequestIdRef.current + 1
    treeRequestIdRef.current = requestId
    const items = await window.spacezero.knowledgeBase.getTree()
    if (treeRequestIdRef.current === requestId) setTree(items)
  }, [])

  useEffect(() => {
    let current = true
    refreshTree()
      .catch((treeError: unknown) => {
        if (current) setError(getErrorMessage(treeError, 'Unable to load Knowledge Base files.'))
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
      treeRequestIdRef.current += 1
    }
  }, [refreshTree])

  useEffect(() => {
    let current = true
    function loadSyncStatus(): void {
      window.spacezero.knowledgeBase
        .getSyncStatus()
        .then(async (nextStatus) => {
          if (!current) return
          const shouldRefreshTree =
            nextStatus.syncState === 'idle' &&
            Boolean(nextStatus.lastSyncAt) &&
            (!hasObservedSyncStatusRef.current ||
              nextStatus.lastSyncAt !== lastObservedSyncAtRef.current)

          hasObservedSyncStatusRef.current = true
          lastObservedSyncAtRef.current = nextStatus.lastSyncAt
          setSyncStatus(nextStatus)

          if (shouldRefreshTree) {
            try {
              await refreshTree()
            } catch (treeError) {
              if (current) {
                setError(
                  getErrorMessage(
                    treeError,
                    'Knowledge Base synced, but its file tree could not be refreshed.'
                  )
                )
              }
            }
          }
        })
        .catch((syncError: unknown) => {
          if (current) {
            setError(getErrorMessage(syncError, 'Unable to load Knowledge Base sync status.'))
          }
        })
    }

    loadSyncStatus()
    const interval = window.setInterval(loadSyncStatus, 30_000)
    return () => {
      current = false
      window.clearInterval(interval)
    }
  }, [refreshTree])

  async function flushOpenDocument(): Promise<boolean> {
    const saved = (await documentEditorRef.current?.flushPendingSave()) ?? true
    if (!saved) {
      setError('Save or resolve the open document before continuing.')
    }
    return saved
  }

  async function openDocument(relativePath: string): Promise<boolean> {
    if (document?.relativePath === relativePath) return true
    setError(null)
    if (!(await flushOpenDocument())) return false

    try {
      setDocument(await window.spacezero.knowledgeBase.openDocument({ relativePath }))
      return true
    } catch (openError) {
      setError(getErrorMessage(openError, 'Unable to open this file.'))
      return false
    }
  }

  async function selectTreeItem(item: KnowledgeBaseTreeItem): Promise<void> {
    if (item.kind === 'file' && !(await openDocument(item.relativePath))) return
    setSelectedItem(item)
  }

  async function addRemote(): Promise<void> {
    const gitUrl = remoteUrl.trim()
    if (!gitUrl) return
    setSyncing(true)
    setError(null)
    try {
      setSyncStatus(await window.spacezero.knowledgeBase.addRemote({ gitUrl }))
      setAddRemoteOpen(false)
      setRemoteUrl('')
    } catch (remoteError) {
      setError(getErrorMessage(remoteError, 'Unable to add the origin remote.'))
    } finally {
      setSyncing(false)
    }
  }

  async function syncNow(): Promise<void> {
    setSyncing(true)
    setError(null)
    try {
      setSyncStatus(await window.spacezero.knowledgeBase.syncNow())
      await refreshTree()
    } catch (syncError) {
      setError(getErrorMessage(syncError, 'Unable to sync the Knowledge Base.'))
      try {
        setSyncStatus(await window.spacezero.knowledgeBase.getSyncStatus())
      } catch {
        // Keep the actionable Git error already shown above.
      }
    } finally {
      setSyncing(false)
    }
  }

  async function openRecoveryFolder(): Promise<void> {
    try {
      await window.spacezero.knowledgeBase.openFolder()
    } catch (recoveryError) {
      setError(getErrorMessage(recoveryError, 'Unable to open the Knowledge Base folder.'))
    }
  }

  async function openRecoveryRemote(): Promise<void> {
    try {
      await window.spacezero.knowledgeBase.openRemote()
    } catch (recoveryError) {
      setError(getErrorMessage(recoveryError, 'Unable to open the Knowledge Base remote.'))
    }
  }

  function startCreateItem(kind: 'file' | 'folder'): void {
    setItemAction({ kind: 'create', itemKind: kind, value: '' })
  }

  function startSelectedItemAction(kind: 'rename' | 'move' | 'delete'): void {
    if (!selectedItem) return
    if (kind === 'delete') {
      setItemAction({ kind, item: selectedItem })
      return
    }
    setItemAction({
      kind,
      item: selectedItem,
      value: kind === 'rename' ? selectedItem.name : selectedItem.relativePath
    })
  }

  async function submitItemAction(): Promise<void> {
    if (!itemAction) return
    const value = itemAction.kind === 'delete' ? undefined : itemAction.value.trim()
    if (itemAction.kind !== 'delete' && !value) return

    setMutatingItem(true)
    setError(null)
    try {
      if (itemAction.kind !== 'create' && !(await flushOpenDocument())) return

      if (itemAction.kind === 'create') {
        await window.spacezero.knowledgeBase.createItem({
          relativePath: value!,
          kind: itemAction.itemKind
        })
      } else if (itemAction.kind === 'rename') {
        if (value === itemAction.item.name) {
          setItemAction(null)
          return
        }
        await window.spacezero.knowledgeBase.renameItem({
          relativePath: itemAction.item.relativePath,
          newName: value!
        })
        clearAffectedSelection(itemAction.item.relativePath)
      } else if (itemAction.kind === 'move') {
        if (value === itemAction.item.relativePath) {
          setItemAction(null)
          return
        }
        await window.spacezero.knowledgeBase.moveItem({
          sourcePath: itemAction.item.relativePath,
          destinationPath: value!
        })
        clearAffectedSelection(itemAction.item.relativePath)
      } else {
        await window.spacezero.knowledgeBase.deleteItem({
          relativePath: itemAction.item.relativePath
        })
        clearAffectedSelection(itemAction.item.relativePath)
      }
      setItemAction(null)
      await refreshTree()
    } catch (mutationError) {
      const actionLabel =
        itemAction.kind === 'create'
          ? `create this ${itemAction.itemKind}`
          : `${itemAction.kind} this item`
      setError(getErrorMessage(mutationError, `Unable to ${actionLabel}.`))
    } finally {
      setMutatingItem(false)
    }
  }

  function clearAffectedSelection(relativePath: string): void {
    if (
      document?.relativePath === relativePath ||
      document?.relativePath.startsWith(`${relativePath}/`)
    ) {
      setDocument(null)
    }
    setSelectedItem(null)
  }

  async function search(): Promise<void> {
    const query = searchQuery.trim()
    if (!query) {
      setSearchResults(null)
      return
    }
    setSearching(true)
    setError(null)
    try {
      setSearchResults(await window.spacezero.knowledgeBase.search({ query }))
    } catch (searchError) {
      setError(getErrorMessage(searchError, 'Unable to search the Knowledge Base.'))
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b px-6 py-4">
        <BookOpenText className="size-6 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Knowledge Base</h1>
          <p className="truncate text-xs text-muted-foreground">{status.rootPath}</p>
        </div>
        <form
          className="ml-auto flex w-full max-w-sm items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void search()
          }}
        >
          <Input
            value={searchQuery}
            aria-label="Search Knowledge Base"
            placeholder="Search files and content"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!searchQuery.trim() || searching}>
            <MagnifyingGlass className="size-4" aria-hidden="true" />
            Search
          </Button>
        </form>
      </header>

      <div className="flex min-h-11 items-center gap-3 border-b px-6 py-2 text-xs">
        {syncStatus ? (
          <>
            <Badge variant={syncStatus.syncState === 'idle' ? 'secondary' : 'outline'}>
              {syncStatus.remoteState === 'local-only'
                ? 'Local only'
                : getSyncStateLabel(syncStatus.syncState)}
            </Badge>
            {syncStatus.lastSyncAt ? (
              <span className="text-muted-foreground">
                Last synced {new Date(syncStatus.lastSyncAt).toLocaleString()}
              </span>
            ) : null}
            {syncStatus.remoteState === 'local-only' ? (
              <Button
                className="ml-auto"
                variant="outline"
                size="xs"
                onClick={() => setAddRemoteOpen(true)}
              >
                Add remote
              </Button>
            ) : (
              <Button
                className="ml-auto"
                variant="outline"
                size="xs"
                disabled={syncing}
                onClick={() => void syncNow()}
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </Button>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">Loading sync status…</span>
        )}
      </div>

      {status.setupWarning ? (
        <Alert className="m-4 mb-0">
          <AlertDescription>{status.setupWarning}</AlertDescription>
        </Alert>
      ) : null}

      {isAddRemoteOpen ? (
        <div className="flex items-end gap-3 border-b bg-muted/30 px-6 py-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="knowledge-base-origin-url" className="text-xs font-medium">
              Origin Git URL
            </label>
            <Input
              id="knowledge-base-origin-url"
              value={remoteUrl}
              className="mt-1"
              autoFocus
              placeholder="git@github.com:you/knowledge-base.git"
              onChange={(event) => setRemoteUrl(event.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => setAddRemoteOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!remoteUrl.trim() || syncing} onClick={() => void addRemote()}>
            Save remote
          </Button>
        </div>
      ) : null}

      {syncStatus &&
      (syncStatus.syncState === 'error' || syncStatus.syncState === 'conflict') ? (
        <Alert variant="destructive" className="m-4 mb-0">
          <AlertDescription>
            {syncStatus.lastSyncError ?? 'Knowledge Base sync needs attention.'}
          </AlertDescription>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void syncNow()}>
              Retry sync
            </Button>
            <Button variant="outline" size="sm" onClick={() => void openRecoveryFolder()}>
              Open folder
            </Button>
            {syncStatus.remoteState === 'configured' ? (
              <Button variant="outline" size="sm" onClick={() => void openRecoveryRemote()}>
                Open remote
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="m-4 mb-0">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(180px,260px)_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-auto border-r p-3">
          <div className="mb-3 flex flex-wrap items-center gap-1 border-b pb-3">
            <Button variant="outline" size="xs" onClick={() => startCreateItem('file')}>
              <FilePlus className="size-3.5" aria-hidden="true" />
              New file
            </Button>
            <Button variant="outline" size="xs" onClick={() => startCreateItem('folder')}>
              <FolderPlus className="size-3.5" aria-hidden="true" />
              New folder
            </Button>
            {selectedItem ? (
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Rename ${selectedItem.name}`}
                  onClick={() => startSelectedItemAction('rename')}
                >
                  <PencilSimple className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${selectedItem.name}`}
                  onClick={() => startSelectedItemAction('move')}
                >
                  <SignOut className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete ${selectedItem.name}`}
                  onClick={() => startSelectedItemAction('delete')}
                >
                  <Trash className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </div>
          {searchResults ? (
            <section aria-label="Knowledge Base search results" className="mb-3 border-b pb-3">
              <div className="mb-2 flex items-center justify-between px-2">
                <h2 className="text-xs font-medium text-muted-foreground">Search results</h2>
                <Button variant="ghost" size="xs" onClick={() => setSearchResults(null)}>
                  Clear
                </Button>
              </div>
              {searchResults.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">No matches found.</p>
              ) : (
                <div className="space-y-1">
                  {searchResults.map((result) => (
                    <button
                      key={result.relativePath}
                      type="button"
                      className="w-full rounded-md px-2 py-2 text-left hover:bg-muted"
                      onClick={() => void openDocument(result.relativePath)}
                    >
                      <span className="block truncate text-xs font-medium">
                        {result.relativePath}
                      </span>
                      {result.snippet ? (
                        <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
                          {result.snippet}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}
          <div role="tree" aria-label="Knowledge Base files" className="space-y-0.5">
            {loading ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">Loading files…</p>
            ) : tree.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">No files yet.</p>
            ) : (
              tree.map((item) => (
                <KnowledgeBaseTreeNode
                  key={item.relativePath}
                  item={item}
                  depth={0}
                  selectedPath={selectedItem?.relativePath}
                  onSelect={(item) => void selectTreeItem(item)}
                />
              ))
            )}
          </div>
        </aside>

        <main className="min-h-0 overflow-auto p-6" aria-label="Knowledge Base document">
          {!document ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a file to open it.
            </div>
          ) : document.contentKind === 'binary' ? (
            <div className="mx-auto max-w-lg rounded-lg border p-6 text-center">
              <File className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
              <h2 className="mt-3 font-medium">Preview unavailable</h2>
              <p className="mt-1 text-sm text-muted-foreground">{document.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatFileSize(document.size)}</p>
            </div>
          ) : (
            <KnowledgeBaseDocumentEditor
              ref={documentEditorRef}
              key={document.relativePath}
              document={document}
              onDocumentChange={setDocument}
            />
          )}
        </main>
      </div>

      <KnowledgeBaseItemActionDialog
        action={itemAction}
        busy={mutatingItem}
        onActionChange={setItemAction}
        onSubmit={() => void submitItemAction()}
      />
    </div>
  )
}

type KnowledgeBaseItemAction =
  | { kind: 'create'; itemKind: 'file' | 'folder'; value: string }
  | { kind: 'rename' | 'move'; item: KnowledgeBaseTreeItem; value: string }
  | { kind: 'delete'; item: KnowledgeBaseTreeItem }

function KnowledgeBaseItemActionDialog({
  action,
  busy,
  onActionChange,
  onSubmit
}: {
  action: KnowledgeBaseItemAction | null
  busy: boolean
  onActionChange: (action: KnowledgeBaseItemAction | null) => void
  onSubmit: () => void
}): React.JSX.Element | null {
  if (!action) return null

  const title =
    action.kind === 'create'
      ? `Create ${action.itemKind}`
      : action.kind === 'delete'
        ? `Delete ${action.item.name}?`
        : action.kind === 'rename'
          ? `Rename ${action.item.name}`
          : `Move ${action.item.name}`
  const submitLabel =
    action.kind === 'create'
      ? `Create ${action.itemKind}`
      : action.kind === 'delete'
        ? 'Delete permanently'
        : action.kind === 'rename'
          ? 'Rename'
          : 'Move'
  const inputLabel =
    action.kind === 'create'
      ? `${action.itemKind === 'file' ? 'File' : 'Folder'} path`
      : action.kind === 'rename'
        ? 'New name'
        : 'Destination path'

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onActionChange(null)
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {action.kind === 'delete'
                ? 'This item and its contents will be deleted permanently. This cannot be undone.'
                : action.kind === 'move'
                  ? 'Enter the full destination path relative to the Knowledge Base root.'
                  : 'Paths are relative to the Knowledge Base root.'}
            </DialogDescription>
          </DialogHeader>
          {action.kind !== 'delete' ? (
            <div>
              <label htmlFor="knowledge-base-item-action-value" className="text-sm font-medium">
                {inputLabel}
              </label>
              <Input
                id="knowledge-base-item-action-value"
                className="mt-2"
                autoFocus
                disabled={busy}
                value={action.value}
                onChange={(event) =>
                  onActionChange({ ...action, value: event.target.value })
                }
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onActionChange(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={action.kind === 'delete' ? 'destructive' : 'default'}
              disabled={busy || (action.kind !== 'delete' && !action.value.trim())}
            >
              {busy ? 'Working…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function KnowledgeBaseTreeNode({
  item,
  depth,
  selectedPath,
  onSelect
}: {
  item: KnowledgeBaseTreeItem
  depth: number
  selectedPath?: string
  onSelect: (item: KnowledgeBaseTreeItem) => void
}): React.JSX.Element {
  return (
    <div role="treeitem" aria-expanded={item.kind === 'folder' ? true : undefined}>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-sm hover:bg-muted data-[selected=true]:bg-muted"
        data-selected={selectedPath === item.relativePath}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => onSelect(item)}
      >
        {item.kind === 'folder' ? (
          <>
            <CaretRight className="size-3 rotate-90 text-muted-foreground" aria-hidden="true" />
            <Folder className="size-4 text-muted-foreground" aria-hidden="true" />
          </>
        ) : (
          <>
            <span className="w-3" />
            <File className="size-4 text-muted-foreground" aria-hidden="true" />
          </>
        )}
        <span className="truncate">{item.name}</span>
      </button>
      {item.kind === 'folder' && item.children?.length ? (
        <div role="group">
          {item.children.map((child) => (
            <KnowledgeBaseTreeNode
              key={child.relativePath}
              item={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function getSyncStateLabel(state: KnowledgeBaseSyncStatus['syncState']): string {
  if (state === 'syncing') return 'Syncing'
  if (state === 'conflict') return 'Sync conflict'
  if (state === 'error') return 'Sync failed'
  return 'Synced'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
