import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { browserContextKey, type BrowserContext } from '../../../browser/shared'
import { createBrowserSidePaneTab } from '../../../side-pane/renderer'
import { useAgentSession } from '../../../agent-workspace/renderer'
import type { Project } from '../../../projects/shared'
import type {
  ProjectSession,
  ProjectSessionChatContext,
  ProjectSessionChatHistoryItem,
  ManagedChatAgentSession
} from '../../shared'
import type { AgentDefinitionReference, AgentSessionState } from '../../../../shared/agent-protocol'
import type { AgentToolExecutionEvent } from '../../../../shared/workspace-tool-protocol'
import {
  type AiChatMessage,
  type AiChatToolCallPart,
  type ChatInputCommand,
  type ChatInputHistoryItem
} from '@renderer/components/ai-chat'
import { AgentChat } from '@renderer/components/agent-chat'
import { Button } from '@renderer/components/ui/button'
import { SessionHostScreen } from './session-host-screen'

type ProjectSessionHostSurfaceProps = {
  project: Project
  session: ProjectSession
}

type ManagedChatHostSurfaceProps = {
  session: ManagedChatAgentSession
  placeholder?: string
  emptyState?: string
  requireRuntimeReady?: boolean
  chatLinkContext: Extract<BrowserContext, { kind: 'global-chat' | 'knowledge-base' }>
  commands?: ChatInputCommand[]
  historyItems?: ChatInputHistoryItem[]
  onCommand?: (commandName: string) => void | Promise<void>
  onHistorySelect?: (historyItemId: string) => void | Promise<void>
  onHistoryDismiss?: () => void
}

export const PROJECT_SESSION_CHAT_CONTEXT_CHANGED_EVENT =
  'spacezero:project-session-chat-context-changed'

export function ProjectSessionHostSurface({
  project,
  session
}: ProjectSessionHostSurfaceProps): React.JSX.Element {
  const [chatContext, setChatContext] = useState<ProjectSessionChatContext>()
  const [errorState, setErrorState] = useState<{ sessionId: string; message: string }>()
  const [clearingSessionId, setClearingSessionId] = useState<string>()
  const [chatHistoryState, setChatHistoryState] = useState<{
    sessionId: string
    items: ProjectSessionChatHistoryItem[]
  }>()
  const chatContextResolution = useRef(0)
  const chatHistoryResolution = useRef(0)
  const currentChatContext =
    chatContext?.workspaceContext.projectSessionId === session.id ? chatContext : undefined
  const error = errorState?.sessionId === session.id ? errorState.message : null
  const chatHistory =
    chatHistoryState?.sessionId === session.id ? chatHistoryState.items : undefined
  const isClearingChat = clearingSessionId === session.id

  useEffect(() => {
    const resolution = ++chatContextResolution.current
    window.spacezero.sessions.getCurrentProjectChatContext({ sessionId: session.id }).then(
      (nextChatContext) => {
        if (chatContextResolution.current === resolution) setChatContext(nextChatContext)
      },
      (loadError: unknown) => {
        if (chatContextResolution.current === resolution) {
          setErrorState({
            sessionId: session.id,
            message: getErrorMessage(loadError, 'Unable to open Project Session chat.')
          })
        }
      }
    )
    return () => {
      chatContextResolution.current += 1
      chatHistoryResolution.current += 1
    }
  }, [session.id])

  async function openChatHistory(): Promise<void> {
    const resolution = ++chatHistoryResolution.current
    setErrorState(undefined)
    try {
      const items = await window.spacezero.sessions.listProjectChatHistory({
        sessionId: session.id
      })
      if (chatHistoryResolution.current === resolution) {
        setChatHistoryState({ sessionId: session.id, items })
      }
    } catch (historyError) {
      if (chatHistoryResolution.current === resolution) {
        setErrorState({
          sessionId: session.id,
          message: getErrorMessage(historyError, 'Unable to load Project Session chat history.')
        })
      }
      throw historyError
    }
  }

  async function resumeChatContext(chatContextId: string): Promise<void> {
    const resolution = ++chatContextResolution.current
    chatHistoryResolution.current += 1
    setErrorState(undefined)
    try {
      const nextChatContext = await window.spacezero.sessions.resumeProjectChat({
        sessionId: session.id,
        chatContextId
      })
      if (chatContextResolution.current !== resolution) return
      setChatContext(nextChatContext)
      setChatHistoryState(undefined)
      window.dispatchEvent(
        new CustomEvent(PROJECT_SESSION_CHAT_CONTEXT_CHANGED_EVENT, {
          detail: nextChatContext
        })
      )
    } catch (resumeError) {
      if (chatContextResolution.current === resolution) {
        setErrorState({
          sessionId: session.id,
          message: getErrorMessage(resumeError, 'Unable to resume Project Session chat.')
        })
      }
      throw resumeError
    }
  }

  async function clearChat(): Promise<void> {
    const resolution = ++chatContextResolution.current
    chatHistoryResolution.current += 1
    setClearingSessionId(session.id)
    setChatHistoryState(undefined)
    setErrorState(undefined)
    try {
      const nextChatContext = await window.spacezero.sessions.clearProjectChat({
        sessionId: session.id
      })
      if (chatContextResolution.current !== resolution) return
      setChatContext(nextChatContext)
      window.dispatchEvent(
        new CustomEvent(PROJECT_SESSION_CHAT_CONTEXT_CHANGED_EVENT, {
          detail: nextChatContext
        })
      )
    } catch (clearError) {
      if (chatContextResolution.current === resolution) {
        setErrorState({
          sessionId: session.id,
          message: getErrorMessage(clearError, 'Unable to clear Project Session chat.')
        })
      }
      throw clearError
    } finally {
      setClearingSessionId((currentSessionId) =>
        currentSessionId === session.id ? undefined : currentSessionId
      )
    }
  }

  if (!currentChatContext && !error) {
    return (
      <SessionHostScreen
        label="Project Session"
        state={{ kind: 'loading', message: 'Restoring Project Session chat…' }}
      />
    )
  }

  if (!currentChatContext) {
    return (
      <SessionHostScreen
        label="Project Session"
        state={{ kind: 'ready', alert: `${error} Chat remains unavailable.`, content: null }}
      />
    )
  }

  return (
    <SessionHostScreen
      label="Project Session"
      state={{
        kind: 'ready',
        alert: error ? `${error} Your previous chat is still current.` : undefined,
        content: (
          <ProjectSessionChatSurface
            key={currentChatContext.agentSessionId}
            project={project}
            session={session}
            agentSessionId={currentChatContext.agentSessionId}
            isClearingChat={isClearingChat}
            historyItems={chatHistory}
            onClearChat={clearChat}
            onOpenChatHistory={openChatHistory}
            onResumeChatContext={resumeChatContext}
            onDismissChatHistory={() => setChatHistoryState(undefined)}
          />
        )
      }}
    />
  )
}

