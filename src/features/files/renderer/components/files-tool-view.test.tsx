import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  dirtyTabFilesToolFixture,
  fileNameSearchEmptyFilesToolFixture,
  fileNameSearchFilesToolFixture,
  FilesToolSidePaneFixture,
  nestedTreeFilesToolFixture,
  permanentTabFilesToolFixture,
  previewTabFilesToolFixture,
  richMarkdownFilesEditorFixture
} from './files-tool-view.fixtures'
import {
  FilesEditorView,
  FilesToolView,
  type FilesContentSearchViewState,
  type FilesToolViewProps
} from './files-tool-view'

function createProps(overrides: Partial<FilesToolViewProps> = {}): FilesToolViewProps {
  return {
    explorerCollapsed: false,
    explorerWidth: 240,
    searchMode: 'files',
    filesSearchQuery: '',
    contentSearchQuery: '',
    treeState: {
      status: 'ready',
      content: (
        <ul aria-label="Project files">
          <li>src</li>
          <li>src/app.tsx</li>
        </ul>
      )
    },
    contentSearchState: { status: 'idle' },
    editorContent: <FilesEditorView state={{ status: 'empty', emptyRoot: false }} />,
    createDialog: null,
    closePromptFileName: null,
    onCollapseAll: vi.fn(),
    onCreateDialogCancel: vi.fn(),
    onCreateDialogChange: vi.fn(),
    onCreateDialogSubmit: vi.fn(),
    onCreateFile: vi.fn(),
    onCreateFolder: vi.fn(),
    onEditorFocusChange: vi.fn(),
    onEditorKeyDown: vi.fn(),
    onExpandExplorer: vi.fn(),
    onExplorerKeyDown: vi.fn(),
    onExplorerPointerDown: vi.fn(),
    onExplorerScroll: vi.fn(),
    onFilesSearchChange: vi.fn(),
    onOpenSearchResult: vi.fn(),
    onRetryContentSearch: vi.fn(),
    onRetryTree: vi.fn(),
    onSearchModeChange: vi.fn(),
    onSubmitContentSearch: vi.fn(),
    onCollapseExplorer: vi.fn(),
    onContentSearchChange: vi.fn(),
    onClosePromptCancel: vi.fn(),
    onClosePromptDiscard: vi.fn(),
    onClosePromptSave: vi.fn(),
    ...overrides
  }
}

