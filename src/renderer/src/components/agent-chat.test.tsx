import { fireEvent, render } from '@testing-library/react'

import { AgentChat } from './agent-chat'

describe('AgentChat', () => {
  it('aborts a running response when Escape is pressed', () => {
    const handleAbort = vi.fn()

    render(
      <AgentChat
        sessionId="session-1"
        messages={[]}
        status="running"
        onAbort={handleAbort}
      />
    )

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(handleAbort).toHaveBeenCalledOnce()
  })

  it('does not abort idle sessions on Escape', () => {
    const handleAbort = vi.fn()

    render(
      <AgentChat
        sessionId="session-1"
        messages={[]}
        status="idle"
        onAbort={handleAbort}
      />
    )

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(handleAbort).not.toHaveBeenCalled()
  })
})
