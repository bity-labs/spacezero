import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { KnowledgeBasePage } from './knowledge-base-page'

describe('KnowledgeBasePage', () => {
  it('shows both setup choices while the Knowledge Base is unconfigured', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({ setupState: 'unconfigured' })

    render(<KnowledgeBasePage />)

    expect(await screen.findByRole('heading', { name: 'Set up your Knowledge Base' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create new' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clone from Git repository' })).toBeInTheDocument()
  })

  it('creates a new Knowledge Base and shows its configured path', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({ setupState: 'unconfigured' })
    window.spacezero.knowledgeBase.createNew = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    render(<KnowledgeBasePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Create new' }))

    expect(await screen.findByText('/home/builder/SpaceZero/knowledge-base')).toBeInTheDocument()
  })

  it('clones an existing repository from a user-provided Git URL', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({ setupState: 'unconfigured' })
    const cloneFromGit = vi.fn(async () => ({
      setupState: 'configured' as const,
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    }))
    window.spacezero.knowledgeBase.cloneFromGit = cloneFromGit

    render(<KnowledgeBasePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clone from Git repository' }))
    fireEvent.change(screen.getByLabelText('Git repository URL'), {
      target: { value: 'git@example.com:builder/notes.git' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))

    await waitFor(() =>
      expect(cloneFromGit).toHaveBeenCalledWith({ gitUrl: 'git@example.com:builder/notes.git' })
    )
    expect(await screen.findByText('/home/builder/SpaceZero/knowledge-base')).toBeInTheDocument()
  })

  it('surfaces clone errors and keeps the setup form available', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({ setupState: 'unconfigured' })
    window.spacezero.knowledgeBase.cloneFromGit = async () => {
      throw new Error('Permission denied (publickey)')
    }

    render(<KnowledgeBasePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clone from Git repository' }))
    fireEvent.change(screen.getByLabelText('Git repository URL'), {
      target: { value: 'git@example.com:builder/notes.git' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied (publickey)')
    expect(screen.getByLabelText('Git repository URL')).toBeInTheDocument()
  })

  it('surfaces folder collisions without pretending setup succeeded', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({ setupState: 'unconfigured' })
    window.spacezero.knowledgeBase.createNew = async () => {
      throw new Error('Knowledge Base folder already exists. Move or remove it before setup.')
    }

    render(<KnowledgeBasePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Create new' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Knowledge Base folder already exists. Move or remove it before setup.'
      )
    )
    expect(screen.getByRole('heading', { name: 'Set up your Knowledge Base' })).toBeInTheDocument()
  })
})
