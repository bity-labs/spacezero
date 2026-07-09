import type { AiChatMessage, AiChatMessagePart } from './ai-chat.types'

export type AiChatTranscriptEvent =
  | AiChatAssistantTextDeltaEvent
  | AiChatAssistantCompleteEvent
  | AiChatAssistantErrorEvent

export type AiChatAssistantTextDeltaEvent = {
  type: 'assistant-text-delta'
  messageId: string
  delta: string
  createdAt?: string
}

export type AiChatAssistantCompleteEvent = {
  type: 'assistant-complete'
  messageId: string
}

export type AiChatAssistantErrorEvent = {
  type: 'assistant-error'
  messageId: string
}

export function applyTranscriptEvent(
  messages: readonly AiChatMessage[],
  event: AiChatTranscriptEvent
): AiChatMessage[] {
  switch (event.type) {
    case 'assistant-text-delta':
      return applyAssistantTextDelta(messages, event)
    case 'assistant-complete':
      return updateAssistantMessageStatus(messages, event.messageId, 'complete')
    case 'assistant-error':
      return updateAssistantMessageStatus(messages, event.messageId, 'error')
  }
}

function applyAssistantTextDelta(
  messages: readonly AiChatMessage[],
  event: AiChatAssistantTextDeltaEvent
): AiChatMessage[] {
  const messageIndex = messages.findIndex((message) => message.id === event.messageId)

  if (messageIndex === -1) {
    return [
      ...messages,
      {
        id: event.messageId,
        role: 'assistant',
        status: 'streaming',
        createdAt: event.createdAt,
        parts: [{ type: 'text', text: event.delta }]
      }
    ]
  }

  const message = messages[messageIndex]

  if (message.role !== 'assistant') {
    return [...messages]
  }

  return messages.map((currentMessage, currentIndex) => {
    if (currentIndex !== messageIndex) {
      return currentMessage
    }

    return {
      ...message,
      status: 'streaming',
      parts: appendTextDelta(message.parts, event.delta)
    }
  })
}

function appendTextDelta(parts: readonly AiChatMessagePart[], delta: string): AiChatMessagePart[] {
  const lastPart = parts.at(-1)

  if (lastPart?.type !== 'text') {
    return [...parts, { type: 'text', text: delta }]
  }

  return parts.map((part, index) => {
    if (index !== parts.length - 1 || part.type !== 'text') {
      return part
    }

    return { ...part, text: `${part.text}${delta}` }
  })
}

function updateAssistantMessageStatus(
  messages: readonly AiChatMessage[],
  messageId: string,
  status: 'complete' | 'error'
): AiChatMessage[] {
  const messageIndex = messages.findIndex((message) => message.id === messageId)

  if (messageIndex === -1) {
    return [...messages]
  }

  return messages.map((message, index) => {
    if (index !== messageIndex || message.role !== 'assistant') {
      return message
    }

    return { ...message, status }
  })
}
