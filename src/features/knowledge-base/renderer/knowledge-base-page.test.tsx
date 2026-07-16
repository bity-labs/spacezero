import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { KnowledgeBasePage } from './knowledge-base-page'

vi.mock('./knowledge-base-rich-editor', () => ({
  KnowledgeBaseRichEditor: ({ markdown }: { markdown: string }) => (
    <textarea aria-label="Rich Markdown editor" value={markdown} readOnly />
  )
}))

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
            revision: 'note-revision',
            content: '# Durable note'
          }
        : {
            name: 'diagram.png',
            relativePath,
            contentKind: 'binary',
            size: 1024,
            modifiedAt: new Date(0).toISOString(),
            revision: 'diagram-revision'
          }

    render(<KnowledgeBasePage />)

    expect(await screen.findByRole('tree', { name: 'Knowledge Base files' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'docs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'diagram.png' })).toBeInTheDocument()
    expect(screen.queryByText('.git')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'note.md' }))
    expect(await screen.findByRole('textbox', { name: 'Rich Markdown editor' })).toHaveValue(
      '# Durable note'
    )

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
      revision: 'decision-revision',
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
    expect(await screen.findByRole('textbox', { name: 'Rich Markdown editor' })).toHaveValue(
      '# Architecture decision'
    )
  })

  it('creates, renames, moves, and permanently deletes Knowledge Base items', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    const getTree = vi.fn(async () => [
      {
        name: 'note.md',
        relativePath: 'note.md',
        kind: 'file' as const,
        contentKind: 'markdown' as const,
        size: 10,
        modifiedAt: new Date(0).toISOString()
      }
    ])
    const createItem = vi.fn(async () => undefined)
    const renameItem = vi.fn(async () => undefined)
    const moveItem = vi.fn(async () => undefined)
    const deleteItem = vi.fn(async () => undefined)
    window.spacezero.knowledgeBase.getTree = getTree
    window.spacezero.knowledgeBase.createItem = createItem
    window.spacezero.knowledgeBase.renameItem = renameItem
    window.spacezero.knowledgeBase.moveItem = moveItem
    window.spacezero.knowledgeBase.deleteItem = deleteItem
    const prompt = vi
      .spyOn(window, 'prompt')
      .mockReturnValueOnce('new-note.md')
      .mockReturnValueOnce('new-folder')
      .mockReturnValueOnce('renamed.md')
      .mockReturnValueOnce('archive/renamed.md')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    try {
      render(<KnowledgeBasePage />)
      await screen.findByRole('button', { name: 'note.md' })

      fireEvent.click(screen.getByRole('button', { name: 'New file' }))
      await waitFor(() =>
        expect(createItem).toHaveBeenCalledWith({ relativePath: 'new-note.md', kind: 'file' })
      )
      fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
      await waitFor(() =>
        expect(createItem).toHaveBeenCalledWith({ relativePath: 'new-folder', kind: 'folder' })
      )

      fireEvent.click(screen.getByRole('button', { name: 'note.md' }))
      fireEvent.click(screen.getByRole('button', { name: 'Rename note.md' }))
      await waitFor(() =>
        expect(renameItem).toHaveBeenCalledWith({ relativePath: 'note.md', newName: 'renamed.md' })
      )
      fireEvent.click(screen.getByRole('button', { name: 'Move note.md' }))
      await waitFor(() =>
        expect(moveItem).toHaveBeenCalledWith({
          sourcePath: 'note.md',
          destinationPath: 'archive/renamed.md'
        })
      )
      fireEvent.click(screen.getByRole('button', { name: 'Delete note.md' }))
      await waitFor(() => expect(deleteItem).toHaveBeenCalledWith({ relativePath: 'note.md' }))

      expect(confirm).toHaveBeenCalledWith(
        'Delete note.md permanently? This cannot be undone.'
      )
      expect(getTree.mock.calls.length).toBeGreaterThanOrEqual(5)
    } finally {
      prompt.mockRestore()
      confirm.mockRestore()
    }
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
