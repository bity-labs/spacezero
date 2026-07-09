import { applyTranscriptEvent, applyTranscriptEvents } from './transcript-reducer'
import type { AiChatMessage } from './types'

describe('transcript reducer', () => {
  it('starts an assistant message, appends text deltas, and finalizes it', () => {
    const transcript = applyTranscriptEvents([], [
      { type: 'message_start', id: 'assistant-1' },
      { type: 'text_delta', delta: 'Hel' },
      { type: 'text_delta', delta: 'lo' },
      { type: 'message_complete' }
    ])

    expect(transcript).toEqual([
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello' }],
        status: 'complete',
        createdAt: undefined
      }
    ])
  })

  it('appends deltas to the requested active assistant message', () => {
    const transcript: AiChatMessage[] = [
      { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Done' }], status: 'complete' },
      { id: 'assistant-2', role: 'assistant', parts: [{ type: 'thinking', text: 'Plan', state: 'complete' }], status: 'streaming' }
    ]

    expect(applyTranscriptEvent(transcript, { type: 'text_delta', messageId: 'assistant-2', delta: 'Hi' })[1]).toMatchObject({
      parts: [
        { type: 'thinking', text: 'Plan', state: 'complete' },
        { type: 'text', text: 'Hi' }
      ],
      status: 'streaming'
    })
  })
})
