import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { AgentSessionProjectionEvent } from '../../../shared/agent-session-projection.model'

import {
  createKnowledgeBaseToolPaneConfiguration,
  ToolPaneShell,
  useToolPaneStore,
  type ToolDescriptor
} from '../../tool-pane/renderer'
import { KnowledgeBasePage } from './knowledge-base-page'

const managedSession = {
  id: 'knowledge-base-session-1',
  kind: 'workspace' as const,
  title: 'Knowledge Base Chat',
  status: 'idle' as const,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

describe('KnowledgeBasePage', () => {
  it('renders the managed Session chat instead of the legacy configured editor', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getCurrentSession = async () => managedSession

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
    window.spacezero.knowledgeBase.getCurrentSession = async () => managedSession

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
    const createTab = vi.fn(async () => ({ contextKey: 'knowledge-base', activeTabId: 'tab-1', tabs: [] }))
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getCurrentSession = async () => managedSession
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

  it('starts a fresh managed chat and shows the replacement Session', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    const replacementSession = { ...managedSession, id: 'knowledge-base-session-2' }
    window.spacezero.knowledgeBase.getCurrentSession = async () => managedSession
    const startNewChat = vi.fn(async () => replacementSession)
    window.spacezero.knowledgeBase.startNewChat = startNewChat
    const getState = vi.spyOn(window.spacezero.agent, 'getState')

    render(<KnowledgeBasePage />)

    fireEvent.click(await screen.findByRole('button', { name: 'New chat' }))

    await waitFor(() => expect(startNewChat).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(getState).toHaveBeenCalledWith({ sessionId: replacementSession.id })
    )
  })

  it('preserves Tool Pane and tool-owned state across chat rotation and layout across restart', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    const replacementSession = { ...managedSession, id: 'knowledge-base-session-2' }
    let currentSession = managedSession
    window.spacezero.knowledgeBase.getCurrentSession = async () => currentSession
    window.spacezero.knowledgeBase.startNewChat = async () => {
      currentSession = replacementSession
      return replacementSession
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

    fireEvent.click(await screen.findByRole('button', { name: 'New chat' }))

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
    window.spacezero.knowledgeBase.getCurrentSession = async () => managedSession
    window.spacezero.knowledgeBase.startNewChat = async () => {
      throw new Error('Agent runtime unavailable')
    }

    render(<KnowledgeBasePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'New chat' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Agent runtime unavailable Your previous chat is still current.'
    )
    expect(screen.getByPlaceholderText('Ask about your Knowledge Base…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeEnabled()
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
    const getCurrentSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('Agent runtime unavailable'))
      .mockResolvedValueOnce(managedSession)
    window.spacezero.knowledgeBase.getCurrentSession = getCurrentSession

    render(<KnowledgeBasePage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Agent runtime unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByPlaceholderText('Ask about your Knowledge Base…')).toBeInTheDocument()
    expect(getCurrentSession).toHaveBeenCalledTimes(2)
  })

  it('keeps runtime restoration failures retryable without exposing an unusable composer', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getCurrentSession = async () => managedSession
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
    window.spacezero.knowledgeBase.getCurrentSession = async () => managedSession

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
