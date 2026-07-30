import { useEffect, useRef, useState } from 'react'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import type { GlobalChatContext, GlobalChatHistoryItem } from '../shared'
import { ManagedChatHostSurface } from './components/session-host-surface'

export function GlobalChatPage(): React.JSX.Element {
  const [chatContext, setChatContext] = useState<GlobalChatContext>()
  const [error, setError] = useState<string>()
  const [requestId, setRequestId] = useState(0)
  const [clearingResolution, setClearingResolution] = useState<number>()
  const [chatHistory, setChatHistory] = useState<GlobalChatHistoryItem[] | undefined>()
  const chatContextResolution = useRef(0)
  const chatHistoryResolution = useRef(0)
  const isClearingChat = clearingResolution !== undefined

  useEffect(() => {
    const resolution = ++chatContextResolution.current
    window.spacezero.sessions.getCurrentGlobalChatContext().then(
      (nextContext) => {
        if (chatContextResolution.current === resolution) setChatContext(nextContext)
      },
      (loadError: unknown) => {
        if (chatContextResolution.current === resolution) {
          setError(getErrorMessage(loadError, 'Unable to open Chat.'))
        }
      }
    )
    return () => {
      chatContextResolution.current += 1
      chatHistoryResolution.current += 1
    }
  }, [requestId])

  async function openChatHistory(): Promise<void> {
    const resolution = ++chatHistoryResolution.current
    setError(undefined)
    try {
      const items = await window.spacezero.sessions.listGlobalChatHistory()
      if (chatHistoryResolution.current === resolution) setChatHistory(items)
    } catch (historyError) {
      if (chatHistoryResolution.current === resolution) {
        setError(getErrorMessage(historyError, 'Unable to load Chat history.'))
        throw historyError
      }
    }
  }

  async function resumeChatContext(chatContextId: string): Promise<void> {
    const resolution = ++chatContextResolution.current
    chatHistoryResolution.current += 1
    setClearingResolution(undefined)
    setError(undefined)
    try {
      const nextContext = await window.spacezero.sessions.resumeGlobalChat({ chatContextId })
      if (chatContextResolution.current !== resolution) return
      setChatContext(nextContext)
      setChatHistory(undefined)
    } catch (resumeError) {
      if (chatContextResolution.current === resolution) {
        setError(getErrorMessage(resumeError, 'Unable to resume Chat.'))
        throw resumeError
      }
    }
  }

  async function clearChat(): Promise<void> {
    const resolution = ++chatContextResolution.current
    chatHistoryResolution.current += 1
    setClearingResolution(resolution)
    setChatHistory(undefined)
    setError(undefined)
    try {
      const nextContext = await window.spacezero.sessions.clearGlobalChat()
      if (chatContextResolution.current !== resolution) return
      setChatContext(nextContext)
    } catch (clearError) {
      if (chatContextResolution.current === resolution) {
        setError(getErrorMessage(clearError, 'Unable to clear Chat.'))
        throw clearError
      }
    } finally {
      setClearingResolution((currentResolution) =>
        currentResolution === resolution ? undefined : currentResolution
      )
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
      <ManagedChatHostSurface
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
