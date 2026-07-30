import { useEffect, useState } from 'react'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import type { GlobalChatContext } from '../shared'
import { WorkspaceSessionHostSurface } from './components/session-host-surface'

export function GlobalChatPage(): React.JSX.Element {
  const [chatContext, setChatContext] = useState<GlobalChatContext>()
  const [error, setError] = useState<string>()
  const [requestId, setRequestId] = useState(0)

  useEffect(() => {
    let current = true
    window.spacezero.sessions.getCurrentGlobalChatContext().then(
      (nextContext) => {
        if (current) setChatContext(nextContext)
      },
      (loadError: unknown) => {
        if (current) setError(getErrorMessage(loadError, 'Unable to open Chat.'))
      }
    )
    return () => {
      current = false
    }
  }, [requestId])

  if (error && !chatContext) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-lg gap-4 p-6">
          <Alert variant="destructive">
            <AlertDescription>Unable to open Chat: {error}</AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            Retry when the agent runtime is available. Your current Chat Context is unchanged.
          </p>
          <Button
            className="self-end"
            onClick={() => {
              setError(undefined)
              setRequestId((value) => value + 1)
            }}
          >
            Retry
          </Button>
        </Card>
      </div>
    )
  }

  if (!chatContext) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Opening Chat…
      </div>
    )
  }

  return (
    <WorkspaceSessionHostSurface
      key={chatContext.id}
      session={chatContext.agentSession}
      requireRuntimeReady
      chatLinkContext={{ kind: 'global-chat' }}
    />
  )
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
