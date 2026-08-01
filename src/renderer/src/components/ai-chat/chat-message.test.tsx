import { fireEvent, render, screen } from '@testing-library/react'

import type { AiChatMessage } from './ai-chat.types'
import { ChatMessage } from './chat-message'

describe('ChatMessage', () => {
  it('groups thinking and tool calls into one agent activity block', () => {
    const message: AiChatMessage = {
      id: 'message-1',
      role: 'assistant',
      parts: [
        { type: 'thinking', text: 'Checking project files.', state: 'complete', collapsed: true },
        {
          type: 'tool-call',
          callId: 'call-1',
          toolName: 'bash',
          state: 'success',
          input: { command: 'pnpm test' },
          output: 'Tests passed'
        },
        {
          type: 'tool-call',
          callId: 'call-2',
          toolName: 'read',
          state: 'success',
          input: { path: 'src/app.tsx' }
        },
        { type: 'text', text: 'Done.' }
      ]
    }

    render(<ChatMessage message={message} />)

    expect(screen.getByRole('button', { name: /Thought for a moment/i })).toHaveTextContent('3 steps')
    expect(screen.getByText(/2 tools/)).toBeInTheDocument()
    expect(screen.getByText('Done.')).toBeInTheDocument()
    expect(screen.queryByText('Checking project files.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Thought for a moment/i }))

    expect(screen.getByRole('button', { name: /Checking project files/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /bash/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /read/i })).toBeInTheDocument()
  })

  it('keeps pending tool work collapsed without noisy status badges', () => {
    const message: AiChatMessage = {
      id: 'message-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          callId: 'call-1',
          toolName: 'bash',
          state: 'pending',
          input: { command: 'long running command' }
        }
      ]
    }

    render(<ChatMessage message={message} />)

    const activity = screen.getByRole('button', { name: /Thought for a moment/i })
    expect(activity).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^bash$/i })).not.toBeInTheDocument()

    fireEvent.click(activity)

    expect(screen.getByRole('button', { name: /^bash$/i })).toBeInTheDocument()
    expect(screen.queryByText('Pending')).not.toBeInTheDocument()
    expect(screen.queryByText(/long running command/)).not.toBeInTheDocument()
  })
})