function ProjectSessionChatSurface({
  project,
  session,
  agentSessionId,
  isClearingChat,
  historyItems,
  onClearChat,
  onOpenChatHistory,
  onResumeChatContext,
  onDismissChatHistory
}: ProjectSessionHostSurfaceProps & {
  agentSessionId: string
  isClearingChat: boolean
  historyItems?: ProjectSessionChatHistoryItem[]
  onClearChat: () => Promise<void>
  onOpenChatHistory: () => Promise<void>
  onResumeChatContext: (chatContextId: string) => Promise<void>
  onDismissChatHistory: () => void
}): React.JSX.Element {
  const agentSession = useAgentSession(agentSessionId)

  return (
    <SessionHostFrame
      sessionId={agentSessionId}
      status={agentSession.status}
      messages={agentSession.messages}
      error={agentSession.lastError ?? null}
      sessionState={agentSession.sessionState}
      placeholder={`Message ${project.name} / ${session.title}…`}
      onSubmit={async (text, options) => {
        if (
          options?.agentDefinition &&
          isFreshAgentSession(agentSession.messages, agentSession.sessionState)
        ) {
          await agentSession.applyDefinitionToFreshSession(options.agentDefinition)
        }
        await agentSession.prompt(text)
      }}
      onAbort={() => void agentSession.abort()}
      onToolConfirmationResolve={(callId, approved) =>
        void agentSession.resolveToolConfirmation(callId, approved)
      }
      emptyState="Ask the agent to work on this project. Streamed replies appear here."
      chatLinkContext={{ kind: 'project-session', projectId: project.id, sessionId: session.id }}
      commands={[
        {
          name: 'clear',
          description: 'Start a fresh Project Session Chat Context.'
        },
        {
          name: 'resume',
          description: 'Continue an older Project Session Chat Context.'
        }
      ]}
      historyItems={historyItems}
      onCommand={(commandName) => {
        if (commandName === 'clear' && !isClearingChat) return onClearChat()
        if (commandName === 'resume') return onOpenChatHistory()
        return undefined
      }}
      onHistorySelect={onResumeChatContext}
      onHistoryDismiss={onDismissChatHistory}
    />
  )
}

