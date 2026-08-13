import { fireEvent, render, screen } from '@testing-library/react'

import { AgentChatView } from '@renderer/components/agent-chat-view'
import {
  normalTranscriptFixture,
  streamingResponseFixture
} from '@renderer/components/agent-chat-view.fixtures'
import { SessionHostScreen } from './session-host-screen'

describe('SessionHostScreen', () => {
  it('renders a restoring state without mounting chat content', () => {
    render(
      <SessionHostScreen
        label="Project Session"
        state={{ kind: 'loading', message: 'Restoring Project Session chat…' }}
      />
    )

    expect(screen.getByRole('region', { name: 'Project Session' })).toHaveTextContent(
      'Restoring Project Session chat…'
    )
    expect(screen.queryByRole('textbox', { name: 'Agent prompt' })).not.toBeInTheDocument()
  })

  it('renders a retryable error and emits retry intent', () => {
    const handleRetry = vi.fn()

    render(
      <SessionHostScreen
        label="Global Chat"
        state={{
          kind: 'error',
          message: 'Unable to restore the agent Session: runtime unavailable',
          guidance: 'Retry when the agent runtime is available.',
          onRetry: handleRetry
        }}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('runtime unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(handleRetry).toHaveBeenCalledOnce()
  })

  it('hosts ready and running AgentChatView fixture states without Electron runtime access', () => {
    const originalBridge = window.spacezero
    const bridgeAccess = vi.fn(() => {
      throw new Error('pure session screens must not access the Electron bridge')
    })

    Object.defineProperty(window, 'spacezero', {
      configurable: true,
      value: new Proxy({}, { get: bridgeAccess })
    })

    try {
      const { rerender } = render(
        <SessionHostScreen
          label="Project Session"
          state={{
            kind: 'ready',
            content: <AgentChatView {...normalTranscriptFixture} />
          }}
        />
      )

      expect(screen.getByText('Summarize the current project status.')).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Agent prompt' })).toBeEnabled()

      rerender(
        <SessionHostScreen
          label="Project Session"
          state={{
            kind: 'ready',
            content: <AgentChatView {...streamingResponseFixture} />
          }}
        />
      )

      expect(screen.getByText('Review the chat component architecture.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Thinking.*a moment/ })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Agent prompt' })).toBeDisabled()
      expect(bridgeAccess).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'spacezero', {
        configurable: true,
        value: originalBridge
      })
    }
  })
})
