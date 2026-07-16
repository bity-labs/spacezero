import { useEffect, useState } from 'react'
import { BookOpenText, GitBranch, Plus } from '@phosphor-icons/react'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import type { KnowledgeBaseStatus } from '../shared'

export function KnowledgeBasePage(): React.JSX.Element {
  const [status, setStatus] = useState<KnowledgeBaseStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setCreating] = useState(false)

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

  if (!status && !error) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading Knowledge Base…</div>
  }

  if (status?.setupState === 'configured') {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-8">
        <div className="mx-auto w-full max-w-4xl">
          <div className="flex items-center gap-3">
            <BookOpenText className="size-6 text-muted-foreground" aria-hidden="true" />
            <div>
              <h1 className="text-xl font-semibold">Knowledge Base</h1>
              <p className="mt-1 text-sm text-muted-foreground">{status.rootPath}</p>
            </div>
          </div>
        </div>
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
            <Button variant="outline" disabled>
              Clone from Git repository
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
