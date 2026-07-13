import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'

import type { AgentStreamingEvent } from '../../../shared/agent-protocol'
import { useAgentSession } from './use-agent-session'

function Harness({ sessionId }: { sessionId: string }) {
  const session = useAgentSession(sessionId)

  return (
    <div>
      <div role="status">{session.status}</div>
      {session.messages.map((message) =>
        message.parts.map((part, index) =>
          part.type === 'text' ? <p key={`${message.id}-${index}`}>{part.text}</p> : null
        )
      )}
    </div>
  )
}

describe('useAgentSession', () => {
  it('renders streamed text only for the focused session', () => {
    const listeners: Array<(event: AgentStreamingEvent) => void> = []
    window.spacezero.agent.onEvent = (listener) => {
      listeners.push(listener)
      return () => undefined
    }

    render(<Harness sessionId="session-1" />)

    act(() => {
      for (const listener of listeners) {
        listener({ type: 'message_update', sessionId: 'session-2', messageId: 'message-2', delta: 'leaked' })
        listener({ type: 'message_update', sessionId: 'session-1', messageId: 'message-1', delta: 'hello' })
        listener({ type: 'message_update', sessionId: 'session-1', messageId: 'message-1', delta: ' world' })
      }
    })

    expect(screen.getByText('hello world')).toBeInTheDocument()
    expect(screen.queryByText('leaked')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('running')
  })
})
