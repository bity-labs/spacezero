import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const monacoMock = vi.hoisted(() => ({
  saveCommand: undefined as undefined | (() => void),
  revealLineInCenter: vi.fn<(line: number) => void>(),
  setPosition: vi.fn<(position: { lineNumber: number; column: number }) => void>(),
  focus: vi.fn<() => void>()
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
      editor: {
        addCommand: (_keybinding: number, callback: () => void) => void
        revealLineInCenter: (line: number) => void
        setPosition: (position: { lineNumber: number; column: number }) => void
        focus: () => void
      },
      monaco: { KeyMod: { CtrlCmd: number }; KeyCode: { KeyS: number } }
    ) => void
  }) => {
    if (!monacoMock.saveCommand) {
      onMount?.(
        {
          addCommand: (_keybinding, callback) => {
            monacoMock.saveCommand = callback
          },
          revealLineInCenter: monacoMock.revealLineInCenter,
          setPosition: monacoMock.setPosition,
          focus: monacoMock.focus
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

vi.mock('@renderer/components/rich-markdown-editor', async () => {
  const React = await vi.importActual<typeof import('react')>('react')

  return {
    RichMarkdownEditor: ({
      documentRelativePath,
      markdown,
      onChange
    }: {
      documentRelativePath: string
      markdown: string
      onChange: (value: string) => void
    }) => {
      const [content, setContent] = React.useState(markdown)
      const [history, setHistory] = React.useState<string[]>([])

      React.useEffect(() => {
        setContent((currentContent) => {
          if (currentContent === markdown) return currentContent
          setHistory((currentHistory) => [...currentHistory, currentContent])
          return markdown
        })
      }, [markdown])

      const undo = (): void => {
        setHistory((currentHistory) => {
          const previousContent = currentHistory.at(-1)
          if (previousContent === undefined) return currentHistory

          setContent(previousContent)
          onChange(previousContent)
          return currentHistory.slice(0, -1)
        })
      }

      return (
        <div className="rich-markdown-editor" data-document-relative-path={documentRelativePath}>
          <button type="button" aria-label="Undo" disabled={history.length === 0} onClick={undo}>
            Undo
          </button>
          <textarea
            aria-label="Rich Markdown editor"
            value={content}
            onChange={(event) => {
              const nextContent = event.currentTarget.value
              setHistory((currentHistory) => [...currentHistory, content])
              setContent(nextContent)
              onChange(nextContent)
            }}
          />
        </div>
      )
    }
  }
})

import { openFilesLocation } from '../files-open-location'
import { useFilesStore } from '../files-store'
import { FilesTool } from './files-tool'

function requestContextKey(
  request: Parameters<typeof window.spacezero.files.listDirectory>[0]
): string {
  return request.context.kind === 'project-session'
    ? request.context.sessionId
    : request.context.contextKey
}

describe('Files Tool', () => {
  beforeEach(() => {
    monacoMock.saveCommand = undefined
    monacoMock.revealLineInCenter.mockClear()
    monacoMock.setPosition.mockClear()
    monacoMock.focus.mockClear()
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
    expect(listDirectory).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-1' },
      relativePath: ''
    })

    fireEvent.click(screen.getByRole('button', { name: 'Expand src' }))

    expect(await screen.findByText('index.ts')).toBeInTheDocument()
    await waitFor(() =>
      expect(listDirectory).toHaveBeenLastCalledWith({
        context: { kind: 'project-session', sessionId: 'session-1' },
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
    window.spacezero.files.listDirectory = vi.fn(async (request) =>
      requestContextKey(request) === 'session-1'
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

  it('opens Markdown in rich mode by default and shares one dirty buffer across rich and source modes', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text' as const,
      size: 8,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: '# Saved',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    const saveDocument = vi.fn(async ({ content }: { content: string }) => ({
      status: 'saved' as const,
      document: {
        name: 'README.md',
        relativePath: 'README.md',
        contentKind: 'text' as const,
        size: content.length,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content,
        hasBom: false,
        lineEnding: 'lf' as const
      }
    }))
    window.spacezero.files.saveDocument = saveDocument

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('README.md'))

    const richEditor = await screen.findByLabelText('Rich Markdown editor')
    expect(richEditor).toHaveDisplayValue('# Saved')
    expect(screen.queryByLabelText('Monaco editor')).not.toBeInTheDocument()

    fireEvent.change(richEditor, { target: { value: '## Rich draft' } })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))

    const sourceEditor = await screen.findByLabelText('Monaco editor')
    expect(sourceEditor).toHaveDisplayValue('## Rich draft')
    fireEvent.change(sourceEditor, { target: { value: '## Source draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rich' }))

    expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue(
      '## Source draft'
    )
    fireEvent.keyDown(screen.getByLabelText('Rich Markdown editor'), { key: 's', metaKey: true })

    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1))
    expect(saveDocument).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-1' },
      relativePath: 'README.md',
      content: '## Source draft',
      expectedRevision: 'revision-1'
    })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('uses the stable Knowledge Base context for shared Files reads, rich editing, and explicit save', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text' as const,
      size: 8,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: '# Saved',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    const saveDocument = vi.fn(async ({ content }: { content: string }) => ({
      status: 'saved' as const,
      document: {
        name: 'README.md',
        relativePath: 'README.md',
        contentKind: 'text' as const,
        size: content.length,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content,
        hasBom: false,
        lineEnding: 'lf' as const
      }
    }))
    window.spacezero.files.saveDocument = saveDocument

    const view = render(
      <FilesTool
        contextKey="knowledge-base"
        ipcContext={{ kind: 'knowledge-base', contextKey: 'knowledge-base' }}
        treeLabel="Files"
      />
    )
    expect(await screen.findByRole('tree', { name: 'Files' })).toBeInTheDocument()
    fireEvent.click(await screen.findByText('README.md'))
    const richEditor = await screen.findByLabelText('Rich Markdown editor')
    fireEvent.change(richEditor, { target: { value: '## Knowledge draft' } })

    view.rerender(
      <FilesTool
        contextKey="knowledge-base"
        ipcContext={{ kind: 'knowledge-base', contextKey: 'knowledge-base' }}
        treeLabel="Files"
      />
    )
    expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue(
      '## Knowledge draft'
    )
    fireEvent.keyDown(screen.getByLabelText('Rich Markdown editor'), { key: 's', metaKey: true })

    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1))
    expect(window.spacezero.files.listDirectory).toHaveBeenCalledWith({
      context: { kind: 'knowledge-base', contextKey: 'knowledge-base' },
      relativePath: ''
    })
    expect(saveDocument).toHaveBeenCalledWith({
      context: { kind: 'knowledge-base', contextKey: 'knowledge-base' },
      relativePath: 'README.md',
      content: '## Knowledge draft',
      expectedRevision: 'revision-1'
    })
    expect(
      screen.getByLabelText('Rich Markdown editor').closest('.rich-markdown-editor')
    ).toHaveAttribute('data-document-relative-path', 'README.md')

    view.rerender(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('README.md'))
    expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue('# Saved')
  })

  it('keeps lossy Markdown and MDX in source mode with an explanation', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'page.mdx', relativePath: 'docs/page.mdx', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'page.mdx',
      relativePath: 'docs/page.mdx',
      contentKind: 'text' as const,
      size: 35,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: `import Callout from './callout'\n\n# Page`,
      hasBom: false,
      lineEnding: 'lf' as const
    }))

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('page.mdx'))

    expect(await screen.findByLabelText('Monaco editor')).toHaveAttribute('data-language', 'mdx')
    expect(screen.queryByLabelText('Rich Markdown editor')).not.toBeInTheDocument()
    expect(screen.getByText(/rich mode cannot preserve/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rich' })).toBeDisabled()
  })

  it('keeps tab-padded list-indented MDX in source mode and saves it without rich serialization', async () => {
    const mdxContent = '-\titem\n    <Component />'
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'page.mdx', relativePath: 'docs/page.mdx', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'page.mdx',
      relativePath: 'docs/page.mdx',
      contentKind: 'text' as const,
      size: mdxContent.length,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: mdxContent,
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    const saveDocument = vi.fn(async ({ content }: { content: string }) => ({
      status: 'saved' as const,
      document: {
        name: 'page.mdx',
        relativePath: 'docs/page.mdx',
        contentKind: 'text' as const,
        size: content.length,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content,
        hasBom: false,
        lineEnding: 'lf' as const
      }
    }))
    window.spacezero.files.saveDocument = saveDocument

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('page.mdx'))

    const sourceEditor = await screen.findByLabelText('Monaco editor')
    expect(sourceEditor).toHaveAttribute('data-language', 'mdx')
    expect(sourceEditor).toHaveDisplayValue(mdxContent)
    expect(screen.queryByLabelText('Rich Markdown editor')).not.toBeInTheDocument()
    expect(screen.getByText(/rich mode cannot preserve/i)).toBeInTheDocument()
    fireEvent.keyDown(sourceEditor, { key: 's', metaKey: true })

    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1))
    expect(saveDocument).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-1' },
      relativePath: 'docs/page.mdx',
      content: mdxContent,
      expectedRevision: 'revision-1'
    })
  })

  it('defaults lossless MDX to rich mode while preserving editor mode per Project Session context', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'page.mdx', relativePath: 'docs/page.mdx', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async (request) => {
      const contextKey = requestContextKey(request)
      return {
        name: 'page.mdx',
        relativePath: 'docs/page.mdx',
        contentKind: 'text' as const,
        size: 6,
        modifiedAt: new Date(0).toISOString(),
        revision: `${contextKey}-revision`,
        content: `# ${contextKey}`,
        hasBom: false,
        lineEnding: 'lf' as const
      }
    })

    const view = render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('page.mdx'))
    expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue('# session-1')
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    expect(await screen.findByLabelText('Monaco editor')).toHaveDisplayValue('# session-1')

    view.rerender(<FilesTool sessionId="session-2" />)
    fireEvent.click(await screen.findByText('page.mdx'))
    expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue('# session-2')

    view.rerender(<FilesTool sessionId="session-1" />)
    expect(await screen.findByLabelText('Monaco editor')).toHaveDisplayValue('# session-1')
  })

  it('isolates rich editor history when switching between Markdown tabs', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'one.md', relativePath: 'one.md', kind: 'file' as const },
      { name: 'two.md', relativePath: 'two.md', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async ({ relativePath }) => ({
      name: relativePath,
      relativePath,
      contentKind: 'text' as const,
      size: relativePath.length,
      modifiedAt: new Date(0).toISOString(),
      revision: `${relativePath}-revision`,
      content: relativePath === 'one.md' ? '# One' : '# Two',
      hasBom: false,
      lineEnding: 'lf' as const
    }))

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('one.md'))
    expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue('# One')
    fireEvent.click(screen.getByRole('button', { name: 'Pin preview' }))
    fireEvent.click(screen.getByText('two.md'))
    expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue('# Two')
    fireEvent.click(screen.getByRole('button', { name: 'Pin preview' }))

    fireEvent.click(screen.getByRole('tab', { name: 'one.md' }))

    expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue('# One')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  it('hosts the rich editor in a bounded full-height flex container for internal scrolling', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text' as const,
      size: 1200,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: Array.from({ length: 40 }, (_, index) => `Line ${index + 1}`).join('\n'),
      hasBom: false,
      lineEnding: 'lf' as const
    }))

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('README.md'))

    const richEditor = await screen.findByLabelText('Rich Markdown editor')
    const richEditorRoot = richEditor.closest('.rich-markdown-editor')
    expect(richEditorRoot).toBeInTheDocument()
    expect(richEditorRoot?.parentElement).toHaveClass(
      'flex',
      'h-full',
      'min-h-0',
      'flex-1',
      'overflow-hidden'
    )
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
      context: { kind: 'project-session', sessionId: 'session-1' },
      relativePath: 'package.json',
      content: '{"name":"updated"}\n',
      expectedRevision: 'revision-1'
    })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.queryByText('Pin preview')).not.toBeInTheDocument()
  })

  it('replaces clean previews, pins explicitly, and activates duplicates without another read', async () => {
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

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('one.txt'))
    expect(await screen.findByRole('tab', { name: /one\.txt\s*preview/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )

    fireEvent.click(screen.getByText('two.txt'))
    expect(await screen.findByRole('tab', { name: /two\.txt\s*preview/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /one\.txt\s*preview/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pin preview' }))
    expect(screen.getByRole('tab', { name: 'two.txt' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByText('one.txt'))
    expect(await screen.findByRole('tab', { name: /one\.txt\s*preview/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    fireEvent.click(screen.getByRole('treeitem', { name: 'two.txt' }))
    expect(screen.getByRole('tab', { name: 'two.txt' })).toHaveAttribute('aria-selected', 'true')
    expect(openDocument).toHaveBeenCalledTimes(3)
  })

  it('supports readable overflow tabs, drag reordering, close selection, and active scroll', async () => {
    const store = useFilesStore.getState()
    for (const [index, path] of ['one.txt', 'two.txt', 'three.txt'].entries()) {
      expect(store.beginOpenTab('session-1', path, 'permanent', index + 1)).toBe(true)
      store.finishOpenTab(
        'session-1',
        {
          name: path,
          relativePath: path,
          contentKind: 'text',
          size: 5,
          modifiedAt: new Date(0).toISOString(),
          revision: `${path}-revision`,
          content: `${path} saved`,
          hasBom: false,
          lineEnding: 'lf'
        },
        index + 1
      )
    }
    window.spacezero.files.listDirectory = vi.fn(async () => [])

    render(<FilesTool sessionId="session-1" />)
    await screen.findByText('This worktree is empty.')
    expect(screen.getByRole('tablist', { name: 'Open files' })).toHaveClass('overflow-x-auto')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()

    const threeTabWrapper = screen.getByRole('tab', { name: 'three.txt' }).parentElement!
    const oneTabWrapper = screen.getByRole('tab', { name: 'one.txt' }).parentElement!
    fireEvent.dragStart(threeTabWrapper)
    fireEvent.dragOver(oneTabWrapper)
    fireEvent.drop(oneTabWrapper)
    expect(
      useFilesStore.getState().contexts['session-1'].tabs.map((tab) => tab.relativePath)
    ).toEqual(['three.txt', 'one.txt', 'two.txt'])

    fireEvent.click(screen.getByRole('tab', { name: 'two.txt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close two.txt' }))
    expect(screen.getByRole('tab', { name: 'one.txt' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Close one.txt' }))
    expect(screen.getByRole('tab', { name: 'three.txt' })).toHaveAttribute('aria-selected', 'true')
  })

  it('isolates tab state across Project Session contexts and component remounts', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'shared.txt', relativePath: 'shared.txt', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async (request) => {
      const contextKey = requestContextKey(request)
      return {
        name: 'shared.txt',
        relativePath: request.relativePath,
        contentKind: 'text' as const,
        size: 5,
        modifiedAt: new Date(0).toISOString(),
        revision: `${contextKey}-revision`,
        content: `${contextKey} saved`,
        hasBom: false,
        lineEnding: 'lf' as const
      }
    })

    const view = render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('shared.txt'))
    fireEvent.change(await screen.findByLabelText('Monaco editor'), {
      target: { value: 'session-1 draft' }
    })

    view.rerender(<FilesTool sessionId="session-2" />)
    fireEvent.click(await screen.findByText('shared.txt'))
    expect(await screen.findByDisplayValue('session-2 saved')).toBeInTheDocument()
    expect(screen.getByLabelText('Monaco editor')).toHaveAttribute(
      'data-model-path',
      'spacezero-files://session-2/shared.txt'
    )

    view.unmount()
    render(<FilesTool sessionId="session-1" />)
    expect(await screen.findByDisplayValue('session-1 draft')).toBeInTheDocument()
    expect(screen.getByLabelText('Monaco editor')).toHaveAttribute(
      'data-model-path',
      'spacezero-files://session-1/shared.txt'
    )
  })

  it('settles a delayed open after Files unmounts and remounts', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'delayed.txt', relativePath: 'delayed.txt', kind: 'file' as const }
    ])
    let resolveOpen:
      | ((document: Awaited<ReturnType<typeof window.spacezero.files.openDocument>>) => void)
      | undefined
    const openResult = new Promise<Awaited<ReturnType<typeof window.spacezero.files.openDocument>>>(
      (resolve) => {
        resolveOpen = resolve
      }
    )
    const openDocument = vi.fn(async () => openResult)
    window.spacezero.files.openDocument = openDocument

    const view = render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('delayed.txt'))
    expect(await screen.findByText('Opening file…')).toBeInTheDocument()

    view.unmount()
    render(<FilesTool sessionId="session-1" />)
    expect(await screen.findByText('Opening file…')).toBeInTheDocument()
    expect(openDocument).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveOpen?.({
        name: 'delayed.txt',
        relativePath: 'delayed.txt',
        contentKind: 'text' as const,
        size: 7,
        modifiedAt: new Date(0).toISOString(),
        revision: 'revision-1',
        content: 'settled',
        hasBom: false,
        lineEnding: 'lf' as const
      })
      await openResult
    })

    expect(await screen.findByDisplayValue('settled')).toBeInTheDocument()
  })

  it('ignores stale pre-unmount open results after remounting, closing, and reopening the same file', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'retry.txt', relativePath: 'retry.txt', kind: 'file' as const }
    ])
    const pendingOpens: Array<{
      promise: Promise<Awaited<ReturnType<typeof window.spacezero.files.openDocument>>>
      resolve: (document: Awaited<ReturnType<typeof window.spacezero.files.openDocument>>) => void
    }> = []
    const openDocument = vi.fn(() => {
      let resolveOpen!: (
        document: Awaited<ReturnType<typeof window.spacezero.files.openDocument>>
      ) => void
      const promise = new Promise<Awaited<ReturnType<typeof window.spacezero.files.openDocument>>>(
        (resolve) => {
          resolveOpen = resolve
        }
      )
      pendingOpens.push({ promise, resolve: resolveOpen })
      return promise
    })
    window.spacezero.files.openDocument = openDocument

    const view = render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('retry.txt'))
    expect(await screen.findByText('Opening file…')).toBeInTheDocument()

    view.unmount()
    render(<FilesTool sessionId="session-1" />)
    expect(await screen.findByText('Opening file…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close retry.txt' }))
    fireEvent.click(screen.getByRole('treeitem', { name: 'retry.txt' }))
    expect(await screen.findByText('Opening file…')).toBeInTheDocument()
    expect(openDocument).toHaveBeenCalledTimes(2)

    await act(async () => {
      pendingOpens[0]?.resolve({
        name: 'retry.txt',
        relativePath: 'retry.txt',
        contentKind: 'text' as const,
        size: 5,
        modifiedAt: new Date(0).toISOString(),
        revision: 'revision-old',
        content: 'old open',
        hasBom: false,
        lineEnding: 'lf' as const
      })
      await pendingOpens[0]?.promise
    })

    expect(screen.queryByDisplayValue('old open')).not.toBeInTheDocument()
    expect(screen.getByText('Opening file…')).toBeInTheDocument()

    await act(async () => {
      pendingOpens[1]?.resolve({
        name: 'retry.txt',
        relativePath: 'retry.txt',
        contentKind: 'text' as const,
        size: 7,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-new',
        content: 'new open',
        hasBom: false,
        lineEnding: 'lf' as const
      })
      await pendingOpens[1]?.promise
    })

    expect(await screen.findByDisplayValue('new open')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('old open')).not.toBeInTheDocument()
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
    fireEvent.change(await screen.findByLabelText('Rich Markdown editor'), {
      target: { value: 'draft' }
    })
    view.unmount()
    render(<FilesTool sessionId="session-1" />)

    expect(await screen.findByDisplayValue('draft')).toBeInTheDocument()
    expect(window.spacezero.files.saveDocument).not.toHaveBeenCalled()
  })

  it('keeps dirty tabs permanent while single-click browsing uses a separate preview', async () => {
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
    fireEvent.click(screen.getByText('two.txt'))

    expect(await screen.findByDisplayValue('two.txt saved')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: /●\s*one\.txt/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /two\.txt\s*preview/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    fireEvent.click(screen.getByRole('tab', { name: /●\s*one\.txt/ }))
    expect(screen.getByDisplayValue('one.txt draft')).toBeInTheDocument()
    expect(openDocument).toHaveBeenCalledTimes(2)
  })

  it('saves every dirty tab in the active context and reports mixed Save All outcomes per file', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'one.txt', relativePath: 'one.txt', kind: 'file' as const },
      { name: 'two.txt', relativePath: 'two.txt', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async ({ relativePath }) => ({
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
    window.spacezero.files.saveDocument = vi.fn(async ({ relativePath, content }) => {
      if (relativePath === 'two.txt') throw new Error('disk full')
      return {
        status: 'saved' as const,
        document: {
          name: relativePath,
          relativePath,
          contentKind: 'text' as const,
          size: content.length,
          modifiedAt: new Date(1).toISOString(),
          revision: `${relativePath}-saved-revision`,
          content,
          hasBom: false,
          lineEnding: 'lf' as const
        }
      }
    })

    render(<FilesTool sessionId="session-save-all" />)
    fireEvent.click(await screen.findByText('one.txt'))
    fireEvent.change(await screen.findByLabelText('Monaco editor'), {
      target: { value: 'one draft' }
    })
    fireEvent.click(screen.getByText('two.txt'))
    fireEvent.change(await screen.findByLabelText('Monaco editor'), {
      target: { value: 'two draft' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save All' }))

    await waitFor(() => expect(window.spacezero.files.saveDocument).toHaveBeenCalledTimes(2))
    expect(window.spacezero.files.saveDocument).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-save-all' },
      relativePath: 'one.txt',
      content: 'one draft',
      expectedRevision: 'one.txt-revision'
    })
    expect(window.spacezero.files.saveDocument).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-save-all' },
      relativePath: 'two.txt',
      content: 'two draft',
      expectedRevision: 'two.txt-revision'
    })
    expect(
      await screen.findByText('Couldn’t save this file. Your changes are still in memory.')
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /one\.txt/ })).not.toHaveTextContent('●')
    expect(screen.getByRole('tab', { name: /●\s*two\.txt/ })).toBeInTheDocument()
    expect(screen.getByDisplayValue('two draft')).toBeInTheDocument()
  })

  it('keeps Save All isolated to the currently mounted Files context', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async ({ context }) => {
      const contextKey = requestContextKey({ context, relativePath: '' })
      return {
        name: 'README.md',
        relativePath: 'README.md',
        contentKind: 'text' as const,
        size: 5,
        modifiedAt: new Date(0).toISOString(),
        revision: `${contextKey}-revision`,
        content: `${contextKey} saved`,
        hasBom: false,
        lineEnding: 'lf' as const
      }
    })
    window.spacezero.files.saveDocument = vi.fn(async ({ context, relativePath, content }) => {
      const contextKey = requestContextKey({ context, relativePath })
      return {
        status: 'saved' as const,
        document: {
          name: relativePath,
          relativePath,
          contentKind: 'text' as const,
          size: content.length,
          modifiedAt: new Date(1).toISOString(),
          revision: `${contextKey}-saved-revision`,
          content,
          hasBom: false,
          lineEnding: 'lf' as const
        }
      }
    })

    const view = render(<FilesTool sessionId="session-one" />)
    fireEvent.click(await screen.findByText('README.md'))
    fireEvent.change(await screen.findByLabelText('Rich Markdown editor'), {
      target: { value: 'session one draft' }
    })

    view.rerender(<FilesTool sessionId="session-two" />)
    fireEvent.click(await screen.findByText('README.md'))
    fireEvent.change(await screen.findByLabelText('Rich Markdown editor'), {
      target: { value: 'session two draft' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }))

    await waitFor(() => expect(window.spacezero.files.saveDocument).toHaveBeenCalledTimes(1))
    expect(window.spacezero.files.saveDocument).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-two' },
      relativePath: 'README.md',
      content: 'session two draft',
      expectedRevision: 'session-two-revision'
    })

    view.rerender(<FilesTool sessionId="session-one" />)
    expect(await screen.findByDisplayValue('session one draft')).toBeInTheDocument()
  })

  it('requires Save, Discard, or Cancel before closing dirty tabs', async () => {
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
    window.spacezero.files.saveDocument = vi
      .fn()
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce({
        status: 'saved' as const,
        document: {
          name: 'README.md',
          relativePath: 'README.md',
          contentKind: 'text' as const,
          size: 5,
          modifiedAt: new Date(1).toISOString(),
          revision: 'revision-2',
          content: 'draft',
          hasBom: false,
          lineEnding: 'lf' as const
        }
      })

    render(<FilesTool sessionId="session-close-dirty" />)
    fireEvent.click(await screen.findByText('README.md'))
    fireEvent.change(await screen.findByLabelText('Rich Markdown editor'), {
      target: { value: 'draft' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close README.md' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Save changes to README.md?')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('draft')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close README.md' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByText('Couldn’t save this file. Your changes are still in memory.')
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: /README\.md/ })).not.toBeInTheDocument()
    )

    fireEvent.click(await screen.findByText('README.md'))
    fireEvent.change(await screen.findByLabelText('Rich Markdown editor'), {
      target: { value: 'discard me' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close README.md' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: /README\.md/ })).not.toBeInTheDocument()
    )
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
    const editor = await screen.findByLabelText('Rich Markdown editor')
    fireEvent.change(editor, { target: { value: 'draft' } })
    fireEvent.keyDown(editor, { key: 's', metaKey: true })

    expect(await screen.findByText(/changed on disk/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('draft')).toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('opens an external Files location in the matching context, reveals the requested line, and preserves dirty buffers', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'app.ts', relativePath: 'app.ts', kind: 'file' as const }
    ])
    const openDocument = vi.fn(async ({ relativePath }) => ({
      name: relativePath,
      relativePath,
      contentKind: 'text' as const,
      size: 22,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: 'line 1\nline 2\nline 3',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    window.spacezero.files.openDocument = openDocument

    render(<FilesTool sessionId="session-1" />)

    await act(async () => {
      await openFilesLocation({
        contextKey: 'session-1',
        ipcContext: { kind: 'project-session', sessionId: 'session-1' },
        relativePath: 'app.ts',
        line: 3
      })
    })

    await waitFor(() =>
      expect(screen.getByLabelText('Monaco editor')).toHaveValue('line 1\nline 2\nline 3')
    )
    await waitFor(() => expect(monacoMock.revealLineInCenter).toHaveBeenCalledWith(3))
    expect(monacoMock.setPosition).toHaveBeenCalledWith({ lineNumber: 3, column: 1 })

    fireEvent.change(screen.getByLabelText('Monaco editor'), {
      target: { value: 'dirty draft' }
    })
    await act(async () => {
      await openFilesLocation({
        contextKey: 'session-1',
        ipcContext: { kind: 'project-session', sessionId: 'session-1' },
        relativePath: 'app.ts',
        line: 2
      })
    })

    expect(screen.getByDisplayValue('dirty draft')).toBeInTheDocument()
    expect(openDocument).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(monacoMock.revealLineInCenter).toHaveBeenCalledWith(2))
  })

  it('keeps external Files location handoffs isolated by context key', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'shared.ts', relativePath: 'shared.ts', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async ({ context, relativePath }) => {
      const content = context.kind === 'project-session' ? context.sessionId : context.contextKey
      return {
        name: relativePath,
        relativePath,
        contentKind: 'text' as const,
        size: content.length,
        modifiedAt: new Date(0).toISOString(),
        revision: `revision-${content}`,
        content,
        hasBom: false,
        lineEnding: 'lf' as const
      }
    })

    const view = render(<FilesTool sessionId="session-one" />)
    await act(async () => {
      await openFilesLocation({
        contextKey: 'session-one',
        ipcContext: { kind: 'project-session', sessionId: 'session-one' },
        relativePath: 'shared.ts'
      })
    })
    expect(await screen.findByDisplayValue('session-one')).toBeInTheDocument()

    view.rerender(<FilesTool sessionId="session-two" />)
    await act(async () => {
      await openFilesLocation({
        contextKey: 'session-two',
        ipcContext: { kind: 'project-session', sessionId: 'session-two' },
        relativePath: 'shared.ts'
      })
    })
    expect(await screen.findByDisplayValue('session-two')).toBeInTheDocument()

    view.rerender(<FilesTool sessionId="session-one" />)
    expect(await screen.findByDisplayValue('session-one')).toBeInTheDocument()
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
