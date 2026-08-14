import { useEffect, useRef, useState } from 'react'

import { KNOWLEDGE_BASE_FILES_CONTEXT_KEY } from '../../files/shared'
import { useFilesStore } from '../../files/renderer/files-store'
import { ManagedChatHostSurface } from '../../sessions/renderer'
import type {
  KnowledgeBaseChatContext,
  KnowledgeBaseChatHistoryItem,
  KnowledgeBaseStatus
} from '../shared'
import { KnowledgeBaseConfiguredScreen } from './knowledge-base-configured-screen'
import { KnowledgeBaseSetupScreen } from './knowledge-base-setup-screen'
import { KnowledgeBaseUnavailableScreen } from './knowledge-base-unavailable-screen'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'

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
  const isSetupInProgress = isCreating || isCloning

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

  useEffect(() => {
    if (!isSetupInProgress) return undefined

    let current = true
    const pollStatus = async (): Promise<void> => {
      try {
        const nextStatus = await window.spacezero.knowledgeBase.getStatus()
        if (!current) return
        if (nextStatus.setupState === 'configured') {
          setStatus(nextStatus)
          setCreating(false)
          setCloning(false)
          setError(null)
        }
      } catch {
        // Keep the setup request as the primary source of errors while it is still running.
      }
    }

    const interval = window.setInterval(() => void pollStatus(), 1000)
    return () => {
      current = false
      window.clearInterval(interval)
    }
  }, [isSetupInProgress])

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
      const recovered = await recoverConfiguredStatus()
      if (!recovered) setError(getErrorMessage(setupError, 'Unable to create the Knowledge Base.'))
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
      const recovered = await recoverConfiguredStatus()
      if (!recovered) setError(getErrorMessage(setupError, 'Unable to clone the Knowledge Base.'))
    } finally {
      setCloning(false)
    }
  }

  async function recoverConfiguredStatus(): Promise<boolean> {
    try {
      const nextStatus = await window.spacezero.knowledgeBase.getStatus()
      if (nextStatus.setupState !== 'configured') return false
      setStatus(nextStatus)
      setError(null)
      return true
    } catch {
      return false
    }
  }

  if (status?.setupState === 'configured') {
    return <ConfiguredKnowledgeBase setupWarning={status.setupWarning} />
  }

  if (status?.setupState === 'unavailable') {
    return (
      <KnowledgeBaseUnavailableScreen
        rootPath={status.rootPath}
        reason={status.reason}
        error={error}
        isRecovering={isRecovering}
        onReconnect={() => void reconnect()}
        onResetConfiguration={() => void resetConfiguration()}
      />
    )
  }

  return (
    <KnowledgeBaseSetupScreen
      loading={!status && !error}
      error={error}
      isCreating={isCreating}
      isCloneFormOpen={isCloneFormOpen}
      isCloning={isCloning}
      gitUrl={gitUrl}
      onCreateNew={() => void createNew()}
      onOpenCloneForm={() => setCloneFormOpen(true)}
      onGitUrlChange={setGitUrl}
      onCancelClone={() => setCloneFormOpen(false)}
      onCloneFromGit={() => void cloneFromGit()}
    />
  )
}

function ConfiguredKnowledgeBase({ setupWarning }: { setupWarning?: string }): React.JSX.Element {
  const [chatContext, setChatContext] = useState<KnowledgeBaseChatContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState(0)
  const [clearingResolution, setClearingResolution] = useState<number>()
  const [chatHistory, setChatHistory] = useState<KnowledgeBaseChatHistoryItem[] | undefined>()
  const chatContextResolution = useRef(0)
  const chatHistoryResolution = useRef(0)
  const clearingResolutionRef = useRef<number | undefined>(undefined)
  const isClearingChat = clearingResolution !== undefined

  useEffect(() => {
    const resolution = ++chatContextResolution.current
    window.spacezero.knowledgeBase.getCurrentChatContext().then(
      (nextChatContext) => {
        if (chatContextResolution.current === resolution) setChatContext(nextChatContext)
      },
      (loadError: unknown) => {
        if (chatContextResolution.current === resolution) {
          setError(getErrorMessage(loadError, 'Unable to open Knowledge Base Chat.'))
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
    setError(null)
    try {
      const history = await window.spacezero.knowledgeBase.listChatHistory()
      if (chatHistoryResolution.current === resolution) setChatHistory(history)
    } catch (historyError) {
      if (chatHistoryResolution.current === resolution) {
        setError(getErrorMessage(historyError, 'Unable to load Knowledge Base Chat history.'))
        throw historyError
      }
    }
  }

  async function resumeChatContext(chatContextId: string): Promise<void> {
    const resolution = ++chatContextResolution.current
    chatHistoryResolution.current += 1
    clearingResolutionRef.current = undefined
    setClearingResolution(undefined)
    setError(null)
    try {
      const nextChatContext = await window.spacezero.knowledgeBase.resumeChatContext({
        chatContextId
      })
      if (chatContextResolution.current !== resolution) return
      setChatContext(nextChatContext)
      setChatHistory(undefined)
      window.dispatchEvent(
        new CustomEvent(KNOWLEDGE_BASE_CHAT_CONTEXT_CHANGED_EVENT, {
          detail: nextChatContext
        })
      )
    } catch (resumeError) {
      if (chatContextResolution.current === resolution) {
        setError(getErrorMessage(resumeError, 'Unable to resume Knowledge Base Chat.'))
        throw resumeError
      }
    }
  }

  async function clearChat(): Promise<void> {
    if (clearingResolutionRef.current !== undefined) return

    const resolution = ++chatContextResolution.current
    clearingResolutionRef.current = resolution
    chatHistoryResolution.current += 1
    setClearingResolution(resolution)
    setChatHistory(undefined)
    setError(null)
    try {
      const nextChatContext = await window.spacezero.knowledgeBase.clearChat()
      if (chatContextResolution.current !== resolution) return
      setChatContext(nextChatContext)
      window.dispatchEvent(
        new CustomEvent(KNOWLEDGE_BASE_CHAT_CONTEXT_CHANGED_EVENT, {
          detail: nextChatContext
        })
      )
    } catch (clearError) {
      if (chatContextResolution.current === resolution) {
        setError(getErrorMessage(clearError, 'Unable to clear Knowledge Base Chat.'))
        throw clearError
      }
    } finally {
      if (clearingResolutionRef.current === resolution) {
        clearingResolutionRef.current = undefined
      }
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
    <KnowledgeBaseConfiguredScreen
      setupWarning={setupWarning}
      error={error}
      isClearingChat={isClearingChat}
    >
      <ManagedChatHostSurface
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
          },
          {
            name: 'resume',
            description: 'Continue an older Knowledge Base Chat Context.'
          }
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
    </KnowledgeBaseConfiguredScreen>
  )
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
