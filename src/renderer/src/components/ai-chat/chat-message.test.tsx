import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { ChatMessage } from './chat-message'

describe('ChatMessage', () => {
  it('renders parts-based user and assistant messages with distinct styling', () => {
    render(
      <div>
        <ChatMessage message={{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Build the chat UI' }] }} />
        <ChatMessage message={{ id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Working on it.' }] }} />
      </div>
    )

    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Assistant')).toBeInTheDocument()
    expect(screen.getByText('Build the chat UI')).toBeInTheDocument()
    expect(screen.getByText('Working on it.')).toBeInTheDocument()
    expect(screen.getByTestId('chat-message-user-1')).toHaveAttribute('data-role', 'user')
    expect(screen.getByTestId('chat-message-assistant-1')).toHaveAttribute('data-role', 'assistant')
  })

  it('renders thinking, tool call, and confirmation parts inline', () => {
    const onResolve = vi.fn()
    render(
      <ChatMessage
        onResolveToolConfirmation={onResolve}
        message={{
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'thinking', text: 'I inspected the relevant components.', state: 'complete', collapsed: false },
            { type: 'tool-call', callId: 'call-1', toolName: 'workspace.getStatus', input: { includeProjects: true }, state: 'success', output: 'Ready' },
            { type: 'tool-confirmation', callId: 'call-2', toolName: 'workspace.openProject', summary: 'Open project' },
            { type: 'text', text: 'Here is the answer.' }
          ]
        }}
      />
    )

    expect(screen.getByText('Thought for a few seconds')).toBeInTheDocument()
    expect(screen.getByText('I inspected the relevant components.')).toBeInTheDocument()
    expect(screen.getByText('workspace.getStatus')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Approval needed')
    fireEvent.click(screen.getByRole('button', { name: 'Approve tool use' }))
    expect(onResolve).toHaveBeenCalledWith('call-2', true)
  })
})
