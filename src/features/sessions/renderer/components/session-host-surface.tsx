import type { Project } from '../../../projects/shared'
import { useAgentSession } from '../../../agent-workspace/renderer'
import type { ProjectSession, WorkspaceSession } from '../../shared'
import { ChatInput, type AiChatMessage, type AiChatThinkingLevel } from '@renderer/components/ai-chat'
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
  const agentSession = useAgentSession(session.id)

  return (
    <SessionHostFrame
      status={agentSession.status}
      messages={agentSession.messages}
      thinkingLevel={thinkingLevel}
      onThinkingChange={onThinkingChange}
      placeholder={`Message ${project.name} / ${session.title}…`}
      onSubmit={(text) => void agentSession.prompt(text)}
      emptyState="Ask the agent to work on this project. Streamed replies appear here."
    />
  )
}

export function WorkspaceSessionHostSurface({
  session,
  thinkingLevel,
  onThinkingChange
}: WorkspaceSessionHostSurfaceProps): React.JSX.Element {
  return (
    <SessionHostFrame
      status={session.status === 'running' ? 'running' : 'idle'}
      messages={createWorkspaceSessionPlaceholderMessages(session)}
      thinkingLevel={thinkingLevel}
      onThinkingChange={onThinkingChange}
      placeholder="Ask about Space Zero…"
    />
  )
}

type SessionHostFrameProps = {
  status: 'idle' | 'running'
  messages: AiChatMessage[]
  thinkingLevel: AiChatThinkingLevel
  onThinkingChange: (level: AiChatThinkingLevel) => void
  placeholder: string
  onSubmit?: (text: string) => void
  emptyState?: string
}

function SessionHostFrame({
  status,
  messages,
  thinkingLevel,
  onThinkingChange,
  placeholder,
  onSubmit,
  emptyState
}: SessionHostFrameProps): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
      <AgentChat
        messages={messages}
        emptyState={emptyState ? <p className="text-sm text-muted-foreground">{emptyState}</p> : undefined}
        contentClassName="px-4 py-4"
        composer={
          <ChatInput
            models={hostModels}
            thinkingLevel={thinkingLevel}
            onThinkingChange={onThinkingChange}
            onSubmit={({ text }) => onSubmit?.(text)}
            placeholder={placeholder}
            status={status === 'running' ? 'streaming' : 'ready'}
          />
        }
      />
    </div>
  )
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
