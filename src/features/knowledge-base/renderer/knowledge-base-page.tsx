import { useCallback, useEffect, useState } from 'react'
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
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { KnowledgeBaseDocumentEditor } from './knowledge-base-document-editor'
import type {
  KnowledgeBaseDocument,
  KnowledgeBaseSearchResult,
  KnowledgeBaseStatus,
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

  const refreshTree = useCallback(async (): Promise<void> => {
    setTree(await window.spacezero.knowledgeBase.getTree())
  }, [])

  useEffect(() => {
    let current = true
    window.spacezero.knowledgeBase
      .getTree()
      .then((items) => {
        if (current) setTree(items)
      })
      .catch((treeError: unknown) => {
        if (current) setError(getErrorMessage(treeError, 'Unable to load Knowledge Base files.'))
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [])

  async function openDocument(relativePath: string): Promise<void> {
    setError(null)
    try {
      setDocument(await window.spacezero.knowledgeBase.openDocument({ relativePath }))
    } catch (openError) {
      setError(getErrorMessage(openError, 'Unable to open this file.'))
    }
  }

  async function createItem(kind: 'file' | 'folder'): Promise<void> {
    const relativePath = window.prompt(
      kind === 'file' ? 'New file path' : 'New folder path'
    )?.trim()
    if (!relativePath) return

    setError(null)
    try {
      await window.spacezero.knowledgeBase.createItem({ relativePath, kind })
      await refreshTree()
    } catch (mutationError) {
      setError(getErrorMessage(mutationError, `Unable to create this ${kind}.`))
    }
  }

  async function renameItem(): Promise<void> {
    if (!selectedItem) return
    const newName = window.prompt('New name', selectedItem.name)?.trim()
    if (!newName || newName === selectedItem.name) return

    setError(null)
    try {
      await window.spacezero.knowledgeBase.renameItem({
        relativePath: selectedItem.relativePath,
        newName
      })
      await refreshTree()
    } catch (mutationError) {
      setError(getErrorMessage(mutationError, 'Unable to rename this item.'))
    }
  }

  async function moveItem(): Promise<void> {
    if (!selectedItem) return
    const destinationPath = window
      .prompt('Move to relative path', selectedItem.relativePath)
      ?.trim()
    if (!destinationPath || destinationPath === selectedItem.relativePath) return

    setError(null)
    try {
      await window.spacezero.knowledgeBase.moveItem({
        sourcePath: selectedItem.relativePath,
        destinationPath
      })
      await refreshTree()
    } catch (mutationError) {
      setError(getErrorMessage(mutationError, 'Unable to move this item.'))
    }
  }

  async function deleteItem(): Promise<void> {
    if (!selectedItem) return
    if (
      !window.confirm(
        `Delete ${selectedItem.name} permanently? This cannot be undone.`
      )
    ) {
      return
    }

    setError(null)
    try {
      await window.spacezero.knowledgeBase.deleteItem({
        relativePath: selectedItem.relativePath
      })
      if (document?.relativePath === selectedItem.relativePath) setDocument(null)
      setSelectedItem(null)
      await refreshTree()
    } catch (mutationError) {
      setError(getErrorMessage(mutationError, 'Unable to delete this item.'))
    }
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

      {error ? (
        <Alert variant="destructive" className="m-4 mb-0">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(180px,260px)_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-auto border-r p-3">
          <div className="mb-3 flex flex-wrap items-center gap-1 border-b pb-3">
            <Button variant="outline" size="xs" onClick={() => void createItem('file')}>
              <FilePlus className="size-3.5" aria-hidden="true" />
              New file
            </Button>
            <Button variant="outline" size="xs" onClick={() => void createItem('folder')}>
              <FolderPlus className="size-3.5" aria-hidden="true" />
              New folder
            </Button>
            {selectedItem ? (
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Rename ${selectedItem.name}`}
                  onClick={() => void renameItem()}
                >
                  <PencilSimple className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${selectedItem.name}`}
                  onClick={() => void moveItem()}
                >
                  <SignOut className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete ${selectedItem.name}`}
                  onClick={() => void deleteItem()}
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
                  onSelect={(item) => {
                    setSelectedItem(item)
                    if (item.kind === 'file') void openDocument(item.relativePath)
                  }}
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
              key={`${document.relativePath}:${document.revision}`}
              document={document}
              onDocumentChange={setDocument}
            />
          )}
        </main>
      </div>
    </div>
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
