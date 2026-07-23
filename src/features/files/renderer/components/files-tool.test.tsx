import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const monacoMock = vi.hoisted(() => ({
  saveCommand: undefined as undefined | (() => void)
}))

vi.mock('./files-icon', () => ({
  FilesIcon: () => <span aria-hidden="true" />
}))

vi.mock('./files-monaco-editor', () => ({
  FilesMonacoEditor: ({
    value,
    language,
    path,
    onChange,
    onMount
  }: {
    value?: string
    language?: string
    path?: string
    onChange?: (value: string | undefined) => void
    onMount?: (
      editor: { addCommand: (_keybinding: number, callback: () => void) => void },
      monaco: { KeyMod: { CtrlCmd: number }; KeyCode: { KeyS: number } }
    ) => void
  }) => {
    if (!monacoMock.saveCommand) {
      onMount?.(
        {
          addCommand: (_keybinding, callback) => {
            monacoMock.saveCommand = callback
          }
        },
        { KeyMod: { CtrlCmd: 1 }, KeyCode: { KeyS: 2 } }
      )
    }

    return (
      <textarea
        aria-label="Monaco editor"
        data-language={language}
        data-model-path={path}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
            event.preventDefault()
            event.stopPropagation()
            monacoMock.saveCommand?.()
          }
        }}
      />
    )
  }
}))

vi.mock('../lib/monaco-environment', () => ({
  configureFilesMonacoEnvironment: vi.fn()
}))

import { useFilesStore } from '../files-store'
import { FilesTool } from './files-tool'

