import { act, fireEvent, render, screen } from '@testing-library/react'

import type { KnowledgeBaseDocument } from '../shared'
import { KnowledgeBaseDocumentEditor } from './knowledge-base-document-editor'

vi.mock('./knowledge-base-rich-editor', () => ({
  KnowledgeBaseRichEditor: ({
    markdown,
    onChange
  }: {
    markdown: string
    onChange: (markdown: string) => void
  }) => (
    <textarea
      aria-label="Rich Markdown editor"
      value={markdown}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}))

const markdownDocument: KnowledgeBaseDocument = {
  name: 'note.mdx',
  relativePath: 'docs/note.mdx',
  contentKind: 'markdown',
  size: 15,
  modifiedAt: new Date(0).toISOString(),
  revision: 'revision-1',
  content: '# Durable note'
}

describe('KnowledgeBaseDocumentEditor', () => {
  afterEach(() => vi.useRealTimers())

  it('opens Markdown and MDX in rich mode by default with a source toggle', () => {
    render(<KnowledgeBaseDocumentEditor document={markdownDocument} />)

    expect(screen.getByRole('textbox', { name: 'Rich Markdown editor' })).toHaveValue(
      '# Durable note'
    )
    expect(screen.getByRole('button', { name: 'Rich' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('textbox', { name: 'Edit note.mdx' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    expect(screen.getByRole('textbox', { name: 'Edit note.mdx' })).toHaveValue('# Durable note')
  })

  it('preserves one Markdown source while toggling between rich and raw modes', () => {
    render(<KnowledgeBaseDocumentEditor document={markdownDocument} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Rich Markdown editor' }), {
      target: { value: '# Edited in rich mode' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    const source = screen.getByRole('textbox', { name: 'Edit note.mdx' })
    expect(source).toHaveValue('# Edited in rich mode')

    fireEvent.change(source, { target: { value: '# Exact **Markdown**' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rich' }))
    expect(screen.getByRole('textbox', { name: 'Rich Markdown editor' })).toHaveValue(
      '# Exact **Markdown**'
    )
  })

  it('autosaves edits made in rich mode to the same Markdown file', async () => {
    vi.useFakeTimers()
    const saveDocument = vi.fn(async () => ({
      status: 'saved' as const,
      document: {
        ...markdownDocument,
        revision: 'revision-2',
        content: '# Rich autosave'
      }
    }))
    window.spacezero.knowledgeBase.saveDocument = saveDocument

    render(<KnowledgeBaseDocumentEditor document={markdownDocument} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Rich Markdown editor' }), {
      target: { value: '# Rich autosave' }
    })
    await act(async () => {
      vi.advanceTimersByTime(650)
      await Promise.resolve()
    })

    expect(saveDocument).toHaveBeenCalledWith({
      relativePath: 'docs/note.mdx',
      content: '# Rich autosave',
      expectedRevision: 'revision-1'
    })
  })

  it('keeps plain text files in source mode without rich controls', () => {
    render(
      <KnowledgeBaseDocumentEditor
        document={{ ...markdownDocument, name: 'notes.txt', relativePath: 'notes.txt', contentKind: 'text' }}
      />
    )

    expect(screen.getByRole('textbox', { name: 'Edit notes.txt' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rich' })).not.toBeInTheDocument()
  })
})
