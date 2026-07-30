import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useToolPaneStore } from '../../tool-pane/renderer'
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

  it('shows /clear and switches transcripts without changing the stable Global Chat tool context', async () => {
    const currentContext = globalChatContext()
    const freshContext: GlobalChatContext = {
      ...currentContext,
      id: 'global-chat-context-2',
      agentSession: {
        ...currentContext.agentSession,
        id: 'global-chat-agent-session-2'
      }
    }
    const clearGlobalChat = vi.fn(async () => freshContext)
    window.spacezero.sessions.getCurrentGlobalChatContext = async () => currentContext
    window.spacezero.sessions.clearGlobalChat = clearGlobalChat
    window.spacezero.agent.getState = vi.fn(async ({ sessionId }) => ({
      sessionId,
      kind: 'workspace' as const,
      projectId: null,
      cwd: '/tmp',
      status: 'idle' as const,
      live: true,
      transcriptPath: `/tmp/${sessionId}.jsonl`,
      modelProvider: undefined,
      modelId: undefined,
      transcriptSnapshot:
        sessionId === currentContext.agentSession.id
          ? [{ role: 'user' as const, timestamp: 1, content: 'Only in the previous Global Chat' }]
          : []
    }))
    useToolPaneStore.setState({
      contexts: {
        'global-chat': { isOpen: true, width: 620, activeToolId: 'terminal' }
      }
    })
    const stableToolState = structuredClone(useToolPaneStore.getState().contexts['global-chat'])

    render(<GlobalChatPage />)

    expect(await screen.findByText('Only in the previous Global Chat')).toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '/cl' } })
    const clearOption = screen.getByRole('option', { name: /\/clear/ })
    expect(clearOption).toHaveAttribute('data-suggestion-kind', 'command')
    expect(clearOption.querySelector('[data-command-icon="true"]')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '/clear' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(clearGlobalChat).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(window.spacezero.agent.getState).toHaveBeenCalledWith({
        sessionId: freshContext.agentSession.id
      })
    )
    expect(screen.queryByText('Only in the previous Global Chat')).not.toBeInTheDocument()
    expect(useToolPaneStore.getState().contexts['global-chat']).toEqual(stableToolState)
  })

  it('shows scoped /resume metadata, selects its transcript, and continues the selected context', async () => {
    const currentContext = globalChatContext()
    const selectedContext: GlobalChatContext = {
      ...currentContext,
      id: 'global-chat-context-selected',
      agentSession: {
        ...currentContext.agentSession,
        id: 'global-chat-agent-session-selected'
      },
      createdAt: '2026-07-19T08:30:00.000Z'
    }
    const listGlobalChatHistory = vi.fn(async () => [
      {
        id: selectedContext.id,
        initialPrompt: 'Inspect persistent Browser and Terminal state.',
        createdAt: selectedContext.createdAt
      }
    ])
    const resumeGlobalChat = vi.fn(async () => selectedContext)
    const prompt = vi.fn(async () => undefined)
    window.spacezero.sessions.getCurrentGlobalChatContext = async () => currentContext
    window.spacezero.sessions.listGlobalChatHistory = listGlobalChatHistory
    window.spacezero.sessions.resumeGlobalChat = resumeGlobalChat
    window.spacezero.agent.getState = vi.fn(async ({ sessionId }) => ({
      sessionId,
      kind: 'workspace' as const,
      projectId: null,
      cwd: '/tmp',
      status: 'idle' as const,
      live: true,
      transcriptPath: `/tmp/${sessionId}.jsonl`,
      modelProvider: undefined,
      modelId: undefined,
      transcriptSnapshot:
        sessionId === selectedContext.agentSession.id
          ? [
              {
                role: 'assistant' as const,
                timestamp: 2,
                content: [{ type: 'text' as const, text: 'Selected Global Chat restored.' }],
                stopReason: 'stop' as const
              }
            ]
          : []
    }))
    window.spacezero.agent.prompt = prompt
    useToolPaneStore.setState({
      contexts: {
        'global-chat': { isOpen: true, width: 680, activeToolId: 'browser' }
      }
    })
    const stableToolState = structuredClone(useToolPaneStore.getState().contexts['global-chat'])

    render(<GlobalChatPage />)

    const input = await screen.findByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '/res' } })
    const resumeOption = screen.getByRole('option', { name: /\/resume/ })
    expect(resumeOption).toHaveAttribute('data-suggestion-kind', 'command')
    expect(resumeOption.querySelector('[data-command-icon="true"]')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '/resume' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const historyRow = await screen.findByRole('option', {
      name: /Inspect persistent Browser and Terminal state/i
    })
    expect(listGlobalChatHistory).toHaveBeenCalledOnce()
    expect(historyRow.querySelector('[data-chat-history-icon="true"]')).toBeInTheDocument()
    expect(historyRow.querySelector('.truncate')).toHaveTextContent(
      'Inspect persistent Browser and Terminal state.'
    )
    expect(historyRow).toHaveTextContent(/Jul.*19.*2026/i)
    fireEvent.click(historyRow)

    await waitFor(() =>
      expect(resumeGlobalChat).toHaveBeenCalledWith({ chatContextId: selectedContext.id })
    )
    expect(await screen.findByText('Selected Global Chat restored.')).toBeInTheDocument()

    const selectedInput = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(selectedInput, { target: { value: 'Continue here.' } })
    fireEvent.keyDown(selectedInput, { key: 'Enter' })

    await waitFor(() =>
      expect(prompt).toHaveBeenCalledWith({
        sessionId: selectedContext.agentSession.id,
        message: 'Continue here.'
      })
    )
    expect(useToolPaneStore.getState().contexts['global-chat']).toEqual(stableToolState)
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
