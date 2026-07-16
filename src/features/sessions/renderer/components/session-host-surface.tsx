import { useEffect, useMemo, useState } from 'react'

import { useAgentSession } from '../../../agent-workspace/renderer'
import type { Project } from '../../../projects/shared'
import type { ProjectSession, WorkspaceSession } from '../../shared'
import type { AgentSessionState } from '../../../../shared/agent-protocol'
import type { AgentToolExecutionEvent } from '../../../../shared/workspace-tool-protocol'
import {
  type AiChatMessage,
  type AiChatToolCallPart
} from '@renderer/components/ai-chat'
import { AgentChat } from '@renderer/components/agent-chat'

type ProjectSessionHostSurfaceProps = {
  project: Project
  session: ProjectSession
}

type WorkspaceSessionHostSurfaceProps = {
  session: WorkspaceSession
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
      onSubmit={(text) => void agentSession.prompt(text)}
      onAbort={() => void agentSession.abort()}
      emptyState="Ask the agent to work on this project. Streamed replies appear here."
    />
  )
}

export function WorkspaceSessionHostSurface({
  session
}: WorkspaceSessionHostSurfaceProps): React.JSX.Element {
  const agentSession = useAgentSession(session.id)

  return (
    <SessionHostFrame
      sessionId={session.id}
      status={agentSession.status}
      messages={agentSession.messages}
      error={agentSession.lastError ?? null}
      sessionState={agentSession.sessionState}
      placeholder="Ask about Space Zero…"
      onSubmit={(text) => void agentSession.prompt(text)}
      onAbort={() => void agentSession.abort()}
      emptyState="Ask the workspace agent about Space Zero. Streamed replies appear here."
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
  onSubmit?: (text: string) => void
  onAbort?: () => void
  emptyState?: string
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
  emptyState
}: SessionHostFrameProps): React.JSX.Element {
  const projectedMessages = useToolExecutionMessages(sessionId, messages)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {error ? (
        <div
          className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          role="alert"
        >
          Agent prompt failed: {error}
        </div>
      ) : null}
      <AgentChat
        sessionId={sessionId}
        messages={projectedMessages}
        sessionState={sessionState}
        status={status}
        emptyState={emptyState ? <p className="text-sm text-muted-foreground">{emptyState}</p> : undefined}
        contentClassName="w-full px-6 pb-48 pt-12"
        placeholder={placeholder}
        onSubmit={onSubmit}
        onAbort={onAbort}
      />
    </div>
  )
}

function useToolExecutionMessages(sessionId: string, baseMessages: AiChatMessage[]): AiChatMessage[] {
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
        status: toolCalls.some((toolCall) => toolCall.state === 'running') ? 'streaming' : 'complete',
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