export function ManagedChatHostSurface({
  session,
  placeholder = 'Ask about Space Zero…',
  emptyState = 'Ask the workspace agent about Space Zero. Streamed replies appear here.',
  requireRuntimeReady = false,
  chatLinkContext,
  commands,
  historyItems,
  onCommand,
  onHistorySelect,
  onHistoryDismiss
}: ManagedChatHostSurfaceProps): React.JSX.Element {
  const agentSession = useAgentSession(session.id)

  const screenLabel = chatLinkContext.kind === 'global-chat' ? 'Global Chat' : 'Knowledge Base Chat'
  const hasReadySession = agentSession.sessionState !== undefined
  const runtimeRefreshError =
    requireRuntimeReady && hasReadySession && agentSession.runtimeReadiness === 'error'
      ? agentSession.restoreError
      : undefined

  if (requireRuntimeReady && !hasReadySession && agentSession.runtimeReadiness === 'loading') {
    return (
      <SessionHostScreen
        label={screenLabel}
        state={{ kind: 'loading', message: 'Restoring agent Session…' }}
      />
    )
  }

  if (requireRuntimeReady && !hasReadySession && agentSession.runtimeReadiness === 'error') {
    return (
      <SessionHostScreen
        label={screenLabel}
        state={{
          kind: 'error',
          message: `Unable to restore the agent Session: ${agentSession.restoreError}`,
          guidance:
            'Retry when the agent runtime is available. Chat remains unavailable until the Session is restored.',
          onRetry: agentSession.retryRestore
        }}
      />
    )
  }

  return (
    <SessionHostFrame
      sessionId={session.id}
      status={agentSession.status}
      messages={agentSession.messages}
      error={runtimeRefreshError ? null : (agentSession.lastError ?? null)}
      runtimeRefreshError={runtimeRefreshError}
      onRetryRuntimeRefresh={agentSession.retryRestore}
      sessionState={agentSession.sessionState}
      placeholder={placeholder}
      onSubmit={async (text, options) => {
        if (
          options?.agentDefinition &&
          isFreshAgentSession(agentSession.messages, agentSession.sessionState)
        ) {
          await agentSession.applyDefinitionToFreshSession(options.agentDefinition)
        }
        await agentSession.prompt(text)
      }}
      onAbort={() => void agentSession.abort()}
      onToolConfirmationResolve={(callId, approved) =>
        void agentSession.resolveToolConfirmation(callId, approved)
      }
      emptyState={emptyState}
      chatLinkContext={chatLinkContext}
      commands={commands}
      historyItems={historyItems}
      onCommand={onCommand}
      onHistorySelect={onHistorySelect}
      onHistoryDismiss={onHistoryDismiss}
    />
  )
}

type SessionHostFrameProps = {
  sessionId: string
  status: 'idle' | 'running'
  messages: AiChatMessage[]
  error?: string | null
  runtimeRefreshError?: string
  onRetryRuntimeRefresh?: () => void
  sessionState?: AgentSessionState
  placeholder: string
  onSubmit?: (
    text: string,
    options?: { agentDefinition?: AgentDefinitionReference }
  ) => void | Promise<void>
  onAbort?: () => void
  onToolConfirmationResolve?: (callId: string, approved: boolean) => void
  emptyState?: string
  chatLinkContext?: BrowserContext
  commands?: ChatInputCommand[]
  historyItems?: ChatInputHistoryItem[]
  onCommand?: (commandName: string) => void | Promise<void>
  onHistorySelect?: (historyItemId: string) => void | Promise<void>
  onHistoryDismiss?: () => void
}

