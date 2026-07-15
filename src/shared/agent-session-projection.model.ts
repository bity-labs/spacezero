import type { AgentSessionId, AgentSessionStatus } from './agent-protocol'

export type AgentTextContent = {
  type: 'text'
  text: string
}

export type AgentThinkingContent = {
  type: 'thinking'
  thinking: string
  redacted?: boolean
}

export type AgentImageContent = {
  type: 'image'
  data: string
  mimeType: string
}

export type AgentToolCallContent = {
  type: 'toolCall'
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type AgentAssistantContent = AgentTextContent | AgentThinkingContent | AgentToolCallContent
export type AgentUserContent = AgentTextContent | AgentImageContent
export type AgentToolResultContent = AgentTextContent | AgentImageContent

export type AgentUserMessage = {
  role: 'user'
  content: string | AgentUserContent[]
  timestamp: number
}

export type AgentAssistantMessage = {
  role: 'assistant'
  content: AgentAssistantContent[]
  timestamp: number
  stopReason?: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted'
  errorMessage?: string
}

export type AgentToolResultMessage = {
  role: 'toolResult'
  toolCallId: string
  toolName: string
  content: AgentToolResultContent[]
  isError: boolean
  details?: unknown
  timestamp: number
}

export type AgentUnknownMessage = {
  role: string
  timestamp?: number
  [key: string]: unknown
}

export type AgentTranscriptMessage =
  | AgentUserMessage
  | AgentAssistantMessage
  | AgentToolResultMessage
  | AgentUnknownMessage

export type AgentToolConfirmationRequest = {
  sessionId: AgentSessionId
  callId: string
  toolName: string
  sanitizedSummary?: string
  summary: string
}

export type ResolveAgentToolConfirmationRequest = {
  sessionId: AgentSessionId
  callId: string
  approved: boolean
}

export type AgentThreadSnapshot = {
  status: AgentSessionStatus
  messages: AgentTranscriptMessage[]
  toolConfirmationRequests?: AgentToolConfirmationRequest[]
  lastError?: string
}

export type AgentToolExecutionState = {
  toolCallId: string
  toolName?: string
  args?: unknown
  partialResult?: unknown
  status: 'running' | 'complete' | 'error'
}

export type AgentSessionProjectionEvent =
  | {
      type: 'snapshot'
      sessionId: AgentSessionId
      seq: number
      snapshot: AgentThreadSnapshot
    }
  | {
      type: 'agent_start'
      sessionId: AgentSessionId
      seq: number
    }
  | {
      type: 'agent_end'
      sessionId: AgentSessionId
      seq: number
    }
  | {
      type: 'message_start'
      sessionId: AgentSessionId
      seq: number
      message: AgentTranscriptMessage
    }
  | {
      type: 'message_update'
      sessionId: AgentSessionId
      seq: number
      message: AgentTranscriptMessage
    }
  | {
      type: 'message_end'
      sessionId: AgentSessionId
      seq: number
      message: AgentTranscriptMessage
    }
  | {
      type: 'tool_execution_start'
      sessionId: AgentSessionId
      seq: number
      toolCallId: string
      toolName: string
      args: unknown
    }
  | {
      type: 'tool_execution_update'
      sessionId: AgentSessionId
      seq: number
      toolCallId: string
      toolName?: string
      partialResult: unknown
    }
  | {
      type: 'tool_execution_end'
      sessionId: AgentSessionId
      seq: number
      toolCallId: string
      result: unknown
      isError: boolean
    }
  | {
      type: 'tool_confirmation_request'
      sessionId: AgentSessionId
      seq: number
      request: AgentToolConfirmationRequest
    }
  | {
      type: 'tool_confirmation_resolved'
      sessionId: AgentSessionId
      seq: number
      callId: string
      approved: boolean
    }
  | {
      type: 'error'
      sessionId: AgentSessionId
      seq: number
      error: string
    }