describe('Files Tool', () => {
  beforeEach(() => {
    monacoMock.saveCommand = undefined
  })

  it('loads only the visible directory and lazily expands folders through the Project Session API', async () => {
    const listDirectory = vi.fn(async ({ relativePath }: { relativePath: string }) =>
      relativePath === ''
        ? [
            { name: 'src', relativePath: 'src', kind: 'directory' as const },
            { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
          ]
        : [{ name: 'index.ts', relativePath: 'src/index.ts', kind: 'file' as const }]
    )
    window.spacezero.files.listDirectory = listDirectory

    render(<FilesTool sessionId="session-1" />)

    expect(screen.getByText('Loading files…')).toBeInTheDocument()
    expect(await screen.findByRole('tree', { name: 'Project files' })).toBeInTheDocument()
    expect(screen.getByText('src')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(listDirectory).toHaveBeenCalledTimes(1)
    expect(listDirectory).toHaveBeenCalledWith({ sessionId: 'session-1', relativePath: '' })

    fireEvent.click(screen.getByRole('button', { name: 'Expand src' }))

    expect(await screen.findByText('index.ts')).toBeInTheDocument()
    await waitFor(() =>
      expect(listDirectory).toHaveBeenLastCalledWith({
        sessionId: 'session-1',
        relativePath: 'src'
      })
    )
  })

  it('reloads persisted expanded directories parent-first after remounting', async () => {
    useFilesStore.getState().setExpanded('session-1', 'src', true)
    useFilesStore.getState().setExpanded('session-1', 'src/nested', true)
    const listDirectory = vi.fn(async ({ relativePath }: { relativePath: string }) => {
      if (relativePath === '') {
        return [{ name: 'src', relativePath: 'src', kind: 'directory' as const }]
      }
      if (relativePath === 'src') {
        return [{ name: 'nested', relativePath: 'src/nested', kind: 'directory' as const }]
      }
      return [{ name: 'index.ts', relativePath: 'src/nested/index.ts', kind: 'file' as const }]
    })
    window.spacezero.files.listDirectory = listDirectory

    render(<FilesTool sessionId="session-1" />)

    expect(await screen.findByText('index.ts')).toBeInTheDocument()
    expect(listDirectory.mock.calls.map(([request]) => request.relativePath)).toEqual([
      '',
      'src',
      'src/nested'
    ])
  })

  it('shows an actionable managed-worktree failure and retries without fabricating content', async () => {
    const listDirectory = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "Error invoking remote method 'files:listDirectory': Error: files.worktreeInvalid"
        )
      )
      .mockResolvedValueOnce([])
    window.spacezero.files.listDirectory = listDirectory

    render(<FilesTool sessionId="session-1" />)

    expect(
      await screen.findByText(
        'This Session’s managed worktree is missing or invalid. Repair or recreate the Session.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('tree', { name: 'Project files' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('This worktree is empty.')).toBeInTheDocument()
    expect(listDirectory).toHaveBeenCalledTimes(2)
  })

  it('does not leak late directory results when switching Project Sessions', async () => {
    let resolveFirst:
      | ((entries: Awaited<ReturnType<typeof window.spacezero.files.listDirectory>>) => void)
      | undefined
    const firstResult = new Promise<
      Awaited<ReturnType<typeof window.spacezero.files.listDirectory>>
    >((resolve) => {
      resolveFirst = resolve
    })
    window.spacezero.files.listDirectory = vi.fn(async ({ sessionId }) =>
      sessionId === 'session-1'
        ? firstResult
        : [{ name: 'second.txt', relativePath: 'second.txt', kind: 'file' as const }]
    )

    const view = render(<FilesTool sessionId="session-1" />)
    view.rerender(<FilesTool sessionId="session-2" />)

    expect(await screen.findByText('second.txt')).toBeInTheDocument()
    resolveFirst?.([{ name: 'first.txt', relativePath: 'first.txt', kind: 'file' }])
    await Promise.resolve()

    expect(screen.queryByText('first.txt')).not.toBeInTheDocument()
    expect(screen.getByText('second.txt')).toBeInTheDocument()
  })

  it('renders symbolic links as identifiable non-expandable entries', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'linked-src', relativePath: 'linked-src', kind: 'symlink' as const }
    ])

    render(<FilesTool sessionId="session-1" />)

    expect(await screen.findByText('linked-src')).toBeInTheDocument()
    expect(screen.getByText('Symbolic link')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand linked-src' })).not.toBeInTheDocument()
  })

  it('opens a text file in Monaco with context-scoped model identity and explicit save', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'src', relativePath: 'src', kind: 'directory' as const },
      { name: 'package.json', relativePath: 'package.json', kind: 'file' as const }
    ])
    const openDocument = vi.fn(async ({ relativePath }: { relativePath: string }) => ({
      name: 'package.json',
      relativePath,
      contentKind: 'text' as const,
      size: 16,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: '{"name":"app"}\n',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    const saveDocument = vi.fn(async ({ content }: { content: string }) => ({
      status: 'saved' as const,
      document: {
        name: 'package.json',
        relativePath: 'package.json',
        contentKind: 'text' as const,
        size: content.length,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content,
        hasBom: false,
        lineEnding: 'lf' as const
      }
    }))
    window.spacezero.files.openDocument = openDocument
    window.spacezero.files.saveDocument = saveDocument

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('package.json'))

    const editor = await screen.findByLabelText('Monaco editor')
    expect(editor).toHaveAttribute('data-language', 'json')
    expect(editor).toHaveAttribute('data-model-path', 'spacezero-files://session-1/package.json')
    fireEvent.change(editor, { target: { value: '{"name":"updated"}\n' } })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(saveDocument).not.toHaveBeenCalled()

    fireEvent.keyDown(editor, { key: 's', metaKey: true })

    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1))
    expect(saveDocument).toHaveBeenCalledWith({
      sessionId: 'session-1',
      relativePath: 'package.json',
      content: '{"name":"updated"}\n',
      expectedRevision: 'revision-1'
    })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('keeps dirty buffers in memory across unmounts without autosaving', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text' as const,
      size: 5,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: 'saved',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    window.spacezero.files.saveDocument = vi.fn(async () => {
      throw new Error('unexpected autosave')
    })

    const view = render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('README.md'))
    fireEvent.change(await screen.findByLabelText('Monaco editor'), { target: { value: 'draft' } })
    view.unmount()
    render(<FilesTool sessionId="session-1" />)

    expect(await screen.findByDisplayValue('draft')).toBeInTheDocument()
    expect(window.spacezero.files.saveDocument).not.toHaveBeenCalled()
  })

  it('does not replace a dirty draft when navigation is canceled', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'one.txt', relativePath: 'one.txt', kind: 'file' as const },
      { name: 'two.txt', relativePath: 'two.txt', kind: 'file' as const }
    ])
    const openDocument = vi.fn(async ({ relativePath }) => ({
      name: relativePath,
      relativePath,
      contentKind: 'text' as const,
      size: 5,
      modifiedAt: new Date(0).toISOString(),
      revision: `${relativePath}-revision`,
      content: `${relativePath} saved`,
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    window.spacezero.files.openDocument = openDocument
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('one.txt'))
    fireEvent.change(await screen.findByLabelText('Monaco editor'), {
      target: { value: 'one.txt draft' }
    })
    fireEvent.click(await screen.findByText('two.txt'))

    expect(confirm).toHaveBeenCalledWith(
      'Discard unsaved changes to one.txt before opening another file?'
    )
    expect(screen.getByDisplayValue('one.txt draft')).toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(openDocument.mock.calls).not.toContainEqual([
      { sessionId: 'session-1', relativePath: 'two.txt' }
    ])
  })

  it('keeps the dirty buffer and shows actionable feedback when save conflicts or fails', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text' as const,
      size: 5,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: 'saved',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    window.spacezero.files.saveDocument = vi.fn(async () => ({
      status: 'conflict' as const,
      document: {
        name: 'README.md',
        relativePath: 'README.md',
        contentKind: 'text' as const,
        size: 8,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content: 'external',
        hasBom: false,
        lineEnding: 'lf' as const
      }
    }))

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('README.md'))
    const editor = await screen.findByLabelText('Monaco editor')
    fireEvent.change(editor, { target: { value: 'draft' } })
    fireEvent.keyDown(editor, { key: 's', metaKey: true })

    expect(await screen.findByText(/changed on disk/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('draft')).toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('opens binary and oversized files as non-editable metadata', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'archive.bin', relativePath: 'archive.bin', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'archive.bin',
      relativePath: 'archive.bin',
      contentKind: 'binary' as const,
      size: 1024,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1'
    }))

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('archive.bin'))

    expect(
      await screen.findByText('This file is binary and cannot be edited here.')
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Monaco editor')).not.toBeInTheDocument()
  })

  it('keeps the collapsible and keyboard-resizable explorer layout per Project Session', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [])
    const view = render(<FilesTool sessionId="session-1" />)
    await screen.findByText('This worktree is empty.')

    const resizeHandle = screen.getByRole('separator', { name: 'Resize Files explorer' })
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '260')
    fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' })
    expect(screen.getByRole('separator', { name: 'Resize Files explorer' })).toHaveAttribute(
      'aria-valuenow',
      '280'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Files explorer' }))
    expect(screen.getByRole('button', { name: 'Expand Files explorer' })).toBeInTheDocument()

    view.rerender(<FilesTool sessionId="session-2" />)
    expect(
      await screen.findByRole('button', { name: 'Collapse Files explorer' })
    ).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Resize Files explorer' })).toHaveAttribute(
      'aria-valuenow',
      '260'
    )

    view.rerender(<FilesTool sessionId="session-1" />)
    expect(screen.getByRole('button', { name: 'Expand Files explorer' })).toBeInTheDocument()
  })
})