function SessionHostFrame({
  sessionId,
  status,
  messages,
  error,
  runtimeRefreshError,
  onRetryRuntimeRefresh,
  sessionState,
  placeholder,
  onSubmit,
  onAbort,
  onToolConfirmationResolve,
  emptyState,
  chatLinkContext,
  commands,
  historyItems,
  onCommand,
  onHistorySelect,
  onHistoryDismiss
}: SessionHostFrameProps): React.JSX.Element {
  const projectedMessages = useToolExecutionMessages(sessionId, messages)
  const [submissionError, setSubmissionError] = useState<string | undefined>(undefined)
  const handleSubmit = useCallback(
    async (text: string, options?: { agentDefinition?: AgentDefinitionReference }) => {
      setSubmissionError(undefined)

      try {
        await onSubmit?.(text, options)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setSubmissionError(
          options?.agentDefinition
            ? `Unable to apply Agent Definition: ${message}`
            : `Unable to submit prompt: ${message}`
        )
        throw error
      }
    },
    [onSubmit]
  )
  const alertMessage = runtimeRefreshError
    ? `Unable to refresh the agent Session: ${runtimeRefreshError}. Your previous chat remains available.`
    : (submissionError ?? (error ? `Agent prompt failed: ${error}` : undefined))
  const openChatLink = useCallback(
    async (url: string) => {
      if (!chatLinkContext || !isHttpChatLink(url)) return

      const settings = await window.spacezero.settings.getChatLinkSettings()
      if (settings.openChatLinksIn === 'default-browser') {
        await window.spacezero.browser.openUrlInDefaultBrowser({ url })
        return
      }

      const contextKey = browserContextKey(chatLinkContext)
      await createBrowserSidePaneTab({ contextKey, context: chatLinkContext, input: url })
    },
    [chatLinkContext]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {alertMessage ? (
        <div
          className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          role="alert"
        >
          <span>{alertMessage}</span>
          {runtimeRefreshError && onRetryRuntimeRefresh ? (
            <Button
              className="ml-3"
              size="xs"
              variant="destructive"
              onClick={onRetryRuntimeRefresh}
            >
              Retry refresh
            </Button>
          ) : null}
        </div>
      ) : null}
      <AgentChat
        sessionId={sessionId}
        messages={projectedMessages}
        sessionState={sessionState}
        status={status}
        emptyState={
          emptyState ? <p className="text-sm text-muted-foreground">{emptyState}</p> : undefined
        }
        contentClassName="w-full px-6 pb-48 pt-12"
        placeholder={placeholder}
        commands={commands}
        historyItems={historyItems}
        onSubmit={handleSubmit}
        onCommand={onCommand}
        onHistorySelect={onHistorySelect}
        onHistoryDismiss={onHistoryDismiss}
        onAbort={onAbort}
        onToolConfirmationResolve={onToolConfirmationResolve}
        onOpenLink={openChatLink}
      />
    </div>
  )
}

function isHttpChatLink(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isFreshAgentSession(
  messages: AiChatMessage[],
  sessionState: AgentSessionState | undefined
): boolean {
  return !sessionState?.agentDefinition && messages.length === 0
}

function useToolExecutionMessages(
  sessionId: string,
  baseMessages: AiChatMessage[]
): AiChatMessage[] {
  const [toolExecutionState, setToolExecutionState] = useState<{
    sessionId: string
    toolCalls: AiChatToolCallPart[]
  }>({ sessionId, toolCalls: [] })

  useEffect(() => {
    return window.spacezero.agent.onToolExecution((event) => {
      if (event.sessionId !== sessionId) return

      setToolExecutionState((current) => ({
        sessionId,
        toolCalls: upsertToolCall(current.sessionId === sessionId ? current.toolCalls : [], event)
      }))
    })
  }, [sessionId])

  return useMemo(() => {
    const toolCalls = toolExecutionState.sessionId === sessionId ? toolExecutionState.toolCalls : []
    if (toolCalls.length === 0) return baseMessages

    return [
      ...baseMessages,
      {
        id: `${sessionId}-workspace-tool-executions`,
        role: 'assistant',
        status: toolCalls.some((toolCall) => toolCall.state === 'running')
          ? 'streaming'
          : 'complete',
        parts: toolCalls
      }
    ]
  }, [baseMessages, sessionId, toolExecutionState])
}

function upsertToolCall(
  toolCalls: AiChatToolCallPart[],
  event: AgentToolExecutionEvent
): AiChatToolCallPart[] {
  const nextPart: AiChatToolCallPart = {
    type: 'tool-call',
    callId: event.callId,
    toolName: event.toolName,
    state: event.state,
    input: event.input,
    output: event.output,
    error: event.error
  }
  const existingIndex = toolCalls.findIndex((toolCall) => toolCall.callId === event.callId)

  if (existingIndex === -1) return [...toolCalls, nextPart]

  return toolCalls.map((toolCall, index) =>
    index === existingIndex ? mergeToolCall(toolCall, nextPart) : toolCall
  )
}

function mergeToolCall(current: AiChatToolCallPart, next: AiChatToolCallPart): AiChatToolCallPart {
  return {
    ...current,
    ...next,
    input: next.input ?? current.input,
    output: next.output ?? current.output,
    error: next.error ?? current.error
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
