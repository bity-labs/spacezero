import { useEffect, useMemo, useState } from 'react'

import type { Project } from '../../../projects/shared'
import type { ProjectSession, WorkspaceSession } from '../../shared'
import type { AgentToolExecutionEvent } from '../../../../shared/workspace-tool-protocol'
import {
  ChatInput,
  type AiChatMessage,
  type AiChatThinkingLevel,
  type AiChatToolCallPart
} from '@renderer/components/ai-chat'
import { AgentChat } from '@renderer/components/agent-chat'

const hostModels = [
  { id: 'claude-sonnet-4', label: 'Claude Sonnet 4', provider: 'anthropic' },
  { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' }
]

type ProjectSessionHostSurfaceProps = {
  project: Project
  session: ProjectSession
  thinkingLevel: AiChatThinkingLevel
  onThinkingChange: (level: AiChatThinkingLevel) => void
}

type WorkspaceSessionHostSurfaceProps = {
  session: WorkspaceSession
  thinkingLevel: AiChatThinkingLevel
  onThinkingChange: (level: AiChatThinkingLevel) => void
}

export function ProjectSessionHostSurface({
  project,
  session,
  thinkingLevel,
  onThinkingChange
}: ProjectSessionHostSurfaceProps): React.JSX.Element {
  const messages = useMemo(() => createProjectSessionPlaceholderMessages(project, session), [project, session])

  return (
    <SessionHostFrame
      sessionId={session.id}
      status={session.status === 'running' ? 'running' : 'idle'}
      messages={messages}
      thinkingLevel={thinkingLevel}
      onThinkingChange={onThinkingChange}
      placeholder={`Message ${project.name} / ${session.title}…`}
    />
  )
}

export function WorkspaceSessionHostSurface({
  session,
  thinkingLevel,
  onThinkingChange
}: WorkspaceSessionHostSurfaceProps): React.JSX.Element {
  const messages = useMemo(() => createWorkspaceSessionPlaceholderMessages(session), [session])

  return (
    <SessionHostFrame
      sessionId={session.id}
      status={session.status === 'running' ? 'running' : 'idle'}
      messages={messages}
      thinkingLevel={thinkingLevel}
      onThinkingChange={onThinkingChange}
      placeholder="Ask about Space Zero…"
    />
  )
}

type SessionHostFrameProps = {
  sessionId: string
  status: 'idle' | 'running'
  messages: AiChatMessage[]
  thinkingLevel: AiChatThinkingLevel
  onThinkingChange: (level: AiChatThinkingLevel) => void
  placeholder: string
}

function SessionHostFrame({
  sessionId,
  status,
  messages,
  thinkingLevel,
  onThinkingChange,
  placeholder
}: SessionHostFrameProps): React.JSX.Element {
  const projectedMessages = useToolExecutionMessages(sessionId, messages)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
      <AgentChat
        messages={projectedMessages}
        contentClassName="px-4 py-4"
        composer={
          <ChatInput
            models={hostModels}
            thinkingLevel={thinkingLevel}
            onThinkingChange={onThinkingChange}
            onSubmit={() => undefined}
            placeholder={placeholder}
            status={status === 'running' ? 'streaming' : 'ready'}
          />
        }
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

function createProjectSessionPlaceholderMessages(
  project: Project,
  session: ProjectSession
): AiChatMessage[] {
  return [
    {
      id: `${session.id}-placeholder`,
      role: 'assistant',
      status: session.status === 'running' ? 'streaming' : 'complete',
      parts: [
        {
          type: 'text',
          text: 'Project Session host placeholder. Pi streaming will attach here in a later slice.'
        },
        {
          type: 'thinking',
          text: 'Streaming projection placeholder for the project-bound agent turn.',
          state: session.status === 'running' ? 'streaming' : 'complete',
          collapsed: true
        },
        {
          type: 'tool-call',
          callId: `${session.id}-tool`,
          toolName: 'project.context.preview',
          state: 'success',
          input: { projectId: project.id, cwd: project.path },
          output: { sessionId: session.id }
        },
        {
          type: 'tool-confirmation',
          callId: `${session.id}-confirmation`,
          toolName: 'workspace.tool.confirmation.preview',
          summary: 'Inline confirmation placeholder for future Workspace Tool requests.',
          state: 'pending'
        }
      ]
    }
  ]
}

function createWorkspaceSessionPlaceholderMessages(session: WorkspaceSession): AiChatMessage[] {
  return [
    {
      id: `${session.id}-placeholder`,
      role: 'assistant',
      status: 'complete',
      parts: [
        {
          type: 'text',
          text: 'Workspace Session host for the global Space Zero agent. This surface does not require a project, cwd, or repository path.'
        },
        {
          type: 'thinking',
          text: 'Streaming projection placeholder for a workspace-wide agent turn.',
          state: 'complete',
          collapsed: true
        },
        {
          type: 'tool-call',
          callId: `${session.id}-tool`,
          toolName: 'workspace.getStatus.preview',
          state: 'success',
          output: { scope: 'workspace' }
        },
        {
          type: 'tool-confirmation',
          callId: `${session.id}-confirmation`,
          toolName: 'workspace.tool.confirmation.preview',
          summary: 'Inline confirmation placeholder for future global Workspace Tool requests.',
          state: 'pending'
        }
      ]
    }
  ]
}
