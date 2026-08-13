/* eslint-disable react-refresh/only-export-components -- visual fixture components are intentionally co-located with fixture props. */
import { FileTree as TreesFileTree, useFileTree } from '@pierre/trees/react'

import {
  FilesEditorView,
  type FilesEditorViewModel,
  type FilesToolViewProps
} from './files-tool-view'

const noop = (): void => undefined

function FixtureTree({ filtered = false }: { filtered?: boolean }): React.JSX.Element {
  const { model } = useFileTree({
    density: 'compact',
    fileTreeSearchMode: 'hide-non-matches',
    flattenEmptyDirectories: true,
    icons: { set: 'complete', colored: true },
    id: filtered ? 'files-story-filtered-tree' : 'files-story-nested-tree',
    initialExpansion: 'open',
    paths: filtered
      ? ['docs/', 'docs/context.md']
      : [
          '.agents/',
          '.agents/skills/',
          '.agents/skills/implement-with-tdd/',
          '.agents/skills/implement-with-tdd/SKILL.md',
          'docs/',
          'docs/context.md',
          'src/',
          'src/features/',
          'src/features/files/',
          'src/features/files/files-tool.tsx',
          'package.json',
          'README.md'
        ],
    search: false,
    stickyFolders: true
  })

  return (
    <TreesFileTree
      aria-label="Project files"
      className="pt-1"
      model={model}
      style={{ height: 552, width: '100%' }}
    />
  )
}

function SourceEditorFixture({ markdown = false }: { markdown?: boolean }): React.JSX.Element {
  const source = markdown
    ? `# Files in Space Zero\n\nUse the explorer to open a file in a preview tab.\n\n- Preview tabs are replaceable\n- Edited tabs become permanent`
    : `export function FilesToolView() {\n  return <section aria-label="Files explorer" />\n}`
  return (
    <div
      className="h-full overflow-auto bg-muted/20 p-4 font-mono text-xs leading-6"
      aria-label="Source editor"
    >
      <pre className="whitespace-pre-wrap">{source}</pre>
    </div>
  )
}

function editor(
  state: Omit<Extract<FilesEditorViewModel, { status: 'ready' }>, 'content'>
): React.JSX.Element {
  return (
    <FilesEditorView
      state={{ ...state, content: <SourceEditorFixture markdown={state.name.endsWith('.md')} /> }}
    />
  )
}

export const baseFilesToolFixture = {
  explorerCollapsed: false,
  explorerWidth: 252,
  searchMode: 'files',
  filesSearchQuery: '',
  contentSearchQuery: '',
  treeState: { status: 'ready', content: <FixtureTree /> },
  contentSearchState: { status: 'idle' },
  editorContent: editor({
    status: 'ready',
    name: 'files-tool.tsx',
    preview: false
  }),
  createDialog: null,
  closePromptFileName: null,
  onCollapseAll: noop,
  onCollapseExplorer: noop,
  onContentSearchChange: noop,
  onCreateDialogCancel: noop,
  onCreateDialogChange: noop,
  onCreateDialogSubmit: noop,
  onCreateFile: noop,
  onCreateFolder: noop,
  onEditorFocusChange: noop,
  onEditorKeyDown: noop,
  onExpandExplorer: noop,
  onExplorerKeyDown: noop,
  onExplorerPointerDown: noop,
  onExplorerScroll: noop,
  onFilesSearchChange: noop,
  onOpenSearchResult: noop,
  onRetryContentSearch: noop,
  onRetryTree: noop,
  onSearchModeChange: noop,
  onSubmitContentSearch: noop,
  onClosePromptCancel: noop,
  onClosePromptDiscard: noop,
  onClosePromptSave: noop
} satisfies FilesToolViewProps

export const noFileSelectedFilesToolFixture = {
  ...baseFilesToolFixture,
  editorContent: <FilesEditorView state={{ status: 'empty', emptyRoot: false }} />
} satisfies FilesToolViewProps

export const treeLoadingFilesToolFixture = {
  ...baseFilesToolFixture,
  treeState: { status: 'loading' }
} satisfies FilesToolViewProps

export const treeErrorFilesToolFixture = {
  ...baseFilesToolFixture,
  treeState: { status: 'error', message: 'Couldn’t read this directory. Try again.' }
} satisfies FilesToolViewProps

export const emptyTreeFilesToolFixture = {
  ...baseFilesToolFixture,
  treeState: { status: 'empty' },
  editorContent: <FilesEditorView state={{ status: 'empty', emptyRoot: true }} />
} satisfies FilesToolViewProps

