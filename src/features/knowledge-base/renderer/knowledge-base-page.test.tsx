import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { AgentSessionProjectionEvent } from '../../../shared/agent-session-projection.model'

import {
  createKnowledgeBaseToolPaneConfiguration,
  ToolPaneShell,
  useToolPaneStore,
  type ToolDescriptor
} from '../../tool-pane/renderer'
import type { KnowledgeBaseChatContext, KnowledgeBaseStatus } from '../shared'
import { KnowledgeBasePage } from './knowledge-base-page'

const managedSession = {
  id: 'knowledge-base-session-1',
  kind: 'workspace' as const,
  title: 'Knowledge Base Chat',
  status: 'idle' as const,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

const managedChatContext = {
  id: 'knowledge-base-chat-context-1',
  workspaceContext: { kind: 'knowledge-base' as const, key: 'knowledge-base' as const },
  agentSession: managedSession,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

function knowledgeBaseChatContext(id: string, agentSessionId: string): KnowledgeBaseChatContext {
  return {
    ...managedChatContext,
    id,
    agentSession: { ...managedSession, id: agentSessionId }
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function installTranscriptProjection(contexts: KnowledgeBaseChatContext[]): void {
  window.spacezero.agent.getState = vi.fn(async ({ sessionId }) => ({
    sessionId,
    kind: 'workspace' as const,
    projectId: null,
    cwd: '/home/builder/SpaceZero/knowledge-base',
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

describe('KnowledgeBasePage', () => {
  it('renders the managed Session chat instead of the legacy configured editor', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => managedChatContext

    render(<KnowledgeBasePage />)

    expect(await screen.findByPlaceholderText('Ask about your Knowledge Base…')).toBeInTheDocument()
    expect(
      screen.getByText(/Ask the workspace agent about your Knowledge Base/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('tree', { name: 'Knowledge Base files' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Search Knowledge Base')).not.toBeInTheDocument()
  })

  it('keeps chat primary while showing the Files explorer for a fresh configured context', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => managedChatContext

    const configuration = createKnowledgeBaseToolPaneConfiguration()
    const tools = configuration.tools.map((tool) =>
      tool.id === 'files'
        ? { ...tool, render: () => <section aria-label="Files explorer" /> }
        : tool
    )

    render(
      <ToolPaneShell {...configuration} tools={tools}>
        <KnowledgeBasePage />
      </ToolPaneShell>
    )

    expect(await screen.findByPlaceholderText('Ask about your Knowledge Base…')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Tool Pane' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Files' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByLabelText('Files explorer')).toBeInTheDocument()
  })

  it('routes Knowledge Base chat links to the stable Knowledge Base Browser context', async () => {
    let projectionListener: ((event: AgentSessionProjectionEvent) => void) | undefined
    const createTab = vi.fn(async () => ({
      contextKey: 'knowledge-base',
      activeTabId: 'tab-1',
      tabs: []
    }))
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => managedChatContext
    window.spacezero.agent.onSessionProjectionEvent = (nextListener) => {
      projectionListener = nextListener
      return () => undefined
    }
    window.spacezero.browser.createTab = createTab
    window.spacezero.settings.getChatLinkSettings = async () => ({
      openChatLinksIn: 'space-zero-browser'
    })

    render(<KnowledgeBasePage />)

    await screen.findByPlaceholderText('Ask about your Knowledge Base…')
    await act(async () => {
      projectionListener?.({
        type: 'snapshot',
        sessionId: managedSession.id,
        seq: 1,
        snapshot: {
          status: 'idle',
          messages: [
            {
              role: 'assistant',
              timestamp: 100,
              content: [{ type: 'text', text: 'Open [reference](https://example.com/kb).' }],
              stopReason: 'endTurn'
            }
          ],
          toolConfirmationRequests: []
        }
      })
    })
    fireEvent.click(await screen.findByRole('link', { name: 'reference' }))

    await waitFor(() =>
      expect(createTab).toHaveBeenCalledWith({
        contextKey: 'knowledge-base',
        context: { kind: 'knowledge-base' },
        input: 'https://example.com/kb'
      })
    )
    expect(useToolPaneStore.getState().contexts['knowledge-base']).toMatchObject({
      isOpen: true,
      activeToolId: 'browser'
    })
  })

  it('shows /clear as a command and switches to its fresh Chat Context', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    const replacementSession = { ...managedSession, id: 'knowledge-base-session-2' }
    const replacementContext = {
      ...managedChatContext,
      id: 'knowledge-base-chat-context-2',
      agentSession: replacementSession
    }
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => managedChatContext
    const clearChat = vi.fn(async () => replacementContext)
    window.spacezero.knowledgeBase.clearChat = clearChat
    const getState = vi.fn(async ({ sessionId }: { sessionId: string }) => ({
      sessionId,
      kind: 'workspace' as const,
      projectId: null,
      cwd: '/home/builder/SpaceZero/knowledge-base',
      status: 'idle' as const,
      live: true,
      transcriptPath: `/tmp/${sessionId}.jsonl`,
      modelProvider: undefined,
      modelId: undefined,
      transcriptSnapshot:
        sessionId === managedSession.id
          ? [{ role: 'user' as const, timestamp: 100, content: 'Retained only in the old chat' }]
          : []
    }))
    window.spacezero.agent.getState = getState

    render(<KnowledgeBasePage />)

    expect(await screen.findByText('Retained only in the old chat')).toBeInTheDocument()
    const input = await screen.findByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '/cl' } })
    const clearOption = screen.getByRole('option', { name: /Clear/ })
    expect(clearOption).toHaveAttribute('data-suggestion-kind', 'command')
    expect(clearOption).not.toHaveTextContent('/clear')
    expect(clearOption.querySelector('[data-command-icon="true"]')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '/clear' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(clearChat).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(getState).toHaveBeenCalledWith({ sessionId: replacementSession.id }))
    expect(screen.queryByText('/clear')).not.toBeInTheDocument()
    expect(screen.queryByText('Retained only in the old chat')).not.toBeInTheDocument()
    expect(
      screen.getByText(/Ask the workspace agent about your Knowledge Base/)
    ).toBeInTheDocument()
  })

  it('shows clear progress and accepts rapid duplicate submission exactly once', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    const replacementContext = knowledgeBaseChatContext(
      'knowledge-base-chat-context-2',
      'knowledge-base-session-2'
    )
    const clearing = deferred<KnowledgeBaseChatContext>()
    const clearChat = vi.fn(() => clearing.promise)
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => managedChatContext
    window.spacezero.knowledgeBase.clearChat = clearChat
    installTranscriptProjection([managedChatContext, replacementContext])

    render(<KnowledgeBasePage />)

    const input = await screen.findByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '/clear' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(clearChat).toHaveBeenCalledOnce())
    expect(screen.getByRole('status')).toHaveTextContent('Starting a fresh Knowledge Base Chat…')
    expect(input).toBeEnabled()

    await act(async () => clearing.resolve(replacementContext))
    expect(await screen.findByText(replacementContext.id)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows scoped /resume history, selects its transcript, and continues the selected context', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    const selectedSession = { ...managedSession, id: 'knowledge-base-session-selected' }
    const selectedContext = {
      ...managedChatContext,
      id: 'knowledge-base-chat-context-selected',
      agentSession: selectedSession,
      createdAt: '2026-07-19T08:30:00.000Z'
    }
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => managedChatContext
    const listChatHistory = vi.fn(async () => [
      {
        id: selectedContext.id,
        initialPrompt: 'Explain retained architecture decisions.',
        createdAt: selectedContext.createdAt
      }
    ])
    const resumeChatContext = vi.fn(async () => selectedContext)
    window.spacezero.knowledgeBase.listChatHistory = listChatHistory
    window.spacezero.knowledgeBase.resumeChatContext = resumeChatContext
    window.spacezero.agent.getState = async ({ sessionId }) => ({
      sessionId,
      kind: 'workspace',
      projectId: null,
      cwd: '/home/builder/SpaceZero/knowledge-base',
      status: 'idle',
      live: true,
      transcriptPath: `/tmp/${sessionId}.jsonl`,
      modelProvider: undefined,
      modelId: undefined,
      transcriptSnapshot:
        sessionId === selectedSession.id
          ? [
              {
                role: 'user' as const,
                timestamp: 100,
                content: 'Explain retained architecture decisions.'
              },
              {
                role: 'assistant' as const,
                timestamp: 101,
                content: [{ type: 'text' as const, text: 'The stable context owns tool state.' }],
                stopReason: 'stop' as const
              }
            ]
          : []
    })
    const prompt = vi.fn(async () => undefined)
    window.spacezero.agent.prompt = prompt
    useToolPaneStore.setState({
      contexts: {
        'knowledge-base': { isOpen: true, width: 612, activeToolId: 'files' }
      }
    })

    const configuration = createKnowledgeBaseToolPaneConfiguration()
    render(
      <ToolPaneShell {...configuration}>
        <KnowledgeBasePage />
      </ToolPaneShell>
    )

    const input = await screen.findByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '/res' } })
    const resumeCommand = screen.getByRole('option', { name: /Resume/ })
    expect(resumeCommand).not.toHaveTextContent('/resume')
    expect(resumeCommand.querySelector('[data-command-icon="true"]')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '/resume' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const historyRow = await screen.findByRole('option', {
      name: /Explain retained architecture decisions/i
    })
    expect(listChatHistory).toHaveBeenCalledTimes(1)
    fireEvent.click(historyRow)

    await waitFor(() =>
      expect(resumeChatContext).toHaveBeenCalledWith({ chatContextId: selectedContext.id })
    )
    expect(await screen.findByText('The stable context owns tool state.')).toBeInTheDocument()

    const selectedInput = await screen.findByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(selectedInput, { target: { value: 'Continue this reasoning.' } })
    fireEvent.keyDown(selectedInput, { key: 'Enter' })

    await waitFor(() =>
      expect(prompt).toHaveBeenCalledWith({
        sessionId: selectedSession.id,
        message: 'Continue this reasoning.'
      })
    )
    expect(useToolPaneStore.getState().contexts['knowledge-base']).toMatchObject({
      isOpen: true,
      width: 612,
      activeToolId: 'files'
    })
  })

  it('renders only the latest resume when resume responses complete in reverse order', async () => {
    const currentContext = knowledgeBaseChatContext(
      'knowledge-base-context-current',
      'knowledge-base-session-current'
    )
    const firstContext = knowledgeBaseChatContext(
      'knowledge-base-context-first',
      'knowledge-base-session-first'
    )
    const secondContext = knowledgeBaseChatContext(
      'knowledge-base-context-second',
      'knowledge-base-session-second'
    )
    const firstResume = deferred<KnowledgeBaseChatContext>()
    const secondResume = deferred<KnowledgeBaseChatContext>()
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => currentContext
    window.spacezero.knowledgeBase.listChatHistory = vi.fn(async () => [
      { id: firstContext.id, initialPrompt: 'Resume first', createdAt: firstContext.createdAt },
      { id: secondContext.id, initialPrompt: 'Resume second', createdAt: secondContext.createdAt }
    ])
    window.spacezero.knowledgeBase.resumeChatContext = vi.fn(({ chatContextId }) =>
      chatContextId === firstContext.id ? firstResume.promise : secondResume.promise
    )
    installTranscriptProjection([currentContext, firstContext, secondContext])

    render(<KnowledgeBasePage />)
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

  it('renders a later resume and releases pending clear when an earlier clear response completes last', async () => {
    const currentContext = knowledgeBaseChatContext(
      'knowledge-base-context-current',
      'knowledge-base-session-current'
    )
    const staleClearContext = knowledgeBaseChatContext(
      'knowledge-base-context-stale-clear',
      'knowledge-base-session-stale-clear'
    )
    const selectedContext = knowledgeBaseChatContext(
      'knowledge-base-context-selected',
      'knowledge-base-session-selected'
    )
    const subsequentClearContext = knowledgeBaseChatContext(
      'knowledge-base-context-subsequent-clear',
      'knowledge-base-session-subsequent-clear'
    )
    const clearing = deferred<KnowledgeBaseChatContext>()
    const clearChat = vi
      .fn()
      .mockImplementationOnce(() => clearing.promise)
      .mockResolvedValueOnce(subsequentClearContext)
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => currentContext
    window.spacezero.knowledgeBase.clearChat = clearChat
    window.spacezero.knowledgeBase.listChatHistory = vi.fn(async () => [
      {
        id: selectedContext.id,
        initialPrompt: 'Resume selected',
        createdAt: selectedContext.createdAt
      }
    ])
    window.spacezero.knowledgeBase.resumeChatContext = vi.fn(async () => selectedContext)
    installTranscriptProjection([
      currentContext,
      staleClearContext,
      selectedContext,
      subsequentClearContext
    ])

    render(<KnowledgeBasePage />)
    await screen.findByText(currentContext.id)

    await enterCommand('clear')
    await waitFor(() => expect(clearChat).toHaveBeenCalledOnce())
    await enterCommand('resume')
    await selectHistory('Resume selected')
    expect(await screen.findByText(selectedContext.id)).toBeInTheDocument()

    await act(async () => clearing.resolve(staleClearContext))

    expect(screen.getByText(selectedContext.id)).toBeInTheDocument()
    expect(screen.queryByText(staleClearContext.id)).not.toBeInTheDocument()
    await enterCommand('clear')
    await waitFor(() => expect(clearChat).toHaveBeenCalledTimes(2))
  })

  it('renders a later clear when an earlier resume response completes last', async () => {
    const currentContext = knowledgeBaseChatContext(
      'knowledge-base-context-current',
      'knowledge-base-session-current'
    )
    const staleResumeContext = knowledgeBaseChatContext(
      'knowledge-base-context-stale-resume',
      'knowledge-base-session-stale-resume'
    )
    const freshContext = knowledgeBaseChatContext(
      'knowledge-base-context-fresh',
      'knowledge-base-session-fresh'
    )
    const resuming = deferred<KnowledgeBaseChatContext>()
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => currentContext
    window.spacezero.knowledgeBase.listChatHistory = vi.fn(async () => [
      {
        id: staleResumeContext.id,
        initialPrompt: 'Resume stale',
        createdAt: staleResumeContext.createdAt
      }
    ])
    window.spacezero.knowledgeBase.resumeChatContext = vi.fn(() => resuming.promise)
    window.spacezero.knowledgeBase.clearChat = vi.fn(async () => freshContext)
    installTranscriptProjection([currentContext, staleResumeContext, freshContext])

    render(<KnowledgeBasePage />)
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

  it('preserves Tool Pane and tool-owned state across chat rotation and layout across restart', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    const replacementSession = { ...managedSession, id: 'knowledge-base-session-2' }
    const replacementContext = {
      ...managedChatContext,
      id: 'knowledge-base-chat-context-2',
      agentSession: replacementSession
    }
    let currentContext = managedChatContext
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => currentContext
    window.spacezero.knowledgeBase.clearChat = async () => {
      currentContext = replacementContext
      return replacementContext
    }
    const getState = vi.spyOn(window.spacezero.agent, 'getState')
    useToolPaneStore.setState({
      contexts: {
        'knowledge-base': { isOpen: true, width: 640, activeToolId: 'browser' }
      }
    })

    const tools: readonly ToolDescriptor[] = [
      {
        id: 'browser',
        label: 'Browser',
        available: true,
        icon: () => null,
        render: () => <TestKnowledgeBaseTool />
      }
    ]
    const renderKnowledgeBase = () =>
      render(
        <ToolPaneShell
          contextKey="knowledge-base"
          capabilities={{ kind: 'knowledge-base' }}
          defaultToolId="browser"
          tools={tools}
        >
          <KnowledgeBasePage />
        </ToolPaneShell>
      )

    const firstRender = renderKnowledgeBase()
    const toolDraft = await screen.findByRole('textbox', { name: 'Browser draft' })
    fireEvent.change(toolDraft, { target: { value: 'preserved tool draft' } })

    const input = await screen.findByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '/clear' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(getState).toHaveBeenCalledWith({
        sessionId: replacementSession.id
      })
    )
    expect(screen.getByRole('complementary', { name: 'Tool Pane' })).toHaveStyle({ width: '640px' })
    expect(screen.getByRole('button', { name: 'Browser' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: 'Browser draft' })).toHaveValue(
      'preserved tool draft'
    )

    const persistedLayout = window.localStorage.getItem('spacezero.toolPane')
    expect(persistedLayout).not.toBeNull()
    firstRender.unmount()
    useToolPaneStore.setState({ contexts: {} })
    window.localStorage.setItem('spacezero.toolPane', persistedLayout!)
    await act(async () => {
      await useToolPaneStore.persist.rehydrate()
    })

    renderKnowledgeBase()

    expect(await screen.findByRole('complementary', { name: 'Tool Pane' })).toHaveStyle({
      width: '640px'
    })
    expect(screen.getByRole('button', { name: 'Browser' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the previous chat available and shows an actionable replacement failure', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => managedChatContext
    window.spacezero.knowledgeBase.clearChat = async () => {
      throw new Error('Agent runtime unavailable')
    }

    render(<KnowledgeBasePage />)
    const input = await screen.findByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '/clear' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Agent runtime unavailable Your previous chat is still current.'
    )
    expect(input).toHaveValue('/clear')
  })

  it('keeps unconfigured setup full-page', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({ setupState: 'unconfigured' })

    render(<KnowledgeBasePage />)

    expect(
      await screen.findByRole('heading', { name: 'Set up your Knowledge Base' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create new' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clone from Git repository' })).toBeInTheDocument()
  })

  it('keeps unavailable recovery full-page', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'unavailable',
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      reason: 'missing'
    })

    render(<KnowledgeBasePage />)

    expect(
      await screen.findByRole('heading', { name: 'Knowledge Base unavailable' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset configuration' })).toBeInTheDocument()
  })

  it('shows an actionable error and retries without changing configuration', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    const getCurrentChatContext = vi
      .fn()
      .mockRejectedValueOnce(new Error('Agent runtime unavailable'))
      .mockResolvedValueOnce(managedChatContext)
    window.spacezero.knowledgeBase.getCurrentChatContext = getCurrentChatContext

    render(<KnowledgeBasePage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Agent runtime unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByPlaceholderText('Ask about your Knowledge Base…')).toBeInTheDocument()
    expect(getCurrentChatContext).toHaveBeenCalledTimes(2)
  })

  it('keeps runtime restoration failures retryable without exposing an unusable composer', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => managedChatContext
    const getState = vi
      .fn()
      .mockRejectedValueOnce(new Error('Utility session restore failed'))
      .mockResolvedValueOnce({
        sessionId: managedSession.id,
        kind: 'workspace',
        projectId: null,
        cwd: '/home/builder/SpaceZero/knowledge-base',
        status: 'idle',
        live: true,
        transcriptPath: '/tmp/knowledge-base-session.jsonl'
      })
    window.spacezero.agent.getState = getState

    render(<KnowledgeBasePage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Utility session restore failed')
    expect(screen.queryByRole('textbox', { name: 'Agent prompt' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByPlaceholderText('Ask about your Knowledge Base…')).toBeInTheDocument()
    expect(getState).toHaveBeenCalledTimes(2)
  })

  it('creates a new Knowledge Base and then opens its managed chat', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({ setupState: 'unconfigured' })
    window.spacezero.knowledgeBase.createNew = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => managedChatContext

    render(<KnowledgeBasePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Create new' }))

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Ask about your Knowledge Base…')).toBeInTheDocument()
    )
  })

  it('recovers when clone setup persists configuration before the setup request resolves', async () => {
    const clone = deferred<{ setupState: 'configured'; rootPath: string }>()
    let statusChecks = 0
    window.spacezero.knowledgeBase.getStatus = vi.fn(async (): Promise<KnowledgeBaseStatus> => {
      statusChecks += 1
      return statusChecks === 1
        ? { setupState: 'unconfigured' }
        : { setupState: 'configured', rootPath: '/home/builder/SpaceZero/knowledge-base' }
    })
    window.spacezero.knowledgeBase.cloneFromGit = vi.fn(() => clone.promise)
    window.spacezero.knowledgeBase.getCurrentChatContext = async () => managedChatContext

    render(<KnowledgeBasePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clone from Git repository' }))
    fireEvent.change(screen.getByLabelText('Git repository URL'), {
      target: { value: 'https://github.com/you/knowledge-base.git' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))

    expect(await screen.findByRole('button', { name: 'Cloning…' })).toBeDisabled()
    expect(await screen.findByPlaceholderText('Ask about your Knowledge Base…')).toBeInTheDocument()
  })
})

function TestKnowledgeBaseTool(): React.JSX.Element {
  const [draft, setDraft] = useState('')
  return (
    <label>
      Browser draft
      <input
        aria-label="Browser draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </label>
  )
}
