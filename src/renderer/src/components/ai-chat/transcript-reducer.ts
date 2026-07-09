import type { AiChatMessage } from './types'

export type TranscriptEvent =
  | { type: 'message_start'; id: string; role?: 'assistant'; createdAt?: string }
  | { type: 'text_delta'; messageId?: string; delta: string }
  | { type: 'message_complete'; messageId?: string }
  | { type: 'message_error'; messageId?: string; errorText?: string }

function findActiveAssistantIndex(transcript: AiChatMessage[], messageId?: string): number {
  if (messageId) return transcript.findIndex((message) => message.id === messageId)

  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const message = transcript[index]
    if (message.role === 'assistant' && message.status === 'streaming') return index
  }

  return -1
}

export function applyTranscriptEvent(
  transcript: AiChatMessage[],
  event: TranscriptEvent
): AiChatMessage[] {
  switch (event.type) {
    case 'message_start': {
      const existingIndex = transcript.findIndex((message) => message.id === event.id)
      if (existingIndex >= 0) {
        return transcript.map((message, index) =>
          index === existingIndex ? { ...message, status: 'streaming' } : message
        )
      }

      return [
        ...transcript,
        {
          id: event.id,
          role: event.role ?? 'assistant',
          parts: [{ type: 'text', text: '' }],
          status: 'streaming',
          createdAt: event.createdAt
        }
      ]
    }
    case 'text_delta': {
      const activeIndex = findActiveAssistantIndex(transcript, event.messageId)
      if (activeIndex < 0) return transcript

      return transcript.map((message, index) => {
        if (index !== activeIndex) return message

        const parts = [...message.parts]
        let lastTextIndex = -1
        for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
          if (parts[partIndex].type === 'text') {
            lastTextIndex = partIndex
            break
          }
        }

        if (lastTextIndex >= 0) {
          const textPart = parts[lastTextIndex]
          if (textPart.type === 'text') {
            parts[lastTextIndex] = { ...textPart, text: textPart.text + event.delta }
          }
        } else {
          parts.push({ type: 'text', text: event.delta })
        }

        return { ...message, parts, status: 'streaming' }
      })
    }
    case 'message_complete': {
      const activeIndex = findActiveAssistantIndex(transcript, event.messageId)
      if (activeIndex < 0) return transcript

      return transcript.map((message, index) =>
        index === activeIndex ? { ...message, status: 'complete' } : message
      )
    }
    case 'message_error': {
      const activeIndex = findActiveAssistantIndex(transcript, event.messageId)
      if (activeIndex < 0) return transcript

      return transcript.map((message, index) =>
        index === activeIndex ? { ...message, status: 'error' } : message
      )
    }
    default:
      return transcript
  }
}

export function applyTranscriptEvents(
  transcript: AiChatMessage[],
  events: TranscriptEvent[]
): AiChatMessage[] {
  return events.reduce(applyTranscriptEvent, transcript)
}
