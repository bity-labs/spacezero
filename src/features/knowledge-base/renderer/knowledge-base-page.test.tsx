import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { AgentSessionProjectionEvent } from '../../../shared/agent-session-projection.model'

import { ToolPaneShell, useToolPaneStore, type ToolDescriptor } from '../../tool-pane/renderer'
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
    const clearOption = screen.getByRole('option', { name: /\/clear/ })
    expect(clearOption).toHaveAttribute('data-suggestion-kind', 'command')
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
