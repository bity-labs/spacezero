import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { GlobalChatContext } from '../shared'
import { GlobalChatPage } from './global-chat-page'

function globalChatContext(): GlobalChatContext {
  return {
    id: 'global-chat-context-1',
    workspaceContext: { kind: 'global-chat', key: 'global-chat' },
    agentSession: {
      id: 'global-chat-agent-session-1',
      kind: 'workspace',
      title: 'Chat',
      status: 'idle',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  }
}

describe('GlobalChatPage', () => {
  it('automatically restores the persisted current Chat Context whenever Chat opens', async () => {
    const getCurrentGlobalChatContext = vi.fn(async () => globalChatContext())
    const getState = vi.spyOn(window.spacezero.agent, 'getState')
    window.spacezero.sessions.getCurrentGlobalChatContext = getCurrentGlobalChatContext

    const firstOpen = render(<GlobalChatPage />)
    expect(await screen.findByPlaceholderText('Ask about Space Zero…')).toBeInTheDocument()
    firstOpen.unmount()

    render(<GlobalChatPage />)
    expect(await screen.findByPlaceholderText('Ask about Space Zero…')).toBeInTheDocument()
    expect(getCurrentGlobalChatContext).toHaveBeenCalledTimes(2)
    await waitFor(() =>
      expect(getState).toHaveBeenLastCalledWith({
        sessionId: 'global-chat-agent-session-1'
      })
    )
  })

  it('shows a retryable error without creating an ordinary Workspace Session', async () => {
    window.spacezero.sessions.getCurrentGlobalChatContext = vi.fn(async () => {
      throw new Error('Agent runtime unavailable')
    })
    const createWorkspaceSession = vi.spyOn(window.spacezero.agent, 'createWorkspaceSession')

    render(<GlobalChatPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Agent runtime unavailable')
    expect(createWorkspaceSession).not.toHaveBeenCalled()
  })
})
