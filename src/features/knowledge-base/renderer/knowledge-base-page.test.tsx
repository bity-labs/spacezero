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

  it('browses folders and opens text and unsupported files', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getTree = async () => [
      {
        name: 'docs',
        relativePath: 'docs',
        kind: 'folder',
        contentKind: 'folder',
        children: [
          {
            name: 'note.md',
            relativePath: 'docs/note.md',
            kind: 'file',
            contentKind: 'markdown',
            size: 15,
            modifiedAt: new Date(0).toISOString()
          }
        ]
      },
      {
        name: 'diagram.png',
        relativePath: 'diagram.png',
        kind: 'file',
        contentKind: 'binary',
        size: 1024,
        modifiedAt: new Date(0).toISOString()
      }
    ]
    window.spacezero.knowledgeBase.openDocument = async ({ relativePath }) =>
      relativePath.endsWith('.md')
        ? {
            name: 'note.md',
            relativePath,
            contentKind: 'markdown',
            size: 15,
            modifiedAt: new Date(0).toISOString(),
            content: '# Durable note'
          }
        : {
            name: 'diagram.png',
            relativePath,
            contentKind: 'binary',
            size: 1024,
            modifiedAt: new Date(0).toISOString()
          }

    render(<KnowledgeBasePage />)

    expect(await screen.findByRole('tree', { name: 'Knowledge Base files' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'docs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'diagram.png' })).toBeInTheDocument()
    expect(screen.queryByText('.git')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'note.md' }))
    expect(await screen.findByText('# Durable note')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'diagram.png' }))
    expect(await screen.findByText('Preview unavailable')).toBeInTheDocument()
    expect(screen.getByText('1 KB')).toBeInTheDocument()
  })

  it('searches filenames and content and opens a result', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getTree = async () => []
    window.spacezero.knowledgeBase.search = vi.fn(async () => [
      {
        name: 'decision.md',
        relativePath: 'architecture/decision.md',
        matchType: 'content' as const,
        snippet: 'The durable architecture decision uses typed IPC.'
      }
    ])
    window.spacezero.knowledgeBase.openDocument = async ({ relativePath }) => ({
      name: 'decision.md',
      relativePath,
      contentKind: 'markdown',
      size: 49,
      modifiedAt: new Date(0).toISOString(),
      content: '# Architecture decision'
    })

    render(<KnowledgeBasePage />)
    fireEvent.change(await screen.findByLabelText('Search Knowledge Base'), {
      target: { value: 'durable' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('architecture/decision.md')).toBeInTheDocument()
    expect(screen.getByText(/durable architecture decision/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /architecture\/decision.md/ }))
    expect(await screen.findByText('# Architecture decision')).toBeInTheDocument()
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
