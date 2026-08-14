import { BookOpenText, GitBranch, Plus } from '@phosphor-icons/react'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'

export type KnowledgeBaseSetupScreenProps = {
  loading: boolean
  error: string | null
  isCreating: boolean
  isCloneFormOpen: boolean
  isCloning: boolean
  gitUrl: string
  onCreateNew: () => void
  onOpenCloneForm: () => void
  onGitUrlChange: (gitUrl: string) => void
  onCancelClone: () => void
  onCloneFromGit: () => void
}

export function KnowledgeBaseSetupScreen({
  loading,
  error,
  isCreating,
  isCloneFormOpen,
  isCloning,
  gitUrl,
  onCreateNew,
  onOpenCloneForm,
  onGitUrlChange,
  onCancelClone,
  onCloneFromGit
}: KnowledgeBaseSetupScreenProps): React.JSX.Element {
  if (loading) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
        role="status"
      >
        Loading Knowledge Base…
      </div>
    )
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
                Create knowledge-base under your configured Space Zero Home and initialize it on
                main.
              </p>
            </div>
            <Button disabled={isCreating} onClick={onCreateNew}>
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
            <Button variant="outline" onClick={onOpenCloneForm}>
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
              onChange={(event) => onGitUrlChange(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onCancelClone}>
                Cancel
              </Button>
              <Button disabled={!gitUrl.trim() || isCloning} onClick={onCloneFromGit}>
                {isCloning ? 'Cloning…' : 'Clone repository'}
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
