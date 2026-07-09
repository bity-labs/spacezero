import type { AiChatMessage } from './ai-chat.types'
import { applyTranscriptEvent } from './transcript-reducer'

describe('applyTranscriptEvent', () => {
  it('creates a streaming assistant message from the first text delta', () => {
    const messages = applyTranscriptEvent([], {
      type: 'assistant-text-delta',
      messageId: 'assistant-1',
      delta: 'Hello'
    })

    expect(messages).toEqual([
      {
        id: 'assistant-1',
        role: 'assistant',
        status: 'streaming',
        parts: [{ type: 'text', text: 'Hello' }]
      }
    ])
  })

  it('appends text deltas to the active assistant text part', () => {
    const first = applyTranscriptEvent([], {
      type: 'assistant-text-delta',
      messageId: 'assistant-1',
      delta: 'Hello'
    })

    const second = applyTranscriptEvent(first, {
      type: 'assistant-text-delta',
      messageId: 'assistant-1',
      delta: ' world'
    })

    expect(second[0]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      status: 'streaming',
      parts: [{ type: 'text', text: 'Hello world' }]
    })
  })

  it('finalizes the assistant message when streaming completes', () => {
    const streamingMessages: AiChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        status: 'streaming',
        parts: [{ type: 'text', text: 'Done' }]
      }
    ]

    const messages = applyTranscriptEvent(streamingMessages, {
      type: 'assistant-complete',
      messageId: 'assistant-1'
    })

    expect(messages[0]).toMatchObject({ status: 'complete' })
  })

  it('preserves unchanged message references while streaming', () => {
    const userMessage: AiChatMessage = {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hi' }]
    }
    const assistantMessage: AiChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      status: 'streaming',
      parts: [{ type: 'text', text: 'Hel' }]
    }

    const messages = applyTranscriptEvent([userMessage, assistantMessage], {
      type: 'assistant-text-delta',
      messageId: 'assistant-1',
      delta: 'lo'
    })

    expect(messages[0]).toBe(userMessage)
    expect(messages[1]).not.toBe(assistantMessage)
    expect(messages[1].parts).toEqual([{ type: 'text', text: 'Hello' }])
  })
})
