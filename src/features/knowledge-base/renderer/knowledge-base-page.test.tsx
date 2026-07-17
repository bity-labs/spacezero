import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { KnowledgeBaseSaveResult } from '../shared'

import { KnowledgeBasePage } from './knowledge-base-page'

vi.mock('./knowledge-base-rich-editor', () => ({
  KnowledgeBaseRichEditor: ({ markdown }: { markdown: string }) => (
    <textarea aria-label="Rich Markdown editor" value={markdown} readOnly />
  )
}))

describe('KnowledgeBasePage', () => {
  afterEach(() => vi.useRealTimers())

  it('shows both setup choices while the Knowledge Base is unconfigured', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({ setupState: 'unconfigured' })

    render(<KnowledgeBasePage />)

    expect(await screen.findByRole('heading', { name: 'Set up your Knowledge Base' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create new' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clone from Git repository' })).toBeInTheDocument()
  })

  it('reconnects a persisted Knowledge Base after its Git repository is restored', async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({
        setupState: 'unavailable' as const,
        rootPath: '/home/builder/SpaceZero/knowledge-base',
        reason: 'missing' as const
      })
      .mockResolvedValueOnce({
        setupState: 'configured' as const,
        rootPath: '/home/builder/SpaceZero/knowledge-base'
      })
    window.spacezero.knowledgeBase.getStatus = getStatus
    window.spacezero.knowledgeBase.getTree = async () => []

    render(<KnowledgeBasePage />)

    expect(
      await screen.findByRole('heading', { name: 'Knowledge Base unavailable' })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))

    expect(await screen.findByText('Local only')).toBeInTheDocument()
    expect(getStatus).toHaveBeenCalledTimes(2)
  })

  it('resets unavailable configuration without deleting user content', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'unavailable',
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      reason: 'not-git-repository'
    })
    const reset = vi.fn(async () => ({ setupState: 'unconfigured' as const }))
    window.spacezero.knowledgeBase.reset = reset

    render(<KnowledgeBasePage />)

    expect(await screen.findByText(/no longer a Git repository/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset configuration' }))

    expect(
      await screen.findByRole('heading', { name: 'Set up your Knowledge Base' })
    ).toBeInTheDocument()
    expect(reset).toHaveBeenCalledTimes(1)
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

  it('shows a separate warning when setup succeeds but project backfill does not', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({ setupState: 'unconfigured' })
    window.spacezero.knowledgeBase.createNew = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      setupWarning: 'Knowledge Base was configured, but existing projects could not be linked.'
    })

    render(<KnowledgeBasePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Create new' }))

    expect(await screen.findByText('/home/builder/SpaceZero/knowledge-base')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Knowledge Base was configured, but existing projects could not be linked.'
    )
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

  it('shows local-only status and configures an origin remote', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getTree = async () => []
    window.spacezero.knowledgeBase.getSyncStatus = async () => ({
      remoteState: 'local-only',
      syncState: 'idle'
    })
    const addRemote = vi.fn(async () => ({
      remoteState: 'configured' as const,
      remoteUrl: 'git@example.com:builder/notes.git',
      syncState: 'idle' as const
    }))
    window.spacezero.knowledgeBase.addRemote = addRemote

    render(<KnowledgeBasePage />)

    expect(await screen.findByText('Local only')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add remote' }))
    fireEvent.change(screen.getByLabelText('Origin Git URL'), {
      target: { value: 'git@example.com:builder/notes.git' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save remote' }))

    await waitFor(() =>
      expect(addRemote).toHaveBeenCalledWith({
        gitUrl: 'git@example.com:builder/notes.git'
      })
    )
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeInTheDocument()
  })

  it('manually syncs a remote Knowledge Base and shows its last sync time', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getTree = async () => []
    window.spacezero.knowledgeBase.getSyncStatus = async () => ({
      remoteState: 'configured',
      remoteUrl: 'https://example.com/notes.git',
      syncState: 'idle'
    })
    const lastSyncAt = '2026-07-16T14:05:00.000Z'
    const syncNow = vi.fn(async () => ({
      remoteState: 'configured' as const,
      remoteUrl: 'https://example.com/notes.git',
      syncState: 'idle' as const,
      lastSyncAt
    }))
    window.spacezero.knowledgeBase.syncNow = syncNow

    render(<KnowledgeBasePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }))

    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1))
    expect(
      screen.getByText(`Last synced ${new Date(lastSyncAt).toLocaleString()}`)
    ).toBeInTheDocument()
  })

  it('flushes and awaits a dirty document before manual sync', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getTree = async () => [
      {
        name: 'note.md',
        relativePath: 'note.md',
        kind: 'file',
        contentKind: 'markdown',
        size: 6,
        modifiedAt: new Date(0).toISOString()
      }
    ]
    window.spacezero.knowledgeBase.openDocument = async () => ({
      name: 'note.md',
      relativePath: 'note.md',
      contentKind: 'markdown',
      size: 6,
      modifiedAt: new Date(0).toISOString(),
      revision: 'note-revision',
      content: '# Note'
    })
    window.spacezero.knowledgeBase.getSyncStatus = async () => ({
      remoteState: 'configured',
      remoteUrl: 'https://example.com/notes.git',
      syncState: 'idle'
    })
    let resolveSave: ((result: KnowledgeBaseSaveResult) => void) | undefined
    const saveDocument = vi.fn(
      () =>
        new Promise<KnowledgeBaseSaveResult>((resolve) => {
          resolveSave = resolve
        })
    )
    const syncNow = vi.fn(async () => ({
      remoteState: 'configured' as const,
      remoteUrl: 'https://example.com/notes.git',
      syncState: 'idle' as const,
      lastSyncAt: new Date(1).toISOString()
    }))
    window.spacezero.knowledgeBase.saveDocument = saveDocument
    window.spacezero.knowledgeBase.syncNow = syncNow

    render(<KnowledgeBasePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'note.md' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Source' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit note.md' }), {
      target: { value: '# Include this edit' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))

    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1))
    expect(syncNow).not.toHaveBeenCalled()

    await act(async () =>
      resolveSave?.({
        status: 'saved',
        document: {
          name: 'note.md',
          relativePath: 'note.md',
          contentKind: 'markdown',
          size: 19,
          modifiedAt: new Date(1).toISOString(),
          revision: 'saved-revision',
          content: '# Include this edit'
        }
      })
    )

    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1))
  })

  it('refreshes the visible tree when a background sync completes', async () => {
    vi.useFakeTimers()
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    const getTree = vi
      .fn()
      .mockResolvedValueOnce([
        {
          name: 'existing.md',
          relativePath: 'existing.md',
          kind: 'file' as const,
          contentKind: 'markdown' as const,
          size: 10,
          modifiedAt: new Date(0).toISOString()
        }
      ])
      .mockResolvedValue([
        {
          name: 'pulled.md',
          relativePath: 'pulled.md',
          kind: 'file' as const,
          contentKind: 'markdown' as const,
          size: 10,
          modifiedAt: new Date(1).toISOString()
        }
      ])
    let statusCall = 0
    window.spacezero.knowledgeBase.getTree = getTree
    window.spacezero.knowledgeBase.getSyncStatus = async () => {
      statusCall += 1
      return {
        remoteState: 'configured',
        remoteUrl: 'https://example.com/notes.git',
        syncState: 'idle',
        ...(statusCall > 1 ? { lastSyncAt: '2026-07-16T14:06:00.000Z' } : {})
      }
    }

    render(<KnowledgeBasePage />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: 'existing.md' })).toBeInTheDocument()

    await act(async () => vi.advanceTimersByTimeAsync(30_000))

    expect(getTree).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'pulled.md' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'existing.md' })).not.toBeInTheDocument()
  })

  it('warns about sync conflicts and offers retry and recovery actions', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getTree = async () => []
    window.spacezero.knowledgeBase.getSyncStatus = async () => ({
      remoteState: 'configured',
      remoteUrl: 'git@github.com:builder/notes.git',
      syncState: 'conflict',
      lastSyncError: 'CONFLICT in decision.md'
    })
    window.spacezero.knowledgeBase.syncNow = vi.fn(async () => ({
      remoteState: 'configured' as const,
      remoteUrl: 'git@github.com:builder/notes.git',
      syncState: 'idle' as const
    }))
    const openFolder = vi.fn(async () => undefined)
    const openRemote = vi.fn(async () => undefined)
    window.spacezero.knowledgeBase.openFolder = openFolder
    window.spacezero.knowledgeBase.openRemote = openRemote

    render(<KnowledgeBasePage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('CONFLICT in decision.md')
    fireEvent.click(screen.getByRole('button', { name: 'Retry sync' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open remote' }))

    await waitFor(() =>
      expect(window.spacezero.knowledgeBase.syncNow).toHaveBeenCalledTimes(1)
    )
    expect(openFolder).toHaveBeenCalledTimes(1)
    expect(openRemote).toHaveBeenCalledTimes(1)
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

  it('flushes and awaits unsaved edits before opening another file', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getTree = async () => [
      {
        name: 'first.md',
        relativePath: 'first.md',
        kind: 'file',
        contentKind: 'markdown',
        size: 5,
        modifiedAt: new Date(0).toISOString()
      },
      {
        name: 'second.md',
        relativePath: 'second.md',
        kind: 'file',
        contentKind: 'markdown',
        size: 6,
        modifiedAt: new Date(0).toISOString()
      }
    ]
    const openDocument = vi.fn(async ({ relativePath }: { relativePath: string }) => ({
      name: relativePath,
      relativePath,
      contentKind: 'markdown' as const,
      size: relativePath.length,
      modifiedAt: new Date(0).toISOString(),
      revision: `${relativePath}-revision`,
      content: relativePath === 'first.md' ? '# First' : '# Second'
    }))
    let resolveSave: ((result: KnowledgeBaseSaveResult) => void) | undefined
    const saveDocument = vi.fn(
      () =>
        new Promise<KnowledgeBaseSaveResult>((resolve) => {
          resolveSave = resolve
        })
    )
    window.spacezero.knowledgeBase.openDocument = openDocument
    window.spacezero.knowledgeBase.saveDocument = saveDocument

    render(<KnowledgeBasePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'first.md' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Source' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit first.md' }), {
      target: { value: '# Unsaved first' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'second.md' }))

    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith({
        relativePath: 'first.md',
        content: '# Unsaved first',
        expectedRevision: 'first.md-revision'
      })
    )
    expect(openDocument).toHaveBeenCalledTimes(1)

    await act(async () =>
      resolveSave?.({
        status: 'saved',
        document: {
          name: 'first.md',
          relativePath: 'first.md',
          contentKind: 'markdown',
          size: 15,
          modifiedAt: new Date(0).toISOString(),
          revision: 'first.md-saved-revision',
          content: '# Unsaved first'
        }
      })
    )

    expect(await screen.findByRole('textbox', { name: 'Rich Markdown editor' })).toHaveValue(
      '# Second'
    )
    expect(openDocument).toHaveBeenCalledTimes(2)
  })

  it('awaits an open document save before deleting its file', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.knowledgeBase.getTree = async () => [
      {
        name: 'note.md',
        relativePath: 'note.md',
        kind: 'file',
        contentKind: 'markdown',
        size: 6,
        modifiedAt: new Date(0).toISOString()
      }
    ]
    window.spacezero.knowledgeBase.openDocument = async () => ({
      name: 'note.md',
      relativePath: 'note.md',
      contentKind: 'markdown',
      size: 6,
      modifiedAt: new Date(0).toISOString(),
      revision: 'note-revision',
      content: '# Note'
    })
    let resolveSave: ((result: KnowledgeBaseSaveResult) => void) | undefined
    window.spacezero.knowledgeBase.saveDocument = () =>
      new Promise<KnowledgeBaseSaveResult>((resolve) => {
        resolveSave = resolve
      })
    const deleteItem = vi.fn(async () => undefined)
    window.spacezero.knowledgeBase.deleteItem = deleteItem

    render(<KnowledgeBasePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'note.md' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Source' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit note.md' }), {
      target: { value: '# Keep before delete' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete note.md' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }))

    await waitFor(() => expect(resolveSave).toBeDefined())
    expect(deleteItem).not.toHaveBeenCalled()

    await act(async () =>
      resolveSave?.({
        status: 'saved',
        document: {
          name: 'note.md',
          relativePath: 'note.md',
          contentKind: 'markdown',
          size: 20,
          modifiedAt: new Date(0).toISOString(),
          revision: 'saved-revision',
          content: '# Keep before delete'
        }
      })
    )

    await waitFor(() =>
      expect(deleteItem).toHaveBeenCalledWith({ relativePath: 'note.md' })
    )
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

    render(<KnowledgeBasePage />)
    await screen.findByRole('button', { name: 'note.md' })

    fireEvent.click(screen.getByRole('button', { name: 'New file' }))
    fireEvent.change(screen.getByLabelText('File path'), {
      target: { value: 'new-note.md' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create file' }))
    await waitFor(() =>
      expect(createItem).toHaveBeenCalledWith({ relativePath: 'new-note.md', kind: 'file' })
    )

    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    fireEvent.change(screen.getByLabelText('Folder path'), {
      target: { value: 'new-folder' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }))
    await waitFor(() =>
      expect(createItem).toHaveBeenCalledWith({ relativePath: 'new-folder', kind: 'folder' })
    )

    fireEvent.click(screen.getByRole('button', { name: 'note.md' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Rename note.md' }))
    fireEvent.change(screen.getByLabelText('New name'), {
      target: { value: 'renamed.md' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    await waitFor(() =>
      expect(renameItem).toHaveBeenCalledWith({ relativePath: 'note.md', newName: 'renamed.md' })
    )

    fireEvent.click(screen.getByRole('button', { name: 'note.md' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Move note.md' }))
    fireEvent.change(screen.getByLabelText('Destination path'), {
      target: { value: 'archive/renamed.md' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() =>
      expect(moveItem).toHaveBeenCalledWith({
        sourcePath: 'note.md',
        destinationPath: 'archive/renamed.md'
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'note.md' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete note.md' }))
    expect(screen.getByText(/deleted permanently/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(deleteItem).toHaveBeenCalledWith({ relativePath: 'note.md' }))

    expect(getTree.mock.calls.length).toBeGreaterThanOrEqual(5)
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
