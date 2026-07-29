import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const monacoMock = vi.hoisted(() => ({
  saveCommand: undefined as undefined | (() => void),
  revealLineInCenter: vi.fn<(line: number) => void>(),
  setPosition: vi.fn<(position: { lineNumber: number; column: number }) => void>(),
  focus: vi.fn<() => void>(),
  saveViewState: vi.fn<() => unknown>(() => ({
    cursorState: [{ position: { lineNumber: 4, column: 2 } }]
  }))
}))

const colorModeMock = vi.hoisted(() => ({
  resolvedTheme: 'light' as 'light' | 'dark',
  updateThemePreference: vi.fn()
}))

const appCommandMock = vi.hoisted(() => ({
  registeredCommands: [] as Array<{
    id: string
    title: string
    handler: () => void | Promise<void>
  }>
}))

const treesMock = vi.hoisted(() => ({
  options: [] as Array<Record<string, unknown>>
}))

vi.mock('@pierre/trees/react', async () => {
  const React = await vi.importActual<typeof import('react')>('react')

  type PreparedTreeInput = { paths: readonly string[] }

  type TreeOptions = {
    paths?: readonly string[]
    preparedInput?: PreparedTreeInput
    initialExpandedPaths?: readonly string[]
    initialSelectedPaths?: readonly string[]
    onSelectionChange?: (paths: readonly string[]) => void
    renderRowDecoration?: (context: {
      item: { kind: 'directory' | 'file'; name: string; path: string }
      row: { kind: 'directory' | 'file'; path: string }
    }) => { text: string; title?: string } | null
  } & Record<string, unknown>

  type MockModel = {
    options: TreeOptions
    resetPaths: (
      paths: readonly string[] | { preparedInput: PreparedTreeInput; initialExpandedPaths?: readonly string[] },
      options?: { preparedInput?: PreparedTreeInput; initialExpandedPaths?: readonly string[] }
    ) => void
    getItem: (
      path: string
    ) => { select: () => void; isDirectory: () => boolean; getPath: () => string } | null
    getFocusedPath: () => string | null
    getSelectedPaths: () => readonly string[]
    getVisibleCount: () => number
    getVisibleRows: () => Array<{ kind: 'directory' | 'file'; path: string; isExpanded: boolean }>
    scrollToPath: () => void
    subscribe: (listener: () => void) => () => void
    __getPaths: () => readonly string[]
    __getExpanded: () => Set<string>
    __select: (path: string) => void
    __toggle: (path: string) => void
  }

  function normalizeDirectoryPath(path: string): string {
    return path.endsWith('/') ? path : `${path}/`
  }

  function displayName(path: string): string {
    const normalized = path.endsWith('/') ? path.slice(0, -1) : path
    return normalized.split('/').at(-1) ?? normalized
  }

  function parentPath(path: string): string {
    const normalized = path.endsWith('/') ? path.slice(0, -1) : path
    const index = normalized.lastIndexOf('/')
    return index < 0 ? '' : `${normalized.slice(0, index)}/`
  }

  function isDirectoryPath(path: string): boolean {
    return path.endsWith('/')
  }

  function createModel(options: TreeOptions, forceUpdate: () => void): MockModel {
    let paths = [...(options.preparedInput?.paths ?? options.paths ?? [])]
    let selectedPaths = [...(options.initialSelectedPaths ?? [])]
    const expanded = new Set(options.initialExpandedPaths?.map(normalizeDirectoryPath) ?? [])
    const listeners = new Set<() => void>()
    const notify = (): void => {
      for (const listener of listeners) listener()
      forceUpdate()
    }
    const resetExpanded = (nextExpandedPaths?: readonly string[]): boolean => {
      if (!nextExpandedPaths) return false
      const nextExpanded = new Set(nextExpandedPaths.map(normalizeDirectoryPath))
      const changed =
        nextExpanded.size !== expanded.size ||
        [...nextExpanded].some((path) => !expanded.has(path))
      if (!changed) return false
      expanded.clear()
      for (const path of nextExpanded) expanded.add(path)
      return true
    }
    const model: MockModel = {
      options,
      resetPaths: (nextPaths, resetOptions) => {
        const preparedResetOptions = nextPaths as {
          preparedInput: PreparedTreeInput
          initialExpandedPaths?: readonly string[]
        }
        const normalizedPaths = Array.isArray(nextPaths)
          ? [...nextPaths]
          : [...preparedResetOptions.preparedInput.paths]
        const pathsChanged =
          normalizedPaths.length !== paths.length ||
          normalizedPaths.some((path, index) => path !== paths[index])
        const expandedChanged = resetExpanded(
          Array.isArray(nextPaths)
            ? resetOptions?.initialExpandedPaths
            : preparedResetOptions.initialExpandedPaths
        )
        if (!pathsChanged && !expandedChanged) return
        paths = normalizedPaths
        notify()
      },
      getItem: (path) => {
        const normalizedPath = paths.includes(path) ? path : normalizeDirectoryPath(path)
        if (!paths.includes(normalizedPath)) return null
        return {
          getPath: () => normalizedPath,
          isDirectory: () => isDirectoryPath(normalizedPath),
          select: () => model.__select(normalizedPath)
        }
      },
      getFocusedPath: () => selectedPaths[0] ?? null,
      getSelectedPaths: () => selectedPaths,
      getVisibleCount: () => paths.length,
      getVisibleRows: () =>
        paths.map((path) => ({
          isExpanded: expanded.has(normalizeDirectoryPath(path)),
          kind: isDirectoryPath(path) ? 'directory' : 'file',
          path
        })),
      scrollToPath: () => undefined,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      __getPaths: () => paths,
      __getExpanded: () => expanded,
      __select: (path) => {
        selectedPaths = [path]
        options.onSelectionChange?.(selectedPaths)
        notify()
      },
      __toggle: (path) => {
        const normalizedPath = normalizeDirectoryPath(path)
        if (expanded.has(normalizedPath)) expanded.delete(normalizedPath)
        else expanded.add(normalizedPath)
        notify()
      }
    }
    return model
  }

  function useFileTree(options: TreeOptions): { model: MockModel } {
    treesMock.options.push(options)
    const [, setRevision] = React.useState(0)
    const modelRef = React.useRef<MockModel | null>(null)
    if (!modelRef.current) {
      modelRef.current = createModel(options, () => setRevision((revision) => revision + 1))
    }
    return { model: modelRef.current }
  }

  function FileTree({
    model,
    renderContextMenu,
    ...props
  }: {
    model: MockModel
    renderContextMenu?: (
      item: { kind: 'directory' | 'file'; name: string; path: string },
      context: {
        close: () => void
        restoreFocus: () => void
        anchorElement: HTMLElement
        anchorRect: DOMRect
      }
    ) => React.ReactNode
    'aria-label'?: string
  }): React.JSX.Element {
    const [activeMenuPath, setActiveMenuPath] = React.useState<string | null>(null)
    const paths = model.__getPaths()
    const expanded = model.__getExpanded()
    const visiblePaths = paths.filter((path) => {
      const parent = parentPath(path)
      if (!parent) return true
      if (!paths.includes(parent)) return true
      return expanded.has(parent)
    })
    const selectedPath = model.getSelectedPaths()[0]

    return (
      <div>
        <ul role="tree" aria-label={props['aria-label']}>
          {visiblePaths.map((path) => {
            const directory = isDirectoryPath(path)
            const name = displayName(path)
            const hasChildren =
              directory && paths.some((candidate) => parentPath(candidate) === path)
            const decoration = model.options.renderRowDecoration?.({
              item: { kind: directory ? 'directory' : 'file', name, path },
              row: { kind: directory ? 'directory' : 'file', path }
            })
            return (
              <li
                key={path}
                role="treeitem"
                aria-label={name}
                aria-selected={selectedPath === path}
                onClick={() => model.__select(path)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setActiveMenuPath(path)
                }}
              >
                <span data-slot="context-menu-trigger">
                  {hasChildren ? (
                    <button
                      type="button"
                      aria-label={`${expanded.has(path) ? 'Collapse' : 'Expand'} ${name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        model.__toggle(path)
                      }}
                    >
                      {expanded.has(path) ? '▾' : '▸'}
                    </button>
                  ) : null}
                  {name}
                  {decoration ? <span>{decoration.text}</span> : null}
                </span>
              </li>
            )
          })}
        </ul>
        {activeMenuPath && renderContextMenu ? (
          <div role="menu">
            {renderContextMenu(
              {
                kind: isDirectoryPath(activeMenuPath) ? 'directory' : 'file',
                name: displayName(activeMenuPath),
                path: activeMenuPath
              },
              {
                anchorElement: document.body,
                anchorRect: new DOMRect(),
                close: () => setActiveMenuPath(null),
                restoreFocus: () => undefined
              }
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return { FileTree, useFileTree }
})

vi.mock('../../../app-commands/renderer/app-command-context', () => ({
  useRegisterAppCommands: (
    commands: Array<{ id: string; title: string; handler: () => void | Promise<void> }>
  ) => {
    appCommandMock.registeredCommands = commands
  }
}))

vi.mock('./files-monaco-editor', () => ({
  FilesMonacoEditor: ({
    value,
    language,
    path,
    theme,
    onChange,
    onMount
  }: {
    value?: string
    language?: string
    path?: string
    theme?: string
    onChange?: (value: string | undefined) => void
    onMount?: (
      editor: {
        addCommand: (_keybinding: number, callback: () => void) => void
        revealLineInCenter: (line: number) => void
        setPosition: (position: { lineNumber: number; column: number }) => void
        focus: () => void
        saveViewState: () => unknown
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
          focus: monacoMock.focus,
          saveViewState: monacoMock.saveViewState
        },
        { KeyMod: { CtrlCmd: 1 }, KeyCode: { KeyS: 2 } }
      )
    }

    return (
      <textarea
        aria-label="Monaco editor"
        data-language={language}
        data-model-path={path}
        data-theme={theme}
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

vi.mock('@renderer/color-mode-provider', () => ({
  useColorMode: () => ({
    themePreference: 'system',
    resolvedTheme: colorModeMock.resolvedTheme,
    updateThemePreference: colorModeMock.updateThemePreference
  })
}))

vi.mock('@renderer/components/rich-markdown-editor', async () => {
  const React = await vi.importActual<typeof import('react')>('react')

  return {
    RichMarkdownEditor: ({
      documentRelativePath,
      markdown,
      onChange,
      initialScrollTop = 0,
      onScrollContainerChange,
      onScrollTopChange
    }: {
      documentRelativePath: string
      markdown: string
      onChange: (value: string) => void
      initialScrollTop?: number
      onScrollContainerChange?: (element: HTMLElement | null) => void
      onScrollTopChange?: (scrollTop: number) => void
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

      const containerRef = React.useRef<HTMLDivElement | null>(null)
      React.useEffect(() => {
        if (containerRef.current) containerRef.current.scrollTop = initialScrollTop
      }, [initialScrollTop])
      React.useEffect(() => {
        onScrollContainerChange?.(containerRef.current)
        return () => onScrollContainerChange?.(null)
      }, [onScrollContainerChange])

      return (
        <div
          ref={containerRef}
          className="rich-markdown-editor"
          data-document-relative-path={documentRelativePath}
          onScroll={(event) => onScrollTopChange?.(event.currentTarget.scrollTop)}
        >
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

import { flushFilesEditorViewStates } from '../files-editor-view-state-registry'
import { openFilesLocation } from '../files-open-location'
import { useFilesStore } from '../files-store'
import { FILES_SAVE_ALL_COMMAND_ID, FilesTool } from './files-tool'

function requestContextKey(
  request: Parameters<typeof window.spacezero.files.listDirectory>[0]
): string {
  return request.context.kind === 'project-session'
    ? request.context.sessionId
    : request.context.contextKey
}

function enterSearchView(): HTMLInputElement {
  fireEvent.click(screen.getByRole('button', { name: 'Search files' }))
  return screen.getByRole('textbox', { name: 'Search files' }) as HTMLInputElement
}

function searchFilesInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'Search files' }) as HTMLInputElement
}

function invokeRegisteredSaveAllCommand(): void {
  const command = appCommandMock.registeredCommands.find(
    ({ id }) => id === FILES_SAVE_ALL_COMMAND_ID
  )
  if (!command) throw new Error('expected Files Save All command to be registered')
  void command.handler()
}

describe('Files Tool', () => {
  beforeEach(() => {
    colorModeMock.resolvedTheme = 'light'
    colorModeMock.updateThemePreference.mockClear()
    monacoMock.saveCommand = undefined
    monacoMock.revealLineInCenter.mockClear()
    monacoMock.setPosition.mockClear()
    monacoMock.focus.mockClear()
    monacoMock.saveViewState.mockClear()
    appCommandMock.registeredCommands = []
    treesMock.options = []
  })

  it('configures Trees as the Files explorer renderer with compact sticky folder browsing', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'src', relativePath: 'src', kind: 'directory' as const },
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])

    render(<FilesTool sessionId="session-1" />)

    expect(await screen.findByRole('tree', { name: 'Project files' })).toBeInTheDocument()
    expect(treesMock.options.at(-1)).toMatchObject({
      density: 'compact',
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: true,
      stickyFolders: true
    })
  })

  it('loads the full context tree through the Project Session API and opens files from Trees selection', async () => {
    const listTree = vi.fn(async () => ({
      entries: [
        { name: 'README.md', relativePath: 'README.md', kind: 'file' as const },
        { name: 'src', relativePath: 'src', kind: 'directory' as const },
        { name: 'index.ts', relativePath: 'src/index.ts', kind: 'file' as const }
      ],
      presortedPaths: ['src/', 'src/index.ts', 'README.md']
    }))
    window.spacezero.files.listTree = listTree
    const openDocument = vi.fn(async ({ relativePath }) => ({
      name: relativePath.split('/').at(-1) ?? relativePath,
      relativePath,
      contentKind: 'text' as const,
      size: 0,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: 'content',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    window.spacezero.files.openDocument = openDocument

    render(<FilesTool sessionId="session-1" />)

    expect(screen.getByText('Loading files…')).toBeInTheDocument()
    expect(await screen.findByRole('tree', { name: 'Project files' })).toBeInTheDocument()
    expect(await screen.findByText('src')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(
      within(screen.getByRole('tree', { name: 'Project files' }))
        .getAllByRole('treeitem')
        .map((item) => item.getAttribute('aria-label'))
    ).toEqual(['src', 'README.md'])
    expect(listTree).toHaveBeenCalledTimes(1)
    expect(listTree).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-1' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Expand src' }))
    fireEvent.click(await screen.findByRole('treeitem', { name: 'index.ts' }))

    expect(await screen.findByLabelText('Monaco editor')).toBeInTheDocument()
    expect(openDocument).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-1' },
      relativePath: 'src/index.ts'
    })
  })

  it('searches the active context, replaces the tree, returns to prior tree state, and opens positioned previews', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'app.ts', relativePath: 'app.ts', kind: 'file' as const }
    ])
    const search = vi.fn(async () => [
      {
        kind: 'content' as const,
        relativePath: 'app.ts',
        name: 'app.ts',
        snippets: [{ line: 3, column: 5, text: 'hello needle' }]
      }
    ])
    window.spacezero.files.search = search
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'app.ts',
      relativePath: 'app.ts',
      contentKind: 'text' as const,
      size: 18,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: 'one\ntwo\nhello needle\n',
      hasBom: false,
      lineEnding: 'lf' as const
    }))

    render(<FilesTool sessionId="session-1" />)

    expect(await screen.findByRole('tree', { name: 'Project files' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('treeitem', { name: 'app.ts' }))
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Explorer$/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tree view' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Search files' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    expect(screen.queryByText('Include ignored files')).not.toBeInTheDocument()

    enterSearchView()
    await waitFor(() => expect(searchFilesInput()).toHaveFocus())
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trash' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reveal selected item' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Selected app.ts')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search files' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.change(searchFilesInput(), { target: { value: 'needle' } })
    fireEvent.submit(screen.getByRole('search'))

    expect(await screen.findByLabelText('Search results')).toBeInTheDocument()
    expect(screen.queryByRole('tree', { name: 'Project files' })).not.toBeInTheDocument()
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { kind: 'project-session', sessionId: 'session-1' },
        query: 'needle',
        includeIgnored: true,
        requestId: expect.any(String)
      })
    )

    fireEvent.click(
      within(screen.getByLabelText('Search results')).getByRole('button', { name: /app.ts/ })
    )
    expect(await screen.findByLabelText('Monaco editor')).toBeInTheDocument()
    expect(monacoMock.revealLineInCenter).toHaveBeenCalledWith(3)

    fireEvent.click(screen.getByRole('button', { name: 'Tree view' }))
    expect(await screen.findByRole('tree', { name: 'Project files' })).toBeInTheDocument()
    expect(screen.getAllByText('app.ts').length).toBeGreaterThan(0)
  })

  it('cancels superseded search results and keeps search failures local to the explorer column', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    window.spacezero.files.listTree = vi.fn(async () => ({
      entries: [{ name: 'README.md', relativePath: 'README.md', kind: 'file' as const }],
      presortedPaths: ['README.md']
    }))
    const search = vi
      .fn()
      .mockResolvedValueOnce([
        { kind: 'filename' as const, relativePath: 'first.txt', name: 'first.txt' }
      ])
      .mockResolvedValueOnce([
        { kind: 'filename' as const, relativePath: 'second.txt', name: 'second.txt' }
      ])
      .mockRejectedValueOnce(new Error('files.searchFailed'))
    window.spacezero.files.search = search

    render(<FilesTool sessionId="session-1" />)

    enterSearchView()
    fireEvent.change(searchFilesInput(), { target: { value: 'first' } })
    fireEvent.submit(screen.getByRole('search'))
    enterSearchView()
    fireEvent.change(searchFilesInput(), { target: { value: 'second' } })
    fireEvent.submit(screen.getByRole('search'))
    await waitFor(() => expect(screen.getAllByText('second.txt')).toHaveLength(2))

    enterSearchView()
    fireEvent.change(searchFilesInput(), { target: { value: 'broken' } })
    fireEvent.submit(screen.getByRole('search'))

    expect(
      await screen.findByText('Couldn’t search these files. Adjust the query or try again.')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tree view' }))
    expect(await screen.findByRole('tree', { name: 'Project files' })).toBeInTheDocument()
  })

  it('cancels main-owned searches when superseded, cleared, or unmounted', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    let resolveFirst:
      ((results: Awaited<ReturnType<typeof window.spacezero.files.search>>) => void) | undefined
    const firstResult = new Promise<Awaited<ReturnType<typeof window.spacezero.files.search>>>(
      (resolve) => {
        resolveFirst = resolve
      }
    )
    let resolveSecond:
      ((results: Awaited<ReturnType<typeof window.spacezero.files.search>>) => void) | undefined
    const secondResult = new Promise<Awaited<ReturnType<typeof window.spacezero.files.search>>>(
      (resolve) => {
        resolveSecond = resolve
      }
    )
    const search = vi
      .fn()
      .mockImplementationOnce(async () => firstResult)
      .mockImplementationOnce(async () => secondResult)
    const cancelSearch = vi.fn(async () => undefined)
    window.spacezero.files.search = search
    window.spacezero.files.cancelSearch = cancelSearch

    const view = render(<FilesTool sessionId="session-1" />)
    await screen.findByRole('tree', { name: 'Project files' })

    enterSearchView()
    fireEvent.change(searchFilesInput(), { target: { value: 'first' } })
    fireEvent.submit(screen.getByRole('search'))
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
    const firstRequestId = search.mock.calls[0]?.[0].requestId

    enterSearchView()
    fireEvent.change(searchFilesInput(), { target: { value: 'second' } })
    fireEvent.submit(screen.getByRole('search'))
    await waitFor(() =>
      expect(cancelSearch).toHaveBeenCalledWith({
        context: { kind: 'project-session', sessionId: 'session-1' },
        requestId: firstRequestId
      })
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Tree view' }))
    await waitFor(() => expect(cancelSearch).toHaveBeenCalledTimes(2))
    view.unmount()
    expect(cancelSearch).toHaveBeenCalledTimes(2)
    resolveFirst?.([{ kind: 'filename' as const, relativePath: 'first.txt', name: 'first.txt' }])
    resolveSecond?.([{ kind: 'filename' as const, relativePath: 'second.txt', name: 'second.txt' }])
  })

  it('invalidates active search results after saves and refreshes them after external Files observation events', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text' as const,
      size: 6,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: 'needle',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    window.spacezero.files.saveDocument = vi.fn(async ({ relativePath, content }) => ({
      status: 'saved' as const,
      document: {
        name: 'README.md',
        relativePath,
        contentKind: 'text' as const,
        size: content.length,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content,
        hasBom: false,
        lineEnding: 'lf' as const
      }
    }))
    window.spacezero.files.search = vi.fn(async () => [
      {
        kind: 'content' as const,
        relativePath: 'README.md',
        name: 'README.md',
        snippets: [{ line: 1, column: 1, text: 'needle' }]
      }
    ])
    let observationListener:
      Parameters<typeof window.spacezero.files.onObservationEvent>[0] | undefined
    window.spacezero.files.onObservationEvent = vi.fn((listener) => {
      observationListener = listener
      return () => undefined
    })

    render(<FilesTool sessionId="session-1" />)
    await screen.findByRole('tree', { name: 'Project files' })
    enterSearchView()
    fireEvent.change(searchFilesInput(), { target: { value: 'needle' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(await screen.findByLabelText('Search results')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /README.md/ }))
    fireEvent.change(await screen.findByLabelText('Rich Markdown editor'), {
      target: { value: 'removed' }
    })
    fireEvent.keyDown(screen.getByLabelText('Rich Markdown editor'), { key: 's', metaKey: true })

    await waitFor(() => expect(screen.queryByLabelText('Search results')).not.toBeInTheDocument())
    expect(await screen.findByRole('tree', { name: 'Project files' })).toBeInTheDocument()

    enterSearchView()
    fireEvent.change(searchFilesInput(), { target: { value: 'needle' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(await screen.findByLabelText('Search results')).toBeInTheDocument()

    act(() =>
      observationListener?.({
        subscriptionId: 'session-1:files-observation',
        contextKey: 'session-1',
        kind: 'modified',
        relativePath: 'README.md'
      })
    )

    await waitFor(() => expect(window.spacezero.files.search).toHaveBeenCalledTimes(3))
    expect(searchFilesInput()).toHaveDisplayValue('needle')
    expect(screen.getByLabelText('Search results')).toBeInTheDocument()
  })

  it('refreshes only affected observation ancestry while preserving active search and context isolation', async () => {
    useFilesStore.getState().setExpanded('session-1', 'src', true)
    useFilesStore.getState().setExpanded('session-1', 'docs', true)
    const listDirectory = vi.fn(async ({ relativePath }: { relativePath: string }) => {
      if (relativePath === '') {
        return [
          { name: 'src', relativePath: 'src', kind: 'directory' as const },
          { name: 'docs', relativePath: 'docs', kind: 'directory' as const }
        ]
      }
      if (relativePath === 'src') {
        return [{ name: 'index.ts', relativePath: 'src/index.ts', kind: 'file' as const }]
      }
      return [{ name: 'guide.md', relativePath: 'docs/guide.md', kind: 'file' as const }]
    })
    window.spacezero.files.listDirectory = listDirectory
    window.spacezero.files.search = vi.fn(async () => [
      { kind: 'filename' as const, relativePath: 'src/index.ts', name: 'index.ts' }
    ])
    let resolveObservedRead:
      | ((document: Awaited<ReturnType<typeof window.spacezero.files.openDocument>>) => void)
      | undefined
    const observedRead = new Promise<
      Awaited<ReturnType<typeof window.spacezero.files.openDocument>>
    >((resolve) => {
      resolveObservedRead = resolve
    })
    window.spacezero.files.openDocument = vi
      .fn()
      .mockResolvedValueOnce({
        name: 'index.ts',
        relativePath: 'src/index.ts',
        contentKind: 'text' as const,
        size: 7,
        modifiedAt: new Date(0).toISOString(),
        revision: 'revision-1',
        content: 'content',
        hasBom: false,
        lineEnding: 'lf' as const
      })
      .mockImplementationOnce(async () => observedRead)
    const observationListeners: Parameters<typeof window.spacezero.files.onObservationEvent>[0][] =
      []
    window.spacezero.files.onObservationEvent = vi.fn((listener) => {
      observationListeners.push(listener)
      return () => undefined
    })

    render(<FilesTool sessionId="session-1" />)
    expect(await screen.findByText('index.ts')).toBeInTheDocument()
    expect(await screen.findByText('guide.md')).toBeInTheDocument()
    fireEvent.click(screen.getByText('index.ts'))
    expect(await screen.findByLabelText('Monaco editor')).toHaveValue('content')
    enterSearchView()
    fireEvent.change(searchFilesInput(), { target: { value: 'index' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(await screen.findByLabelText('Search results')).toBeInTheDocument()
    const callsBeforeObservation = listDirectory.mock.calls.length

    act(() => {
      observationListeners.at(-1)?.({
        subscriptionId: 'session-1:files-observation',
        contextKey: 'knowledge-base',
        kind: 'modified',
        relativePath: 'docs/guide.md'
      })
    })
    await Promise.resolve()
    expect(listDirectory).toHaveBeenCalledTimes(callsBeforeObservation)

    act(() => {
      observationListeners.at(-1)?.({
        subscriptionId: 'session-1:files-observation',
        contextKey: 'session-1',
        kind: 'modified',
        relativePath: 'src/index.ts'
      })
    })

    await waitFor(() => expect(window.spacezero.files.search).toHaveBeenCalledTimes(2))
    const callsAfterObservation = listDirectory.mock.calls
      .slice(callsBeforeObservation)
      .map(([request]) => request.relativePath)
    expect(callsAfterObservation).toEqual(['', 'src', 'docs'])
    expect(searchFilesInput()).toHaveDisplayValue('index')
    expect(screen.getByLabelText('Search results')).toBeInTheDocument()

    resolveObservedRead?.({
      name: 'index.ts',
      relativePath: 'src/index.ts',
      contentKind: 'text',
      size: 15,
      modifiedAt: new Date(1).toISOString(),
      revision: 'revision-2',
      content: 'updated content',
      hasBom: false,
      lineEnding: 'lf'
    })
    expect(await screen.findByDisplayValue('updated content')).toBeInTheDocument()
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

  it('offers only the safe reveal context-menu action for symbolic links', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'linked-src', relativePath: 'linked-src', kind: 'symlink' as const }
    ])
    const revealInSystemFileManager = vi.fn(async () => undefined)
    window.spacezero.files.revealInSystemFileManager = revealInSystemFileManager

    render(<FilesTool sessionId="session-symlink-menu" />)
    const treeItem = (await screen.findByText('linked-src')).closest('[role="treeitem"]')
    expect(treeItem).not.toBeNull()
    fireEvent.contextMenu(
      treeItem?.querySelector('[data-slot="context-menu-trigger"]') ??
        screen.getByText('linked-src'),
      { clientX: 8, clientY: 8 }
    )

    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Show in Finder' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'New File' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'New Folder' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Show in Finder' }))
    await waitFor(() =>
      expect(revealInSystemFileManager).toHaveBeenCalledWith({
        context: { kind: 'project-session', sessionId: 'session-symlink-menu' },
        relativePath: 'linked-src'
      })
    )
  })

  it('flushes active Monaco view state for normal exit without saving document content', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'app.ts', relativePath: 'app.ts', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'app.ts',
      relativePath: 'app.ts',
      contentKind: 'text' as const,
      size: 5,
      modifiedAt: new Date(0).toISOString(),
      revision: 'app.ts-revision',
      content: 'saved',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    window.spacezero.files.saveDocument = vi.fn(async () => {
      throw new Error('unexpected save')
    })

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('app.ts'))
    expect(await screen.findByLabelText('Monaco editor')).toBeInTheDocument()

    act(() => flushFilesEditorViewStates())

    expect(monacoMock.saveViewState).toHaveBeenCalledTimes(1)
    expect(
      useFilesStore.getState().contexts['session-1'].editorViewStates['app.ts'].monacoViewState
    ).toEqual({ cursorState: [{ position: { lineNumber: 4, column: 2 } }] })
    expect(window.spacezero.files.saveDocument).not.toHaveBeenCalled()
  })

  it('restores and flushes rich Markdown scroll state for normal exit without saving document content', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text' as const,
      size: 7,
      modifiedAt: new Date(0).toISOString(),
      revision: 'README.md-revision',
      content: '# Saved',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    window.spacezero.files.saveDocument = vi.fn(async () => {
      throw new Error('unexpected save')
    })
    useFilesStore.getState().setRichScrollTop('session-1', 'README.md', 32)

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('README.md'))
    const richEditor = (await screen.findByLabelText('Rich Markdown editor')).closest(
      '.rich-markdown-editor'
    ) as HTMLElement
    expect(richEditor.scrollTop).toBe(32)

    act(() => {
      richEditor.scrollTop = 96
      fireEvent.scroll(richEditor)
      flushFilesEditorViewStates()
    })

    expect(
      useFilesStore.getState().contexts['session-1'].editorViewStates['README.md'].richScrollTop
    ).toBe(96)
    expect(window.spacezero.files.saveDocument).not.toHaveBeenCalled()
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
    expect(screen.getByRole('tab', { name: /●\s*README\.md/ })).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
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
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /README\.md/ })).not.toHaveTextContent('●')
    )
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
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
    fireEvent.doubleClick(screen.getByRole('tab', { name: /one\.md\s*preview/ }))
    fireEvent.click(screen.getByText('two.md'))
    expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue('# Two')
    fireEvent.doubleClick(screen.getByRole('tab', { name: /two\.md\s*preview/ }))

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

  it('passes the resolved app theme to Monaco and updates open source editors', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'app.ts', relativePath: 'app.ts', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(
      async ({ relativePath }: { relativePath: string }) => ({
        name: 'app.ts',
        relativePath,
        contentKind: 'text' as const,
        size: 21,
        modifiedAt: new Date(0).toISOString(),
        revision: 'revision-1',
        content: 'export const app = 1\n',
        hasBom: false,
        lineEnding: 'lf' as const
      })
    )

    const view = render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('app.ts'))

    expect(await screen.findByLabelText('Monaco editor')).toHaveAttribute('data-theme', 'vs')

    colorModeMock.resolvedTheme = 'dark'
    view.rerender(<FilesTool sessionId="session-1" />)

    expect(await screen.findByLabelText('Monaco editor')).toHaveAttribute('data-theme', 'vs-dark')
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
    expect(screen.getByRole('tab', { name: /●\s*package\.json/ })).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    expect(saveDocument).not.toHaveBeenCalled()

    fireEvent.keyDown(editor, { key: 's', metaKey: true })

    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1))
    expect(saveDocument).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-1' },
      relativePath: 'package.json',
      content: '{"name":"updated"}\n',
      expectedRevision: 'revision-1'
    })
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /package\.json/ })).not.toHaveTextContent('●')
    )
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(screen.queryByText('Pin preview')).not.toBeInTheDocument()
  })

  it('replaces clean previews, pins on tab double-click, and activates duplicates without another read', async () => {
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

    expect(screen.queryByRole('button', { name: 'Pin preview' })).not.toBeInTheDocument()
    fireEvent.doubleClick(screen.getByRole('tab', { name: /two\.txt\s*preview/ }))
    const pinnedTwoTab = screen.getByRole('tab', { name: 'two.txt' })
    expect(pinnedTwoTab).toHaveAttribute('aria-selected', 'true')
    expect(pinnedTwoTab).not.toHaveClass('italic')
    fireEvent.doubleClick(pinnedTwoTab)
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

  it('single-clicking a preview tab only activates it without pinning it', async () => {
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

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('one.txt'))
    const onePreviewTab = await screen.findByRole('tab', { name: /one\.txt\s*preview/ })
    fireEvent.doubleClick(onePreviewTab)
    fireEvent.click(screen.getByText('two.txt'))
    const twoPreviewTab = await screen.findByRole('tab', { name: /two\.txt\s*preview/ })

    fireEvent.click(screen.getByRole('tab', { name: 'one.txt' }))
    expect(screen.getByRole('tab', { name: 'one.txt' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(twoPreviewTab)

    expect(screen.getByRole('tab', { name: /two\.txt\s*preview/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.queryByRole('tab', { name: 'two.txt' })).not.toBeInTheDocument()
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
    expect(await screen.findByRole('tablist', { name: 'Open files' })).toHaveClass(
      'overflow-x-auto'
    )
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

  it('does not show inline tree-item actions when selecting a directory or switching to search', async () => {
    window.spacezero.files.listDirectory = vi.fn(async ({ relativePath }) =>
      relativePath === ''
        ? [
            { name: 'notes', relativePath: 'notes', kind: 'directory' as const },
            { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
          ]
        : [{ name: 'old.txt', relativePath: 'notes/old.txt', kind: 'file' as const }]
    )
    window.spacezero.files.search = vi.fn(async () => [
      { kind: 'filename' as const, relativePath: 'notes/old.txt', name: 'old.txt' }
    ])

    render(<FilesTool sessionId="session-search-selected-actions" />)
    await screen.findByText('notes')
    fireEvent.click(screen.getByRole('treeitem', { name: 'notes' }))
    expect(screen.queryByRole('button', { name: 'New file in notes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New folder in notes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trash' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reveal selected item' })).not.toBeInTheDocument()

    enterSearchView()
    fireEvent.change(searchFilesInput(), { target: { value: 'old' } })
    fireEvent.submit(screen.getByRole('search'))

    expect(await screen.findByLabelText('Search results')).toBeInTheDocument()
    expect(screen.getByDisplayValue('old')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New file in notes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New folder in notes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trash' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reveal selected item' })).not.toBeInTheDocument()
  })

  it('opens a root New File dialog, validates the name, creates after confirmation, and opens the new file', async () => {
    let entries = [{ name: 'README.md', relativePath: 'README.md', kind: 'file' as const }]
    window.spacezero.files.listDirectory = vi.fn(async () => entries)
    const createEntry = vi.fn(async () => {
      entries = [
        ...entries,
        { name: 'new-note.md', relativePath: 'new-note.md', kind: 'file' as const }
      ]
    })
    window.spacezero.files.createEntry = createEntry
    window.spacezero.files.openDocument = vi.fn(async ({ relativePath }) => ({
      name: relativePath,
      relativePath,
      contentKind: 'text' as const,
      size: 0,
      modifiedAt: new Date(0).toISOString(),
      revision: 'new-revision',
      content: '',
      hasBom: false,
      lineEnding: 'lf' as const
    }))

    render(<FilesTool sessionId="session-1" />)
    await screen.findByText('README.md')
    fireEvent.click(screen.getByRole('button', { name: 'New file' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'New File' })).toBeInTheDocument()
    expect(within(dialog).getByText('Create in project root')).toBeInTheDocument()
    expect(within(dialog).getByPlaceholderText('File name')).toHaveFocus()
    expect(createEntry).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(await within(dialog).findByText('Enter a file name.')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByPlaceholderText('File name'), {
      target: { value: 'new-note.md' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(createEntry).toHaveBeenCalledWith({
        context: { kind: 'project-session', sessionId: 'session-1' },
        relativePath: 'new-note.md',
        kind: 'file'
      })
    )
    expect(await screen.findByRole('tab', { name: /new-note\.md/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens Knowledge Base root create dialogs with the matching destination and context', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [])
    const createEntry = vi.fn(async () => undefined)
    window.spacezero.files.createEntry = createEntry
    window.spacezero.files.openDocument = vi.fn(async ({ relativePath }) => ({
      name: relativePath,
      relativePath,
      contentKind: 'text' as const,
      size: 0,
      modifiedAt: new Date(0).toISOString(),
      revision: 'new-revision',
      content: '',
      hasBom: false,
      lineEnding: 'lf' as const
    }))

    render(
      <FilesTool
        contextKey="knowledge-base"
        ipcContext={{ kind: 'knowledge-base', contextKey: 'knowledge-base' }}
        treeLabel="Files"
      />
    )
    await screen.findByText('This worktree is empty.')

    fireEvent.click(screen.getByRole('button', { name: 'New file' }))
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'New File' })).toBeInTheDocument()
    expect(within(dialog).getByText('Create in Knowledge Base root')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByPlaceholderText('File name'), {
      target: { value: 'new-note.md' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(createEntry).toHaveBeenCalledWith({
        context: { kind: 'knowledge-base', contextKey: 'knowledge-base' },
        relativePath: 'new-note.md',
        kind: 'file'
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'New Folder' })).toBeInTheDocument()
    expect(within(dialog).getByText('Create in Knowledge Base root')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByPlaceholderText('Folder name'), {
      target: { value: 'notes' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(createEntry).toHaveBeenLastCalledWith({
        context: { kind: 'knowledge-base', contextKey: 'knowledge-base' },
        relativePath: 'notes',
        kind: 'folder'
      })
    )
  })

  it('opens context-menu New File and New Folder dialogs as siblings of the selected entry', async () => {
    const rootEntries = [{ name: 'src', relativePath: 'src', kind: 'directory' as const }]
    let srcEntries: Array<{ name: string; relativePath: string; kind: 'file' | 'directory' }> = [
      { name: 'old.txt', relativePath: 'src/old.txt', kind: 'file' }
    ]
    window.spacezero.files.listDirectory = vi.fn(
      async ({ relativePath }: { relativePath: string }) => {
        if (relativePath === '') return rootEntries
        if (relativePath === 'src') return srcEntries
        return []
      }
    )
    const createEntry = vi.fn(
      async ({ relativePath, kind }: { relativePath: string; kind: 'file' | 'folder' }) => {
        srcEntries = [
          ...srcEntries,
          {
            name: relativePath.split('/').at(-1) ?? relativePath,
            relativePath,
            kind: kind === 'folder' ? 'directory' : 'file'
          }
        ]
      }
    )
    window.spacezero.files.createEntry = createEntry
    window.spacezero.files.openDocument = vi.fn(async ({ relativePath }) => ({
      name: relativePath.split('/').at(-1) ?? relativePath,
      relativePath,
      contentKind: 'text' as const,
      size: 0,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: '',
      hasBom: false,
      lineEnding: 'lf' as const
    }))

    render(<FilesTool sessionId="session-sibling-create" />)
    fireEvent.click(await screen.findByRole('treeitem', { name: 'src' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand src' }))
    await screen.findByRole('treeitem', { name: 'old.txt' })

    fireEvent.contextMenu(
      screen
        .getByRole('treeitem', { name: 'old.txt' })
        .querySelector('[data-slot="context-menu-trigger"]') ?? screen.getByText('old.txt'),
      { clientX: 8, clientY: 8 }
    )
    let menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'New File' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'New Folder' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Show in Finder' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Move' })).not.toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'New File' }))

    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'New File' })).toBeInTheDocument()
    expect(within(dialog).getByText('Create in src')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByPlaceholderText('File name'), {
      target: { value: 'new.txt' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(createEntry).toHaveBeenCalledWith({
        context: { kind: 'project-session', sessionId: 'session-sibling-create' },
        relativePath: 'src/new.txt',
        kind: 'file'
      })
    )

    fireEvent.contextMenu(
      screen
        .getByRole('treeitem', { name: 'old.txt' })
        .querySelector('[data-slot="context-menu-trigger"]') ?? screen.getByText('old.txt'),
      { clientX: 8, clientY: 8 }
    )
    menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'New Folder' }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'New Folder' })).toBeInTheDocument()
    expect(within(dialog).getByText('Create in src')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByPlaceholderText('Folder name'), {
      target: { value: 'components' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(createEntry).toHaveBeenLastCalledWith({
        context: { kind: 'project-session', sessionId: 'session-sibling-create' },
        relativePath: 'src/components',
        kind: 'folder'
      })
    )
  })

  it('uses context-menu Delete and Show in Finder actions for the selected entry', async () => {
    let entries = [{ name: 'old.txt', relativePath: 'old.txt', kind: 'file' as const }]
    window.spacezero.files.listDirectory = vi.fn(async () => entries)
    const trashEntry = vi.fn(async () => {
      entries = []
    })
    const revealInSystemFileManager = vi.fn(async () => undefined)
    window.spacezero.files.trashEntry = trashEntry
    window.spacezero.files.revealInSystemFileManager = revealInSystemFileManager
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<FilesTool sessionId="session-context-actions" />)
    await screen.findByRole('treeitem', { name: 'old.txt' })

    fireEvent.contextMenu(
      screen
        .getByRole('treeitem', { name: 'old.txt' })
        .querySelector('[data-slot="context-menu-trigger"]') ?? screen.getByText('old.txt'),
      { clientX: 8, clientY: 8 }
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Show in Finder' }))
    await waitFor(() =>
      expect(revealInSystemFileManager).toHaveBeenCalledWith({
        context: { kind: 'project-session', sessionId: 'session-context-actions' },
        relativePath: 'old.txt'
      })
    )

    fireEvent.contextMenu(
      screen
        .getByRole('treeitem', { name: 'old.txt' })
        .querySelector('[data-slot="context-menu-trigger"]') ?? screen.getByText('old.txt'),
      { clientX: 8, clientY: 8 }
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await waitFor(() =>
      expect(trashEntry).toHaveBeenCalledWith({
        context: { kind: 'project-session', sessionId: 'session-context-actions' },
        relativePath: 'old.txt'
      })
    )
    expect(window.confirm).toHaveBeenCalledWith('Move old.txt to Trash?')
  })

  it('keeps the rename dialog open for unchanged names and filesystem failures', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'old.txt', relativePath: 'old.txt', kind: 'file' as const }
    ])
    const moveEntry = vi.fn(async () => {
      throw new Error('files.collision')
    })
    window.spacezero.files.moveEntry = moveEntry

    render(<FilesTool sessionId="session-rename-validation" />)
    fireEvent.contextMenu(
      (await screen.findByRole('treeitem', { name: 'old.txt' })).querySelector(
        '[data-slot="context-menu-trigger"]'
      ) ?? screen.getByText('old.txt'),
      { clientX: 8, clientY: 8 }
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveFocus()
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('old.txt')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    expect(await within(dialog).findByText('Choose a different name.')).toBeInTheDocument()
    expect(moveEntry).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'existing.txt' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    expect(
      await within(dialog).findByText('An item already exists at that path.')
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens a root New Folder dialog and creates the folder after confirmation', async () => {
    let entries: Array<{ name: string; relativePath: string; kind: 'directory' }> = []
    window.spacezero.files.listDirectory = vi.fn(async () => entries)
    const createEntry = vi.fn(async () => {
      entries = [{ name: 'notes', relativePath: 'notes', kind: 'directory' }]
    })
    window.spacezero.files.createEntry = createEntry

    render(<FilesTool sessionId="session-root-folder-create" />)
    await screen.findByText('This worktree is empty.')
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'New Folder' })).toBeInTheDocument()
    expect(within(dialog).getByText('Create in project root')).toBeInTheDocument()
    expect(within(dialog).getByPlaceholderText('Folder name')).toHaveFocus()
    fireEvent.change(within(dialog).getByPlaceholderText('Folder name'), {
      target: { value: 'notes' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(createEntry).toHaveBeenCalledWith({
        context: { kind: 'project-session', sessionId: 'session-root-folder-create' },
        relativePath: 'notes',
        kind: 'folder'
      })
    )
    expect(await screen.findByRole('treeitem', { name: 'notes' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the New Folder dialog open with actionable validation after invalid names and creation failures', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [])
    const createEntry = vi.fn(async () => {
      throw new Error('files.collision')
    })
    window.spacezero.files.createEntry = createEntry

    render(<FilesTool sessionId="session-create-error" />)
    await screen.findByText('This worktree is empty.')
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByPlaceholderText('Folder name'), {
      target: { value: '../bad' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(await within(dialog).findByText('Use a valid folder name.')).toBeInTheDocument()
    expect(createEntry).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByPlaceholderText('Folder name'), {
      target: { value: 'existing' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(
      await within(dialog).findByText('An item already exists at that path.')
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    {
      code: 'files.inaccessible',
      message:
        'Space Zero cannot access this destination. Check directory permissions and try again.'
    },
    {
      code: 'files.notFound',
      message: 'The destination folder no longer exists. Refresh the explorer and try again.'
    }
  ])(
    'keeps the New File dialog open with recovery guidance after $code create failures',
    async ({ code, message }) => {
      window.spacezero.files.listDirectory = vi.fn(async () => [])
      window.spacezero.files.createEntry = vi.fn(async () => {
        throw new Error(code)
      })

      render(<FilesTool sessionId={`session-create-${code}`} />)
      await screen.findByText('This worktree is empty.')
      fireEvent.click(screen.getByRole('button', { name: 'New file' }))

      const dialog = await screen.findByRole('dialog')
      fireEvent.change(within(dialog).getByPlaceholderText('File name'), {
        target: { value: 'new-note.md' }
      })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

      expect(await within(dialog).findByText(message)).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    }
  )

  it('requires a dirty choice before rename, saves first, and rewrites tab model identity', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'draft.md', relativePath: 'draft.md', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async ({ relativePath }) => ({
      name: relativePath.split('/').at(-1) ?? relativePath,
      relativePath,
      contentKind: 'text' as const,
      size: 6,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: '# Old',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    const saveDocument = vi.fn(async ({ content }) => ({
      status: 'saved' as const,
      document: {
        name: 'draft.md',
        relativePath: 'draft.md',
        contentKind: 'text' as const,
        size: content.length,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content,
        hasBom: false,
        lineEnding: 'lf' as const
      }
    }))
    const moveEntry = vi.fn(async () => undefined)
    window.spacezero.files.saveDocument = saveDocument
    window.spacezero.files.moveEntry = moveEntry
    vi.spyOn(window, 'prompt').mockReturnValueOnce('save')

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('draft.md'))
    fireEvent.change(await screen.findByLabelText('Rich Markdown editor'), {
      target: { value: '# Draft' }
    })
    fireEvent.contextMenu(
      screen
        .getByRole('treeitem', { name: 'draft.md' })
        .querySelector('[data-slot="context-menu-trigger"]') ?? screen.getByText('draft.md'),
      { clientX: 8, clientY: 8 }
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('draft.md')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'renamed.md' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))

    await waitFor(() => expect(moveEntry).toHaveBeenCalledTimes(1))
    expect(saveDocument).toHaveBeenCalledTimes(1)
    expect(moveEntry).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-1' },
      sourcePath: 'draft.md',
      destinationPath: 'renamed.md'
    })
    expect(
      screen.getByLabelText('Rich Markdown editor').closest('.rich-markdown-editor')
    ).toHaveAttribute('data-document-relative-path', 'renamed.md')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByDisplayValue('# Old')).toBeInTheDocument()
  })

  it('keeps the rename dialog open when dirty-file save preparation fails', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'draft.md', relativePath: 'draft.md', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async ({ relativePath }) => ({
      name: relativePath.split('/').at(-1) ?? relativePath,
      relativePath,
      contentKind: 'text' as const,
      size: 6,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: '# Old',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    const saveDocument = vi.fn(async () => ({
      status: 'conflict' as const,
      document: {
        name: 'draft.md',
        relativePath: 'draft.md',
        contentKind: 'text' as const,
        size: 8,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content: '# Remote',
        hasBom: false,
        lineEnding: 'lf' as const
      }
    }))
    const moveEntry = vi.fn(async () => undefined)
    window.spacezero.files.saveDocument = saveDocument
    window.spacezero.files.moveEntry = moveEntry
    vi.spyOn(window, 'prompt').mockReturnValueOnce('save')

    render(<FilesTool sessionId="session-dirty-rename-conflict" />)
    fireEvent.click(await screen.findByText('draft.md'))
    fireEvent.change(await screen.findByLabelText('Rich Markdown editor'), {
      target: { value: '# Draft' }
    })
    fireEvent.contextMenu(
      screen
        .getByRole('treeitem', { name: 'draft.md' })
        .querySelector('[data-slot="context-menu-trigger"]') ?? screen.getByText('draft.md'),
      { clientX: 8, clientY: 8 }
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'renamed.md' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))

    expect(
      await within(dialog).findByText('Save or discard changes before renaming.')
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Rename' })).toBeEnabled()
    expect(saveDocument).toHaveBeenCalledTimes(1)
    expect(moveEntry).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('hides tab strip scrollbars while preserving active tab scrolling and dirty-only tab indicators', async () => {
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    window.spacezero.files.listDirectory = vi.fn(async () =>
      ['one.txt', 'two.txt', 'three.txt', 'four.txt'].map((name) => ({
        name,
        relativePath: name,
        kind: 'file' as const
      }))
    )
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

    try {
      render(<FilesTool sessionId="session-tabs" />)
      for (const fileName of ['one.txt', 'two.txt', 'three.txt', 'four.txt']) {
        fireEvent.click(await screen.findByText(fileName))
        fireEvent.doubleClick(await screen.findByRole('tab', { name: new RegExp(fileName) }))
      }

      const tabList = screen.getByRole('tablist', { name: 'Open files' })
      expect(tabList).toHaveClass('[scrollbar-width:none]')
      expect(tabList).toHaveClass('[&::-webkit-scrollbar]:hidden')
      expect(tabList).toHaveClass('overflow-x-auto')
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Save All' })).not.toBeInTheDocument()
      expect(screen.queryByText('Saved')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /one\.txt/ })).not.toHaveTextContent('●')

      fireEvent.click(screen.getByRole('tab', { name: /two\.txt/ }))
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
      fireEvent.change(await screen.findByLabelText('Monaco editor'), {
        target: { value: 'two draft' }
      })

      expect(screen.getByRole('tab', { name: /●\s*two\.txt/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /one\.txt/ })).not.toHaveTextContent('●')
      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView
    }
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

    expect(screen.queryByRole('button', { name: 'Save All' })).not.toBeInTheDocument()
    invokeRegisteredSaveAllCommand()

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
    expect(screen.queryByRole('button', { name: 'Save All' })).not.toBeInTheDocument()
    invokeRegisteredSaveAllCommand()

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

    await waitFor(() => expect(screen.getAllByText(/changed on disk/i).length).toBeGreaterThan(0))
    expect(screen.getByDisplayValue('draft')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /●\s*README\.md/ })).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('completes confirmed overwrite and recreate resolutions through the component save path', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
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
    const saveDocument = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'conflict' as const,
        document: {
          name: 'README.md',
          relativePath: 'README.md',
          contentKind: 'text' as const,
          size: 8,
          modifiedAt: new Date(1).toISOString(),
          revision: 'disk-revision',
          content: 'external',
          hasBom: false,
          lineEnding: 'lf' as const
        }
      })
      .mockResolvedValueOnce({
        status: 'saved' as const,
        document: {
          name: 'README.md',
          relativePath: 'README.md',
          contentKind: 'text' as const,
          size: 5,
          modifiedAt: new Date(2).toISOString(),
          revision: 'overwrite-revision',
          content: 'draft',
          hasBom: false,
          lineEnding: 'lf' as const
        }
      })
      .mockResolvedValueOnce({
        status: 'saved' as const,
        document: {
          name: 'README.md',
          relativePath: 'README.md',
          contentKind: 'text' as const,
          size: 9,
          modifiedAt: new Date(3).toISOString(),
          revision: 'recreate-revision',
          content: 'recreated',
          hasBom: false,
          lineEnding: 'lf' as const
        }
      })
    window.spacezero.files.saveDocument = saveDocument
    let observationListener:
      Parameters<typeof window.spacezero.files.onObservationEvent>[0] | undefined
    window.spacezero.files.onObservationEvent = vi.fn((listener) => {
      observationListener = listener
      return () => undefined
    })

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('README.md'))
    fireEvent.change(await screen.findByLabelText('Rich Markdown editor'), {
      target: { value: 'draft' }
    })
    fireEvent.keyDown(screen.getByLabelText('Rich Markdown editor'), { key: 's', metaKey: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Overwrite disk' }))

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /README\.md/ })).not.toHaveTextContent('●')
    )
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(saveDocument).toHaveBeenNthCalledWith(2, {
      context: { kind: 'project-session', sessionId: 'session-1' },
      relativePath: 'README.md',
      content: 'draft',
      expectedRevision: 'revision-1',
      conflictResolution: { kind: 'overwrite', acknowledgedRevision: 'disk-revision' }
    })

    act(() =>
      observationListener?.({
        subscriptionId: 'session-1:files-observation',
        contextKey: 'session-1',
        kind: 'deleted',
        relativePath: 'README.md'
      })
    )
    fireEvent.change(await screen.findByLabelText('Rich Markdown editor'), {
      target: { value: 'recreated' }
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Recreate file' }))

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /README\.md/ })).not.toHaveTextContent('●')
    )
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(saveDocument).toHaveBeenNthCalledWith(3, {
      context: { kind: 'project-session', sessionId: 'session-1' },
      relativePath: 'README.md',
      content: 'recreated',
      expectedRevision: 'overwrite-revision',
      conflictResolution: { kind: 'recreate', acknowledgedMissingRevision: 'overwrite-revision' }
    })
    confirm.mockRestore()
  })

  it('keeps resolution drafts actionable when overwrite conflicts and recreate save rejects', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
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
      .mockResolvedValueOnce({
        status: 'conflict' as const,
        document: {
          name: 'README.md',
          relativePath: 'README.md',
          contentKind: 'text' as const,
          size: 8,
          modifiedAt: new Date(1).toISOString(),
          revision: 'disk-revision',
          content: 'external',
          hasBom: false,
          lineEnding: 'lf' as const
        }
      })
      .mockResolvedValueOnce({
        status: 'conflict' as const,
        document: {
          name: 'README.md',
          relativePath: 'README.md',
          contentKind: 'text' as const,
          size: 10,
          modifiedAt: new Date(2).toISOString(),
          revision: 'newer-revision',
          content: 'newer disk',
          hasBom: false,
          lineEnding: 'lf' as const
        }
      })
      .mockRejectedValueOnce(new Error('files.writeFailed'))
    let observationListener:
      Parameters<typeof window.spacezero.files.onObservationEvent>[0] | undefined
    window.spacezero.files.onObservationEvent = vi.fn((listener) => {
      observationListener = listener
      return () => undefined
    })

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('README.md'))
    fireEvent.change(await screen.findByLabelText('Rich Markdown editor'), {
      target: { value: 'draft' }
    })
    fireEvent.keyDown(screen.getByLabelText('Rich Markdown editor'), { key: 's', metaKey: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Overwrite disk' }))

    await waitFor(() => expect(screen.getAllByText(/changed on disk/i).length).toBeGreaterThan(0))
    expect(screen.getByDisplayValue('draft')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /●\s*README\.md/ })).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()

    act(() =>
      observationListener?.({
        subscriptionId: 'session-1:files-observation',
        contextKey: 'session-1',
        kind: 'deleted',
        relativePath: 'README.md'
      })
    )
    fireEvent.change(await screen.findByLabelText('Rich Markdown editor'), {
      target: { value: 'recreate draft' }
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Recreate file' }))

    expect(
      await screen.findByText('Couldn’t save this file. Your changes are still in memory.')
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue('recreate draft')).toBeInTheDocument()
  })

  it('applies only the latest observation read and treats non-delete failures as reload errors', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    let resolveStale:
      | ((document: Awaited<ReturnType<typeof window.spacezero.files.openDocument>>) => void)
      | undefined
    const staleRead = new Promise<Awaited<ReturnType<typeof window.spacezero.files.openDocument>>>(
      (resolve) => {
        resolveStale = resolve
      }
    )
    window.spacezero.files.openDocument = vi
      .fn()
      .mockResolvedValueOnce({
        name: 'README.md',
        relativePath: 'README.md',
        contentKind: 'text' as const,
        size: 5,
        modifiedAt: new Date(0).toISOString(),
        revision: 'revision-1',
        content: 'saved',
        hasBom: false,
        lineEnding: 'lf' as const
      })
      .mockImplementationOnce(async () => staleRead)
      .mockResolvedValueOnce({
        name: 'README.md',
        relativePath: 'README.md',
        contentKind: 'text' as const,
        size: 6,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-3',
        content: 'latest',
        hasBom: false,
        lineEnding: 'lf' as const
      })
      .mockRejectedValueOnce(new Error('files.inaccessible'))
    const observationListeners: Parameters<typeof window.spacezero.files.onObservationEvent>[0][] =
      []
    window.spacezero.files.onObservationEvent = vi.fn((listener) => {
      observationListeners.push(listener)
      return () => undefined
    })

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('README.md'))
    expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue('saved')

    act(() => {
      observationListeners.at(-1)?.({
        subscriptionId: 'session-1:files-observation',
        contextKey: 'session-1',
        kind: 'modified',
        relativePath: 'README.md'
      })
      observationListeners.at(-1)?.({
        subscriptionId: 'session-1:files-observation',
        contextKey: 'session-1',
        kind: 'modified',
        relativePath: 'README.md'
      })
    })
    expect(await screen.findByDisplayValue('latest')).toBeInTheDocument()
    resolveStale?.({
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text',
      size: 5,
      modifiedAt: new Date(2).toISOString(),
      revision: 'revision-2',
      content: 'stale',
      hasBom: false,
      lineEnding: 'lf'
    })
    await Promise.resolve()
    expect(screen.getByDisplayValue('latest')).toBeInTheDocument()

    act(() => {
      observationListeners.at(-1)?.({
        subscriptionId: 'session-1:files-observation',
        contextKey: 'session-1',
        kind: 'modified',
        relativePath: 'README.md'
      })
    })
    expect(
      await screen.findByText(
        'Space Zero cannot access this file. Check its permissions and try again.'
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Deleted on disk. Your buffer is still open.')
    ).not.toBeInTheDocument()
  })

  it.each([
    ['reload', 'files.notFound'],
    ['reload', 'files.inaccessible'],
    ['overwrite', 'files.notFound'],
    ['overwrite', 'files.inaccessible'],
    ['recreate', 'files.notFound'],
    ['recreate', 'files.inaccessible']
  ] as const)(
    'ignores stale observation %s read rejection with %s after a user resolution',
    async (resolution, staleErrorCode) => {
      const sessionId = `session-stale-${resolution}-${staleErrorCode}`
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
      window.spacezero.files.listDirectory = vi.fn(async () => [
        { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
      ])
      let rejectStaleRead: ((error: Error) => void) | undefined
      const staleRead = new Promise<
        Awaited<ReturnType<typeof window.spacezero.files.openDocument>>
      >((_resolve, reject) => {
        rejectStaleRead = reject
      })
      window.spacezero.files.openDocument = vi
        .fn()
        .mockResolvedValueOnce({
          name: 'README.md',
          relativePath: 'README.md',
          contentKind: 'text' as const,
          size: 5,
          modifiedAt: new Date(0).toISOString(),
          revision: 'revision-1',
          content: 'saved',
          hasBom: false,
          lineEnding: 'lf' as const
        })
        .mockImplementationOnce(async () => staleRead)
        .mockResolvedValueOnce({
          name: 'README.md',
          relativePath: 'README.md',
          contentKind: 'text' as const,
          size: 8,
          modifiedAt: new Date(1).toISOString(),
          revision: 'reload-revision',
          content: 'reloaded',
          hasBom: false,
          lineEnding: 'lf' as const
        })
      window.spacezero.files.saveDocument = vi.fn(async ({ content, conflictResolution }) => ({
        status: 'saved' as const,
        document: {
          name: 'README.md',
          relativePath: 'README.md',
          contentKind: 'text' as const,
          size: content.length,
          modifiedAt: new Date(2).toISOString(),
          revision:
            conflictResolution?.kind === 'recreate' ? 'recreate-revision' : 'overwrite-revision',
          content,
          hasBom: false,
          lineEnding: 'lf' as const
        }
      }))
      let observationListener:
        Parameters<typeof window.spacezero.files.onObservationEvent>[0] | undefined
      window.spacezero.files.onObservationEvent = vi.fn((listener) => {
        observationListener = listener
        return () => undefined
      })

      render(<FilesTool sessionId={sessionId} />)
      fireEvent.click(await screen.findByText('README.md'))
      expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue('saved')

      act(() =>
        observationListener?.({
          subscriptionId: `${sessionId}:files-observation`,
          contextKey: sessionId,
          kind: 'modified',
          relativePath: 'README.md'
        })
      )
      await waitFor(() => expect(window.spacezero.files.openDocument).toHaveBeenCalledTimes(2))

      if (resolution === 'reload') {
        act(() =>
          useFilesStore.getState().markExternalConflict(sessionId, 'README.md', 'disk-revision')
        )
        fireEvent.click(await screen.findByRole('button', { name: 'Reload from disk' }))
        expect(await screen.findByDisplayValue('reloaded')).toBeInTheDocument()
      } else if (resolution === 'overwrite') {
        fireEvent.change(screen.getByLabelText('Rich Markdown editor'), {
          target: { value: 'overwrite draft' }
        })
        act(() =>
          useFilesStore.getState().markExternalConflict(sessionId, 'README.md', 'disk-revision')
        )
        fireEvent.click(await screen.findByRole('button', { name: 'Overwrite disk' }))
        expect(await screen.findByDisplayValue('overwrite draft')).toBeInTheDocument()
        await waitFor(() =>
          expect(screen.getByRole('tab', { name: /README\.md/ })).not.toHaveTextContent('●')
        )
        expect(screen.queryByText('Saved')).not.toBeInTheDocument()
      } else {
        fireEvent.change(screen.getByLabelText('Rich Markdown editor'), {
          target: { value: 'recreate draft' }
        })
        act(() => useFilesStore.getState().markDeletedOnDisk(sessionId, 'README.md'))
        fireEvent.click(await screen.findByRole('button', { name: 'Recreate file' }))
        expect(await screen.findByDisplayValue('recreate draft')).toBeInTheDocument()
        await waitFor(() =>
          expect(screen.getByRole('tab', { name: /README\.md/ })).not.toHaveTextContent('●')
        )
        expect(screen.queryByText('Saved')).not.toBeInTheDocument()
      }

      await act(async () => {
        rejectStaleRead?.(new Error(staleErrorCode))
        await Promise.resolve()
      })

      const expectedValue =
        resolution === 'reload'
          ? 'reloaded'
          : resolution === 'overwrite'
            ? 'overwrite draft'
            : 'recreate draft'
      expect(screen.getByDisplayValue(expectedValue)).toBeInTheDocument()
      expect(
        screen.queryByText('Deleted on disk. Your buffer is still open.')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText(
          'Space Zero cannot access this file. Check its permissions and try again.'
        )
      ).not.toBeInTheDocument()
      confirm.mockRestore()
    }
  )

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

  it('consumes external line targets after reveal so Markdown can return to Rich mode with its buffer', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text' as const,
      size: 23,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: '# Title\n\nbody line',
      hasBom: false,
      lineEnding: 'lf' as const
    }))

    render(<FilesTool sessionId="session-line-rich" />)

    await act(async () => {
      await openFilesLocation({
        contextKey: 'session-line-rich',
        ipcContext: { kind: 'project-session', sessionId: 'session-line-rich' },
        relativePath: 'README.md',
        line: 3
      })
    })

    await waitFor(() => expect(monacoMock.revealLineInCenter).toHaveBeenCalledWith(3))
    expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue(
      '# Title\n\nbody line'
    )
    fireEvent.change(screen.getByLabelText('Rich Markdown editor'), {
      target: { value: '# Dirty' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    expect(await screen.findByLabelText('Monaco editor')).toHaveDisplayValue('# Dirty')
    fireEvent.click(screen.getByRole('button', { name: 'Rich' }))
    expect(await screen.findByLabelText('Rich Markdown editor')).toHaveDisplayValue('# Dirty')
  })

  it('keeps unsupported external Files handoffs in the current tool and allows a later retry', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'asset.bin', relativePath: 'asset.bin', kind: 'file' as const }
    ])
    const openDocument = vi
      .fn()
      .mockResolvedValueOnce({
        name: 'asset.bin',
        relativePath: 'asset.bin',
        contentKind: 'binary' as const,
        size: 4,
        modifiedAt: new Date(0).toISOString(),
        revision: 'binary-revision'
      })
      .mockResolvedValueOnce({
        name: 'asset.bin',
        relativePath: 'asset.bin',
        contentKind: 'text' as const,
        size: 5,
        modifiedAt: new Date(1).toISOString(),
        revision: 'text-revision',
        content: 'text!',
        hasBom: false,
        lineEnding: 'lf' as const
      })
    window.spacezero.files.openDocument = openDocument

    const first = await openFilesLocation({
      contextKey: 'session-unsupported-retry',
      ipcContext: { kind: 'project-session', sessionId: 'session-unsupported-retry' },
      relativePath: 'asset.bin'
    })
    const second = await openFilesLocation({
      contextKey: 'session-unsupported-retry',
      ipcContext: { kind: 'project-session', sessionId: 'session-unsupported-retry' },
      relativePath: 'asset.bin'
    })

    expect(first).toEqual({
      status: 'failed',
      message: 'This file is binary and cannot be edited in Files.'
    })
    expect(second).toEqual({ status: 'opened' })
    expect(openDocument).toHaveBeenCalledTimes(2)
    expect(useFilesStore.getState().contexts['session-unsupported-retry'].tabs[0]).toMatchObject({
      status: 'ready',
      draft: 'text!'
    })
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

  it('renders safe image previews with bounded metadata and main-owned Reveal', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'photo.png', relativePath: 'photo.png', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'photo.png',
      relativePath: 'photo.png',
      contentKind: 'image' as const,
      classification: 'image' as const,
      mediaType: 'image/png' as const,
      dataUrl,
      size: 9,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1'
    }))
    window.spacezero.files.revealInSystemFileManager = vi.fn(async () => undefined)

    render(<FilesTool sessionId="session-1" />)
    fireEvent.click(await screen.findByText('photo.png'))

    const image = await screen.findByRole('img', { name: 'photo.png' })
    expect(image).toHaveAttribute('src', dataUrl)
    fireEvent.click(screen.getByRole('button', { name: 'Reveal in system file manager' }))
    expect(window.spacezero.files.revealInSystemFileManager).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-1' },
      relativePath: 'photo.png'
    })
  })

  it('opens binary and oversized files as non-editable metadata', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'archive.bin', relativePath: 'archive.bin', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'archive.bin',
      relativePath: 'archive.bin',
      contentKind: 'binary' as const,
      classification: 'binary' as const,
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
