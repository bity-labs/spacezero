import { useEffect, useState } from 'react'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import type { GlobalChatContext, GlobalChatHistoryItem } from '../shared'
import { WorkspaceSessionHostSurface } from './components/session-host-surface'

export function GlobalChatPage(): React.JSX.Element {
  const [chatContext, setChatContext] = useState<GlobalChatContext>()
  const [error, setError] = useState<string>()
  const [requestId, setRequestId] = useState(0)
  const [isClearingChat, setClearingChat] = useState(false)
  const [chatHistory, setChatHistory] = useState<GlobalChatHistoryItem[] | undefined>()

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

  async function openChatHistory(): Promise<void> {
    setError(undefined)
    try {
      setChatHistory(await window.spacezero.sessions.listGlobalChatHistory())
    } catch (historyError) {
      setError(getErrorMessage(historyError, 'Unable to load Chat history.'))
      throw historyError
    }
  }

  async function resumeChatContext(chatContextId: string): Promise<void> {
    setError(undefined)
    try {
      setChatContext(await window.spacezero.sessions.resumeGlobalChat({ chatContextId }))
      setChatHistory(undefined)
    } catch (resumeError) {
      setError(getErrorMessage(resumeError, 'Unable to resume Chat.'))
      throw resumeError
    }
  }

  async function clearChat(): Promise<void> {
    setClearingChat(true)
    setChatHistory(undefined)
    setError(undefined)
    try {
      setChatContext(await window.spacezero.sessions.clearGlobalChat())
    } catch (clearError) {
      setError(getErrorMessage(clearError, 'Unable to clear Chat.'))
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
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <Alert className="m-4 mb-0" variant="destructive">
          <AlertDescription>{error} Your previous chat is still current.</AlertDescription>
        </Alert>
      ) : null}
      <WorkspaceSessionHostSurface
        key={chatContext.id}
        session={chatContext.agentSession}
        requireRuntimeReady
        chatLinkContext={{ kind: 'global-chat' }}
        commands={[
          { name: 'clear', description: 'Start a fresh Global Chat Context.' },
          { name: 'resume', description: 'Continue an older Global Chat Context.' }
        ]}
        historyItems={chatHistory}
        onCommand={(commandName) => {
          if (commandName === 'clear' && !isClearingChat) return clearChat()
          if (commandName === 'resume') return openChatHistory()
          return undefined
        }}
        onHistorySelect={resumeChatContext}
        onHistoryDismiss={() => setChatHistory(undefined)}
      />
    </div>
  )
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
