import { fireEvent, render, screen, waitFor } from '@testing-library/react'

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