describe('FilesToolView', () => {
  it('keeps the file tree beside the editor and emits toolbar intent', async () => {
    const user = userEvent.setup()
    const onCreateFile = vi.fn()
    const onSearchModeChange = vi.fn()

    render(
      <FilesToolView
        {...createProps({
          onCreateFile,
          onSearchModeChange
        })}
      />
    )

    expect(screen.getByRole('list', { name: 'Project files' })).toBeInTheDocument()
    expect(screen.getByText('Select a file to open it.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New file' }))
    await user.click(screen.getByRole('button', { name: 'Contents search' }))

    expect(onCreateFile).toHaveBeenCalledOnce()
    expect(onSearchModeChange).toHaveBeenCalledWith('contents')
  })

  it.each([
    [{ status: 'loading' } as const, 'Loading files…'],
    [{ status: 'error', message: 'Couldn’t load this tree.' } as const, 'Couldn’t load this tree.'],
    [{ status: 'empty' } as const, 'This worktree is empty.']
  ])('renders the %s tree state', (treeState, message) => {
    render(<FilesToolView {...createProps({ treeState })} />)

    expect(screen.getByText(message)).toBeInTheDocument()
  })

  it.each([
    [
      { status: 'loading', query: 'workspace' } satisfies FilesContentSearchViewState,
      'Searching contents…'
    ],
    [
      { status: 'ready', query: 'workspace', results: [] } satisfies FilesContentSearchViewState,
      'No results for “workspace”.'
    ],
    [
      {
        status: 'error',
        query: 'workspace',
        message: 'Search unavailable.'
      } satisfies FilesContentSearchViewState,
      'Search unavailable.'
    ]
  ])('renders the %s content-search state', (contentSearchState, message) => {
    render(
      <FilesToolView
        {...createProps({
          searchMode: 'contents',
          contentSearchQuery: 'workspace',
          contentSearchState
        })}
      />
    )

    expect(screen.getByText(message)).toBeInTheDocument()
  })

  it('shows preview, missing, and conflict document signals through the editor view', async () => {
    const user = userEvent.setup()
    const onReloadFromDisk = vi.fn()
    const { rerender } = render(
      <FilesEditorView
        state={{
          status: 'ready',
          name: 'notes.md',
          preview: true,
          content: <p>Draft notes</p>
        }}
      />
    )

    expect(screen.getByText('Preview')).toBeInTheDocument()

    rerender(
      <FilesEditorView
        state={{
          status: 'ready',
          name: 'notes.md',
          preview: false,
          externalStatus: 'deleted',
          content: <p>Draft notes</p>
        }}
      />
    )
    expect(screen.getByText('Deleted on disk. Your buffer is still open.')).toBeInTheDocument()

    rerender(
      <FilesEditorView
        state={{
          status: 'ready',
          name: 'notes.md',
          preview: false,
          externalStatus: 'conflict',
          content: <p>Draft notes</p>
        }}
        onReloadFromDisk={onReloadFromDisk}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Reload from disk' }))
    expect(onReloadFromDisk).toHaveBeenCalledOnce()
  })

  it('renders create and unsaved-changes dialogs without runtime dependencies', () => {
    render(
      <FilesToolView
        {...createProps({
          createDialog: {
            kind: 'file',
            destination: 'src',
            name: 'new-file.ts',
            error: null,
            status: 'idle'
          },
          closePromptFileName: 'notes.md'
        })}
      />
    )

    expect(screen.getByRole('heading', { name: 'New File' })).toBeInTheDocument()
    expect(screen.getByText('Create in src')).toBeInTheDocument()
    expect(screen.getByText('Save changes to notes.md?')).toBeInTheDocument()
  })

  it.each([
    ['preview', previewTabFilesToolFixture, 'README.md preview', false],
    ['permanent', permanentTabFilesToolFixture, 'README.md', false],
    ['dirty', dirtyTabFilesToolFixture, 'Modified README.md', true]
  ])(
    'composes the %s Files state through the production Side Pane tab strip',
    (_, fixture, name, dirty) => {
      render(<FilesToolSidePaneFixture {...fixture} />)

      expect(screen.getByRole('tablist', { name: 'Side Pane Tabs' })).toBeInTheDocument()
      const tab = screen.getByRole('tab', { name })
      expect(tab).toHaveAttribute('aria-selected', 'true')
      expect(tab).toHaveTextContent(dirty ? '●' : 'README.md')
      expect(screen.getByRole('region', { name: 'Files explorer' })).toBeInTheDocument()
    }
  )

  it('renders real rich Markdown content when the rich mode is selected', async () => {
    render(<FilesToolSidePaneFixture {...richMarkdownFilesEditorFixture} />)

    expect(await screen.findByRole('textbox', { name: 'Rich Markdown editor' })).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Markdown formatting' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Source editor')).not.toBeInTheDocument()
  })

  it.each([
    ['nested', nestedTreeFilesToolFixture, ''],
    ['active search', fileNameSearchFilesToolFixture, 'context'],
    ['no search results', fileNameSearchEmptyFilesToolFixture, 'does-not-exist']
  ])('uses the production Trees adapter for the %s story', async (_, fixture, query) => {
    render(<FilesToolSidePaneFixture {...fixture} />)

    const tree = await screen.findByLabelText('Project files')
    expect(tree).toHaveStyle({
      '--trees-fg-override': 'var(--foreground)',
      '--trees-font-family-override': 'var(--font-sans)'
    })
    expect(screen.getByRole('textbox', { name: 'Files search' })).toHaveValue(query)
  })

  it('shows matching Trees rows and hides unrelated rows for an active search', async () => {
    render(<FilesToolSidePaneFixture {...fileNameSearchFilesToolFixture} />)

    const tree = await screen.findByLabelText('Project files')
    await waitFor(() => {
      const visiblePaths = Array.from(
        tree.shadowRoot?.querySelectorAll<HTMLElement>('[data-type="item"]') ?? []
      ).map((row) => row.dataset.itemPath)
      expect(visiblePaths).toContain('docs/context.md')
      expect(visiblePaths).not.toContain('package.json')
    })
    expect(screen.queryByRole('status', { name: 'No matching files' })).not.toBeInTheDocument()
  })

  it('shows a production no-match state without exposing unrelated Trees rows', async () => {
    render(<FilesToolSidePaneFixture {...fileNameSearchEmptyFilesToolFixture} />)

    const tree = await screen.findByLabelText('Project files')
    expect(await screen.findByRole('status', { name: 'No matching files' })).toBeVisible()
    expect(tree).toHaveStyle({ visibility: 'hidden' })
  })
})
