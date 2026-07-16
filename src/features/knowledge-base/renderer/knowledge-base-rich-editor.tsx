import { useMemo } from 'react'
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  Separator,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  frontmatterPlugin,
  headingsPlugin,
  jsxPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  type RealmPlugin
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'

export function KnowledgeBaseRichEditor({
  markdown,
  onChange
}: {
  markdown: string
  onChange: (markdown: string) => void
}): React.JSX.Element {
  const plugins = useMemo<RealmPlugin[]>(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      tablePlugin(),
      frontmatterPlugin(),
      jsxPlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: 'plaintext' }),
      codeMirrorPlugin({
        codeBlockLanguages: {
          plaintext: 'Plain text',
          bash: 'Bash',
          css: 'CSS',
          html: 'HTML',
          javascript: 'JavaScript',
          json: 'JSON',
          markdown: 'Markdown',
          typescript: 'TypeScript'
        }
      }),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <BoldItalicUnderlineToggles />
            <CodeToggle />
            <Separator />
            <ListsToggle />
            <CreateLink />
            <InsertTable />
            <InsertCodeBlock />
            <InsertThematicBreak />
          </>
        )
      })
    ],
    []
  )

  return (
    <MDXEditor
      className="knowledge-base-rich-editor min-h-0 flex-1 overflow-auto rounded-md border bg-background"
      contentEditableClassName="knowledge-base-rich-content min-h-full px-8 py-6 text-foreground"
      markdown={markdown}
      plugins={plugins}
      onChange={(nextMarkdown, initialMarkdownNormalize) => {
        if (!initialMarkdownNormalize) onChange(nextMarkdown)
      }}
      onError={() => undefined}
    />
  )
}
