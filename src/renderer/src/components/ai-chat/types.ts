export type AiChatRole = 'user' | 'assistant'

export type ToolCallState = 'pending' | 'running' | 'success' | 'error'

export type ToolCallViewModel = {
  callId: string
  toolName: string
  state: ToolCallState
  input?: unknown
  output?: unknown
  error?: string
}

export type ToolConfirmationState = 'pending' | 'resolving' | 'approved' | 'denied'

export type ToolConfirmationViewModel = {
  callId: string
  toolName: string
  summary: string
  state?: ToolConfirmationState
}

export type AiChatMessagePart =
  | { id?: string; type: 'text'; text: string }
  | { id?: string; type: 'thinking'; text: string; state?: 'streaming' | 'complete'; collapsed?: boolean }
  | ({ id?: string; type: 'tool-call' } & ToolCallViewModel)
  | ({ id?: string; type: 'tool-confirmation' } & ToolConfirmationViewModel)

export type AiChatMessage = {
  id: string
  role: AiChatRole
  parts: AiChatMessagePart[]
  status?: 'streaming' | 'complete' | 'error'
  createdAt?: string
}

export type AiChatModelOption = {
  id: string
  provider: string
  modelId: string
  label: string
  description?: string
  disabled?: boolean
}

export const thinkingLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

export type ThinkingLevel = (typeof thinkingLevels)[number]
