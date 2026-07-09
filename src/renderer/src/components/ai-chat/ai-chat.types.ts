export type AiChatMessageRole = 'user' | 'assistant'

export type AiChatMessageStatus = 'streaming' | 'complete' | 'error'

export type AiChatThinkingState = 'streaming' | 'complete'

export type AiChatMessage = {
  id: string
  role: AiChatMessageRole
  parts: AiChatMessagePart[]
  status?: AiChatMessageStatus
  createdAt?: string
}

export type AiChatMessagePart = AiChatTextPart | AiChatThinkingPart

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
