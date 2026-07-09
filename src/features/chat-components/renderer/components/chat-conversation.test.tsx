import { render, screen } from '@testing-library/react'

import { ChatConversation } from './chat-conversation'
import type { ChatMessageData } from './chat-message'

describe('ChatConversation streaming text', () => {
  it('updates the active assistant message in place as text deltas arrive', () => {
    const messages: ChatMessageData[] = [
      { id: 'user-1', role: 'user', content: 'Say hello' },
      { id: 'assistant-1', role: 'assistant', content: 'Hel' }
    ]

    const { rerender } = render(
      <ChatConversation messages={messages} streamingMessageId="assistant-1" isStreaming />
    )
    const userNode = screen.getByTestId('chat-message-user-1')
    const assistantNode = screen.getByTestId('chat-message-assistant-1')

    rerender(
      <ChatConversation
        messages={[
          messages[0],
          { id: 'assistant-1', role: 'assistant', content: 'Hello' }
        ]}
        streamingMessageId="assistant-1"
        isStreaming
      />
    )

    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByTestId('chat-message-user-1')).toBe(userNode)
    expect(screen.getByTestId('chat-message-assistant-1')).toBe(assistantNode)
    expect(assistantNode).toHaveAttribute('data-streaming', 'true')
  })

  it('finalizes the active assistant message when streaming ends', () => {
    render(
      <ChatConversation
        messages={[{ id: 'assistant-1', role: 'assistant', content: 'Done.' }]}
        streamingMessageId="assistant-1"
        isStreaming={false}
      />
    )

    expect(screen.getByTestId('chat-message-assistant-1')).not.toHaveAttribute('data-streaming')
  })
})
