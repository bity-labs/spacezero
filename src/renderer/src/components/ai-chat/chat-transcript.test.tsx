import { render, screen } from '@testing-library/react'

import { ChatTranscript } from './chat-transcript'
import type { AiChatMessage } from './types'

describe('ChatTranscript streaming text', () => {
  it('updates the active assistant message in place as text deltas arrive', () => {
    const messages: AiChatMessage[] = [
      { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Say hello' }] },
      { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Hel' }], status: 'streaming' }
    ]

    const { rerender } = render(<ChatTranscript messages={messages} />)
    const userNode = screen.getByTestId('chat-message-user-1')
    const assistantNode = screen.getByTestId('chat-message-assistant-1')

    rerender(
      <ChatTranscript
        messages={[
          messages[0],
          { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }], status: 'streaming' }
        ]}
      />
    )

    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByTestId('chat-message-user-1')).toBe(userNode)
    expect(screen.getByTestId('chat-message-assistant-1')).toBe(assistantNode)
    expect(assistantNode).toHaveAttribute('data-streaming', 'true')
  })
})
