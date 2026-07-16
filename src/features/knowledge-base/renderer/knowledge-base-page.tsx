import { useEffect, useState } from 'react'
import {
  BookOpenText,
  CaretRight,
  File,
  Folder,
  GitBranch,
  Plus
} from '@phosphor-icons/react'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import type {
  KnowledgeBaseDocument,
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b px-6 py-4">
        <BookOpenText className="size-6 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Knowledge Base</h1>
          <p className="truncate text-xs text-muted-foreground">{status.rootPath}</p>
        </div>
      </header>

      {error ? (
        <Alert variant="destructive" className="m-4 mb-0">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(180px,260px)_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-auto border-r p-3">
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
                  onOpen={(path) => void openDocument(path)}
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
            <article>
              <div className="mb-4 border-b pb-3">
                <h2 className="font-medium">{document.name}</h2>
                <p className="text-xs text-muted-foreground">{document.relativePath}</p>
              </div>
              <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                {document.content}
              </pre>
            </article>
          )}
        </main>
      </div>
    </div>
  )
}

function KnowledgeBaseTreeNode({
  item,
  depth,
  onOpen
}: {
  item: KnowledgeBaseTreeItem
  depth: number
  onOpen: (relativePath: string) => void
}): React.JSX.Element {
  return (
    <div role="treeitem" aria-expanded={item.kind === 'folder' ? true : undefined}>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-sm hover:bg-muted"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          if (item.kind === 'file') onOpen(item.relativePath)
        }}
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
              onOpen={onOpen}
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
