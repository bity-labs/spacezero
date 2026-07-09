import { render, screen } from '@testing-library/react'

import { ChatMessage } from './chat-message'

describe('ChatMessage', () => {
  it('renders user and assistant messages with distinct styling', () => {
    render(
      <div>
        <ChatMessage message={{ id: 'user-1', role: 'user', content: 'Build the chat UI' }} />
        <ChatMessage message={{ id: 'assistant-1', role: 'assistant', content: 'Working on it.' }} />
      </div>
    )

    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Assistant')).toBeInTheDocument()
    expect(screen.getByText('Build the chat UI')).toBeInTheDocument()
    expect(screen.getByText('Working on it.')).toBeInTheDocument()
    expect(screen.getByTestId('chat-message-user-1')).toHaveAttribute('data-role', 'user')
    expect(screen.getByTestId('chat-message-assistant-1')).toHaveAttribute('data-role', 'assistant')
  })

  it('renders assistant reasoning blocks separately from text', () => {
    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: 'Here is the answer.',
          reasoning: [{ id: 'reasoning-1', content: 'I inspected the relevant components.' }]
        }}
      />
    )

    expect(screen.getByText('Thinking')).toBeInTheDocument()
    expect(screen.getByText('I inspected the relevant components.')).toBeInTheDocument()
    expect(screen.getByText('Here is the answer.')).toBeInTheDocument()
  })
})
