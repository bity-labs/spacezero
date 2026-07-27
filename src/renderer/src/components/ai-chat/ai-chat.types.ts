export type AiChatMessageRole = 'user' | 'assistant'

export type AiChatMessageStatus = 'streaming' | 'complete' | 'error'

export type AiChatThinkingState = 'streaming' | 'complete'

export type AiChatThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type AiChatToolCallState = 'pending' | 'running' | 'success' | 'error'

export type AiChatToolConfirmationState = 'pending' | 'resolving' | 'approved' | 'denied'

export type AiChatSessionStatus = 'idle' | 'running'

export type AiChatMessage = {
  id: string
  role: AiChatMessageRole
  parts: AiChatMessagePart[]
  status?: AiChatMessageStatus
  createdAt?: string
}

export type AiChatMessagePart =
  | AiChatTextPart
  | AiChatThinkingPart
  | AiChatToolCallPart
  | AiChatToolConfirmationPart

export type AiChatTextPart = {
  type: 'text'
  text: string
}

export type AiChatThinkingPart = {
  type: 'thinking'
  text: string
  state?: AiChatThinkingState
  collapsed?: boolean
}

export type AiChatToolCallPart = {
  type: 'tool-call'
  callId: string
  toolName: string
  state: AiChatToolCallState
  input?: unknown
  output?: unknown
  error?: string
  defaultExpanded?: boolean
}

export type AiChatToolConfirmationPart = {
  type: 'tool-confirmation'
  callId: string
  toolName: string
  summary: string
  state?: AiChatToolConfirmationState
}
