import { useCallback, useEffect, useMemo, useState } from 'react'

import { browserContextKey, type BrowserContext } from '../../../browser/shared'
import { useToolPaneStore } from '../../../tool-pane/renderer'
import { useAgentSession } from '../../../agent-workspace/renderer'
import type { Project } from '../../../projects/shared'
import type { ProjectSession, WorkspaceSession } from '../../shared'
import type { AgentDefinitionReference, AgentSessionState } from '../../../../shared/agent-protocol'
import type { AgentToolExecutionEvent } from '../../../../shared/workspace-tool-protocol'
import {
  type AiChatMessage,
  type AiChatToolCallPart,
  type ChatInputCommand
} from '@renderer/components/ai-chat'
import { AgentChat } from '@renderer/components/agent-chat'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'

type ProjectSessionHostSurfaceProps = {
  project: Project
  session: ProjectSession
}

type WorkspaceSessionHostSurfaceProps = {
  session: WorkspaceSession
  placeholder?: string
  emptyState?: string
  requireRuntimeReady?: boolean
  chatLinkContext?: BrowserContext
  commands?: ChatInputCommand[]
  onCommand?: (commandName: string) => void | Promise<void>
}

export function ProjectSessionHostSurface({
  project,
  session
}: ProjectSessionHostSurfaceProps): React.JSX.Element {
  const agentSession = useAgentSession(session.id)

  return (
    <SessionHostFrame
      sessionId={session.id}
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
    />
  )
}

export function WorkspaceSessionHostSurface({
  session,
  placeholder = 'Ask about Space Zero…',
  emptyState = 'Ask the workspace agent about Space Zero. Streamed replies appear here.',
  requireRuntimeReady = false,
  chatLinkContext = { kind: 'workspace-session', sessionId: session.id },
  commands,
  onCommand
}: WorkspaceSessionHostSurfaceProps): React.JSX.Element {
  const agentSession = useAgentSession(session.id)

  if (requireRuntimeReady && agentSession.runtimeReadiness === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Restoring agent Session…
      </div>
    )
  }

  if (requireRuntimeReady && agentSession.runtimeReadiness === 'error') {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-lg gap-4 p-6">
          <Alert variant="destructive">
            <AlertDescription>
              Unable to restore the agent Session: {agentSession.restoreError}
            </AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            Retry when the agent runtime is available. Chat remains unavailable until the Session is
            restored.
          </p>
          <Button className="self-end" onClick={agentSession.retryRestore}>
            Retry
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <SessionHostFrame
      sessionId={session.id}
      status={agentSession.status}
      messages={agentSession.messages}
      error={agentSession.lastError ?? null}
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
      onCommand={onCommand}
    />
  )
}

type SessionHostFrameProps = {
  sessionId: string
  status: 'idle' | 'running'
  messages: AiChatMessage[]
  error?: string | null
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
  onCommand?: (commandName: string) => void | Promise<void>
}

function SessionHostFrame({
  sessionId,
  status,
  messages,
  error,
  sessionState,
  placeholder,
  onSubmit,
  onAbort,
  onToolConfirmationResolve,
  emptyState,
  chatLinkContext,
  commands,
  onCommand
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
  const openBrowserTool = useToolPaneStore((state) => state.openTool)
  const alertMessage = submissionError ?? (error ? `Agent prompt failed: ${error}` : undefined)
  const openChatLink = useCallback(
    async (url: string) => {
      if (!chatLinkContext || !isHttpChatLink(url)) return

      const settings = await window.spacezero.settings.getChatLinkSettings()
      if (settings.openChatLinksIn === 'default-browser') {
        await window.spacezero.browser.openUrlInDefaultBrowser({ url })
        return
      }

      const contextKey = browserContextKey(chatLinkContext)
      await window.spacezero.browser.createTab({ contextKey, context: chatLinkContext, input: url })
      openBrowserTool(contextKey, 'browser')
    },
    [chatLinkContext, openBrowserTool]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {alertMessage ? (
        <div
          className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          role="alert"
        >
          {alertMessage}
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
        onSubmit={handleSubmit}
        onCommand={onCommand}
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
