import { useEffect, useRef, useState } from 'react'

import type { GlobalChatContext, GlobalChatHistoryItem } from '../shared'
import { SessionHostScreen } from './components/session-host-screen'
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
      <SessionHostScreen
        label="Global Chat"
        state={{
          kind: 'error',
          message: `Unable to open Chat: ${error}`,
          guidance:
            'Retry when the agent runtime is available. Your current Chat Context is unchanged.',
          onRetry: () => {
            setError(undefined)
            setRequestId((value) => value + 1)
          }
        }}
      />
    )
  }

  if (!chatContext) {
    return (
      <SessionHostScreen
        label="Global Chat"
        state={{ kind: 'loading', message: 'Opening Chat…' }}
      />
    )
  }

  return (
    <SessionHostScreen
      label="Global Chat"
      state={{
        kind: 'ready',
        alert: error ? `${error} Your previous chat is still current.` : undefined,
        content: (
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
        )
      }}
    />
  )
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
