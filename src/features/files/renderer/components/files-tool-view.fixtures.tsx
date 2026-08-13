/* eslint-disable react-refresh/only-export-components -- visual fixture components are intentionally co-located with fixture props. */
import { FileCode } from '@phosphor-icons/react'
import { useFileTree } from '@pierre/trees/react'

import { RichMarkdownEditor } from '@renderer/components/rich-markdown-editor'
import { richMarkdownEditorFixture } from '@renderer/components/rich-markdown-editor.fixtures'
import {
  SidePaneShellView,
  type SidePaneCategoryDescriptor,
  type SidePaneTab
} from '../../../side-pane/renderer'
import { FilesTabIcon } from './files-tab-icon'
import {
  FilesEditorView,
  FilesToolView,
  FilesTreeView,
  type FilesEditorViewModel,
  type FilesToolViewProps
} from './files-tool-view'

const noop = (): void => undefined

function FixtureTree({ searchQuery = '' }: { searchQuery?: string }): React.JSX.Element {
  const { model } = useFileTree({
    density: 'compact',
    fileTreeSearchMode: 'hide-non-matches',
    flattenEmptyDirectories: true,
    icons: { set: 'complete', colored: true },
    id: `files-story-tree-${searchQuery || 'nested'}`,
    initialExpansion: 'open',
    initialSearchQuery: searchQuery,
    paths: [
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
    <FilesTreeView
      aria-label="Project files"
      className="pt-1"
      height={552}
      model={model}
      searchQuery={searchQuery}
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

export type FilesToolSidePaneFixtureProps = FilesToolViewProps & {
  sidePaneTab: SidePaneTab
}

const filesCategory: SidePaneCategoryDescriptor = {
  id: 'files',
  label: 'Files',
  available: true,
  icon: FileCode,
  renderTabIcon: (tab) =>
    tab.label ? <FilesTabIcon fileName={tab.label} /> : <FileCode aria-hidden className="size-4" />
}

export function FilesToolSidePaneFixture({
  sidePaneTab,
  ...filesToolProps
}: FilesToolSidePaneFixtureProps): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[620px] min-w-0">
      <SidePaneShellView
        activeContent={<FilesToolView {...filesToolProps} />}
        activeTabId={sidePaneTab.id}
        canOpen
        categories={[filesCategory]}
        categoryMru={{ files: sidePaneTab.id }}
        contextKey="session:files-story"
        isOpen
        maxWidth={960}
        minWidth={600}
        renderedWidth={860}
        tabs={[sidePaneTab]}
        onActivateTab={noop}
        onCloseTab={noop}
        onCreateCategory={noop}
        onOpenCategory={noop}
        onReorderTab={noop}
      >
        <main
          aria-label="Project Session workspace"
          className="flex min-h-0 min-w-[240px] flex-1 items-center justify-center bg-muted/20 p-6 text-center text-xs text-muted-foreground"
        >
          Project Session
        </main>
      </SidePaneShellView>
    </div>
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
  sidePaneTab: {
    id: 'files:files-tool.tsx',
    categoryId: 'files',
    resourceId: 'src/features/files/files-tool.tsx',
    label: 'files-tool.tsx'
  },
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
} satisfies FilesToolSidePaneFixtureProps

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
  treeState: { status: 'ready', content: <FixtureTree searchQuery="context" /> }
} satisfies FilesToolSidePaneFixtureProps

export const fileNameSearchEmptyFilesToolFixture = {
  ...baseFilesToolFixture,
  filesSearchQuery: 'does-not-exist',
  treeState: {
    status: 'ready',
    content: <FixtureTree searchQuery="does-not-exist" />
  }
} satisfies FilesToolSidePaneFixtureProps

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
  sidePaneTab: {
    id: 'files:README.md',
    categoryId: 'files',
    resourceId: 'README.md',
    label: 'README.md',
    preview: true
  },
  editorContent: editor({ status: 'ready', name: 'README.md', preview: true })
} satisfies FilesToolSidePaneFixtureProps

export const permanentTabFilesToolFixture = {
  ...baseFilesToolFixture,
  sidePaneTab: {
    id: 'files:README.md',
    categoryId: 'files',
    resourceId: 'README.md',
    label: 'README.md'
  },
  editorContent: editor({ status: 'ready', name: 'README.md', preview: false })
} satisfies FilesToolSidePaneFixtureProps

export const dirtyTabFilesToolFixture = {
  ...permanentTabFilesToolFixture,
  sidePaneTab: { ...permanentTabFilesToolFixture.sidePaneTab, dirty: true }
} satisfies FilesToolSidePaneFixtureProps

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
  ...permanentTabFilesToolFixture,
  editorContent: (
    <FilesEditorView
      state={{
        status: 'ready',
        name: 'README.md',
        preview: false,
        supportsRichMode: true,
        activeMode: 'rich',
        content: <RichMarkdownEditor {...richMarkdownEditorFixture} />
      }}
    />
  )
} satisfies FilesToolSidePaneFixtureProps
