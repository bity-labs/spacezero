import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useToolPaneStore } from '../../tool-pane/renderer'
import type { GlobalChatContext } from '../shared'
import { GlobalChatPage } from './global-chat-page'

function globalChatContext(
  id = 'global-chat-context-1',
  agentSessionId = 'global-chat-agent-session-1'
): GlobalChatContext {
  return {
    id,
    workspaceContext: { kind: 'global-chat', key: 'global-chat' },
    agentSession: {
      id: agentSessionId,
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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function installTranscriptProjection(contexts: GlobalChatContext[]): void {
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
    transcriptSnapshot: [
      {
        role: 'assistant' as const,
        timestamp: 2,
        content: [
          {
            type: 'text' as const,
            text: contexts.find((context) => context.agentSession.id === sessionId)?.id ?? sessionId
          }
        ],
        stopReason: 'stop' as const
      }
    ]
  }))
}

async function enterCommand(command: 'clear' | 'resume'): Promise<void> {
  const input = screen.getByRole('textbox', { name: 'Agent prompt' })
  fireEvent.change(input, { target: { value: `/${command}` } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await Promise.resolve()
}

async function selectHistory(label: string): Promise<void> {
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(label, 'i') }))
  await Promise.resolve()
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

  it('renders only the latest resume when resume responses complete in reverse order', async () => {
    const currentContext = globalChatContext()
    const firstContext = globalChatContext(
      'global-chat-context-first',
      'global-chat-agent-session-first'
    )
    const secondContext = globalChatContext(
      'global-chat-context-second',
      'global-chat-agent-session-second'
    )
    const firstResume = deferred<GlobalChatContext>()
    const secondResume = deferred<GlobalChatContext>()
    window.spacezero.sessions.getCurrentGlobalChatContext = async () => currentContext
    window.spacezero.sessions.listGlobalChatHistory = vi.fn(async () => [
      { id: firstContext.id, initialPrompt: 'Resume first', createdAt: firstContext.createdAt },
      { id: secondContext.id, initialPrompt: 'Resume second', createdAt: secondContext.createdAt }
    ])
    window.spacezero.sessions.resumeGlobalChat = vi.fn(({ chatContextId }) =>
      chatContextId === firstContext.id ? firstResume.promise : secondResume.promise
    )
    installTranscriptProjection([currentContext, firstContext, secondContext])

    render(<GlobalChatPage />)
    await screen.findByText(currentContext.id)

    await enterCommand('resume')
    await selectHistory('Resume first')
    await enterCommand('resume')
    await selectHistory('Resume second')

    await act(async () => secondResume.resolve(secondContext))
    expect(await screen.findByText(secondContext.id)).toBeInTheDocument()
    await act(async () => firstResume.resolve(firstContext))

    expect(screen.getByText(secondContext.id)).toBeInTheDocument()
    expect(screen.queryByText(firstContext.id)).not.toBeInTheDocument()
    expect(window.spacezero.agent.getState).toHaveBeenLastCalledWith({
      sessionId: secondContext.agentSession.id
    })
  })

  it('renders a later resume when an earlier clear response completes last', async () => {
    const currentContext = globalChatContext()
    const staleClearContext = globalChatContext(
      'global-chat-context-stale-clear',
      'global-chat-agent-session-stale-clear'
    )
    const selectedContext = globalChatContext(
      'global-chat-context-selected',
      'global-chat-agent-session-selected'
    )
    const clearing = deferred<GlobalChatContext>()
    window.spacezero.sessions.getCurrentGlobalChatContext = async () => currentContext
    window.spacezero.sessions.clearGlobalChat = vi.fn(() => clearing.promise)
    window.spacezero.sessions.listGlobalChatHistory = vi.fn(async () => [
      {
        id: selectedContext.id,
        initialPrompt: 'Resume selected',
        createdAt: selectedContext.createdAt
      }
    ])
    window.spacezero.sessions.resumeGlobalChat = vi.fn(async () => selectedContext)
    installTranscriptProjection([currentContext, staleClearContext, selectedContext])

    render(<GlobalChatPage />)
    await screen.findByText(currentContext.id)

    await enterCommand('clear')
    await waitFor(() => expect(window.spacezero.sessions.clearGlobalChat).toHaveBeenCalledOnce())
    await enterCommand('resume')
    await selectHistory('Resume selected')
    expect(await screen.findByText(selectedContext.id)).toBeInTheDocument()

    await act(async () => clearing.resolve(staleClearContext))

    expect(screen.getByText(selectedContext.id)).toBeInTheDocument()
    expect(screen.queryByText(staleClearContext.id)).not.toBeInTheDocument()
    expect(window.spacezero.agent.getState).toHaveBeenLastCalledWith({
      sessionId: selectedContext.agentSession.id
    })
  })

  it('renders a later clear when an earlier resume response completes last', async () => {
    const currentContext = globalChatContext()
    const staleResumeContext = globalChatContext(
      'global-chat-context-stale-resume',
      'global-chat-agent-session-stale-resume'
    )
    const freshContext = globalChatContext(
      'global-chat-context-fresh',
      'global-chat-agent-session-fresh'
    )
    const resuming = deferred<GlobalChatContext>()
    window.spacezero.sessions.getCurrentGlobalChatContext = async () => currentContext
    window.spacezero.sessions.listGlobalChatHistory = vi.fn(async () => [
      {
        id: staleResumeContext.id,
        initialPrompt: 'Resume stale',
        createdAt: staleResumeContext.createdAt
      }
    ])
    window.spacezero.sessions.resumeGlobalChat = vi.fn(() => resuming.promise)
    window.spacezero.sessions.clearGlobalChat = vi.fn(async () => freshContext)
    installTranscriptProjection([currentContext, staleResumeContext, freshContext])

    render(<GlobalChatPage />)
    await screen.findByText(currentContext.id)

    await enterCommand('resume')
    await selectHistory('Resume stale')
    await enterCommand('clear')
    expect(await screen.findByText(freshContext.id)).toBeInTheDocument()

    await act(async () => resuming.resolve(staleResumeContext))

    expect(screen.getByText(freshContext.id)).toBeInTheDocument()
    expect(screen.queryByText(staleResumeContext.id)).not.toBeInTheDocument()
    expect(window.spacezero.agent.getState).toHaveBeenLastCalledWith({
      sessionId: freshContext.agentSession.id
    })
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
