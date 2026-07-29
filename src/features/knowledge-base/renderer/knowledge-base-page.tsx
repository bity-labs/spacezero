import { useEffect, useState } from 'react'
import { BookOpenText, GitBranch, Plus } from '@phosphor-icons/react'

import { KNOWLEDGE_BASE_FILES_CONTEXT_KEY } from '../../files/shared'
import { useFilesStore } from '../../files/renderer/files-store'
import { WorkspaceSessionHostSurface } from '../../sessions/renderer'
import type { KnowledgeBaseChatContext, KnowledgeBaseStatus } from '../shared'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'

type KnowledgeBasePageProps = {
  onConfiguredChange?: (configured: boolean) => void
}

const KNOWLEDGE_BASE_CHAT_CONTEXT_CHANGED_EVENT = 'spacezero:knowledge-base-chat-context-changed'

export function KnowledgeBasePage({
  onConfiguredChange
}: KnowledgeBasePageProps): React.JSX.Element {
  const [status, setStatus] = useState<KnowledgeBaseStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setCreating] = useState(false)
  const [isCloneFormOpen, setCloneFormOpen] = useState(false)
  const [isCloning, setCloning] = useState(false)
  const [isRecovering, setRecovering] = useState(false)
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

  useEffect(() => {
    if (status) onConfiguredChange?.(status.setupState === 'configured')
  }, [onConfiguredChange, status])

  async function reconnect(): Promise<void> {
    setRecovering(true)
    setError(null)
    try {
      setStatus(await window.spacezero.knowledgeBase.getStatus())
    } catch (reconnectError) {
      setError(getErrorMessage(reconnectError, 'Unable to reconnect the Knowledge Base.'))
    } finally {
      setRecovering(false)
    }
  }

  async function resetConfiguration(): Promise<void> {
    setRecovering(true)
    setError(null)
    try {
      setStatus(await window.spacezero.knowledgeBase.reset())
      useFilesStore.getState().clearContext(KNOWLEDGE_BASE_FILES_CONTEXT_KEY)
    } catch (resetError) {
      setError(getErrorMessage(resetError, 'Unable to reset Knowledge Base configuration.'))
    } finally {
      setRecovering(false)
    }
  }

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
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading Knowledge Base…
      </div>
    )
  }

  if (status?.setupState === 'configured') {
    return <ConfiguredKnowledgeBase setupWarning={status.setupWarning} />
  }

  if (status?.setupState === 'unavailable') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
        <Card className="w-full max-w-xl gap-5 p-6">
          <div>
            <BookOpenText className="size-7 text-muted-foreground" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-semibold">Knowledge Base unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {getUnavailableMessage(status.reason)}
            </p>
            <p className="mt-2 break-all text-xs text-muted-foreground">{status.rootPath}</p>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Restore the repository at this path and reconnect, or reset the app configuration.
            Resetting does not delete files.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={isRecovering}
              onClick={() => void resetConfiguration()}
            >
              Reset configuration
            </Button>
            <Button disabled={isRecovering} onClick={() => void reconnect()}>
              {isRecovering ? 'Checking…' : 'Reconnect'}
            </Button>
          </div>
        </Card>
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
              <Button disabled={!gitUrl.trim() || isCloning} onClick={() => void cloneFromGit()}>
                {isCloning ? 'Cloning…' : 'Clone repository'}
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function ConfiguredKnowledgeBase({ setupWarning }: { setupWarning?: string }): React.JSX.Element {
  const [chatContext, setChatContext] = useState<KnowledgeBaseChatContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState(0)
  const [isClearingChat, setClearingChat] = useState(false)

  useEffect(() => {
    let current = true
    window.spacezero.knowledgeBase.getCurrentChatContext().then(
      (nextChatContext) => {
        if (current) setChatContext(nextChatContext)
      },
      (loadError: unknown) => {
        if (current) setError(getErrorMessage(loadError, 'Unable to open Knowledge Base Chat.'))
      }
    )
    return () => {
      current = false
    }
  }, [requestId])

  async function clearChat(): Promise<void> {
    setClearingChat(true)
    setError(null)
    try {
      const nextChatContext = await window.spacezero.knowledgeBase.clearChat()
      setChatContext(nextChatContext)
      window.dispatchEvent(
        new CustomEvent(KNOWLEDGE_BASE_CHAT_CONTEXT_CHANGED_EVENT, {
          detail: nextChatContext
        })
      )
    } catch (clearError) {
      setError(getErrorMessage(clearError, 'Unable to clear Knowledge Base Chat.'))
      throw clearError
    } finally {
      setClearingChat(false)
    }
  }

  if (error && !chatContext) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-lg gap-4 p-6">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            Your Knowledge Base configuration is unchanged. Retry when the agent runtime is
            available.
          </p>
          <Button
            className="self-end"
            onClick={() => {
              setError(null)
              setRequestId((value) => value + 1)
            }}
          >
            Retry
          </Button>
        </Card>
      </div>
    )
  }
  if (!chatContext)
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Opening Knowledge Base Chat…
      </div>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {setupWarning ? (
        <Alert className="m-4 mb-0">
          <AlertDescription>{setupWarning}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert className="m-4 mb-0" variant="destructive">
          <AlertDescription>{error} Your previous chat is still current.</AlertDescription>
        </Alert>
      ) : null}
      <WorkspaceSessionHostSurface
        key={chatContext.id}
        session={chatContext.agentSession}
        requireRuntimeReady
        placeholder="Ask about your Knowledge Base…"
        emptyState="Ask the workspace agent about your Knowledge Base. Streamed replies appear here."
        chatLinkContext={{ kind: 'knowledge-base' }}
        commands={[
          {
            name: 'clear',
            description: 'Start a fresh Knowledge Base Chat Context.'
          }
        ]}
        onCommand={(commandName) => {
          if (commandName === 'clear' && !isClearingChat) return clearChat()
          return undefined
        }}
      />
    </div>
  )
}

function getUnavailableMessage(reason: 'missing' | 'not-git-repository' | 'inaccessible'): string {
  if (reason === 'missing') return 'The configured Knowledge Base repository could not be found.'
  if (reason === 'inaccessible')
    return 'The configured Knowledge Base repository cannot be accessed.'
  return 'The configured Knowledge Base path is no longer a Git repository.'
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