export const nestedTreeFilesToolFixture = baseFilesToolFixture

export const fileNameSearchFilesToolFixture = {
  ...baseFilesToolFixture,
  filesSearchQuery: 'context',
  treeState: { status: 'ready', content: <FixtureTree filtered /> }
} satisfies FilesToolViewProps

export const fileNameSearchEmptyFilesToolFixture = {
  ...baseFilesToolFixture,
  filesSearchQuery: 'does-not-exist',
  treeState: {
    status: 'ready',
    content: <div aria-label="No matching files" className="h-full" />
  }
} satisfies FilesToolViewProps

export const contentSearchLoadingFilesToolFixture = {
  ...baseFilesToolFixture,
  searchMode: 'contents',
  contentSearchQuery: 'workspace',
  contentSearchState: { status: 'loading', query: 'workspace' }
} satisfies FilesToolViewProps

export const contentSearchResultsFilesToolFixture = {
  ...baseFilesToolFixture,
  searchMode: 'contents',
  contentSearchQuery: 'workspace',
  contentSearchState: {
    status: 'ready',
    query: 'workspace',
    results: [
      {
        relativePath: 'docs/context.md',
        name: 'context.md',
        snippets: [{ line: 12, column: 18, text: 'Space Zero is an agentic desktop workspace.' }]
      },
      {
        relativePath: 'src/features/files/files-tool.tsx',
        name: 'files-tool.tsx',
        snippets: [{ line: 132, column: 3, text: 'aria-label="Files explorer"' }]
      }
    ]
  }
} satisfies FilesToolViewProps

export const contentSearchEmptyFilesToolFixture = {
  ...contentSearchLoadingFilesToolFixture,
  contentSearchState: { status: 'ready', query: 'workspace', results: [] }
} satisfies FilesToolViewProps

export const contentSearchErrorFilesToolFixture = {
  ...contentSearchLoadingFilesToolFixture,
  contentSearchState: {
    status: 'error',
    query: 'workspace',
    message: 'Couldn’t search these files. Adjust the query or try again.'
  }
} satisfies FilesToolViewProps

export const previewTabFilesToolFixture = {
  ...baseFilesToolFixture,
  editorContent: editor({ status: 'ready', name: 'README.md', preview: true })
} satisfies FilesToolViewProps

export const permanentTabFilesToolFixture = {
  ...baseFilesToolFixture,
  editorContent: editor({ status: 'ready', name: 'README.md', preview: false })
} satisfies FilesToolViewProps

export const dirtyTabFilesToolFixture = {
  ...baseFilesToolFixture,
  editorContent: editor({ status: 'ready', name: 'README.md', preview: false, dirty: true })
} satisfies FilesToolViewProps

export const missingFileFilesToolFixture = {
  ...baseFilesToolFixture,
  editorContent: (
    <FilesEditorView
      state={{
        status: 'ready',
        name: 'removed-file.ts',
        preview: false,
        externalStatus: 'deleted',
        content: <SourceEditorFixture />
      }}
    />
  )
} satisfies FilesToolViewProps

export const conflictFilesToolFixture = {
  ...baseFilesToolFixture,
  editorContent: (
    <FilesEditorView
      state={{
        status: 'ready',
        name: 'README.md',
        preview: false,
        dirty: true,
        externalStatus: 'conflict',
        content: <SourceEditorFixture markdown />
      }}
    />
  )
} satisfies FilesToolViewProps

export const createFileDialogFilesToolFixture = {
  ...baseFilesToolFixture,
  createDialog: {
    kind: 'file',
    destination: 'src/features/files',
    name: 'files-view.tsx',
    error: null,
    status: 'idle'
  }
} satisfies FilesToolViewProps

export const createFolderDialogFilesToolFixture = {
  ...baseFilesToolFixture,
  createDialog: {
    kind: 'folder',
    destination: 'src/features',
    name: 'files',
    error: null,
    status: 'idle'
  }
} satisfies FilesToolViewProps

export const unsavedChangesDialogFilesToolFixture = {
  ...dirtyTabFilesToolFixture,
  closePromptFileName: 'README.md'
} satisfies FilesToolViewProps

export const richMarkdownFilesEditorFixture = {
  ...baseFilesToolFixture,
  editorContent: editor({
    status: 'ready',
    name: 'README.md',
    preview: false,
    supportsRichMode: true,
    activeMode: 'rich'
  })
} satisfies FilesToolViewProps
