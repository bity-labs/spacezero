import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AgentChatView } from './agent-chat-view'

describe('AgentChatView', () => {
  it('renders chat state and emits prompt intent without reading the Electron bridge', async () => {
    const originalBridge = window.spacezero
    const handleSubmit = vi.fn()
    const bridgeAccess = vi.fn(() => {
      throw new Error('pure views must not access the Electron bridge')
    })

    Object.defineProperty(window, 'spacezero', {
      configurable: true,
      value: new Proxy({}, { get: bridgeAccess })
    })

    try {
      render(
        <AgentChatView
          sessionId="storybook-session"
          messages={[
            {
              id: 'welcome',
              role: 'assistant',
              status: 'complete',
              parts: [{ type: 'text', text: 'Ready to help.' }]
            }
          ]}
          models={[{ id: 'anthropic:sonnet', label: 'Claude Sonnet', provider: 'anthropic' }]}
          selectedModelId="anthropic:sonnet"
          thinkingLevel="medium"
          onSubmit={handleSubmit}
          onThinkingChange={vi.fn()}
        />
      )

      expect(screen.getByText('Ready to help.')).toBeInTheDocument()
      fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
        target: { value: 'Inspect the project' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

      await waitFor(() =>
        expect(handleSubmit).toHaveBeenCalledWith('Inspect the project', undefined)
      )
      expect(bridgeAccess).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'spacezero', {
        configurable: true,
        value: originalBridge
      })
    }
  })
})
