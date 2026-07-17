import { act, fireEvent, render, screen } from '@testing-library/react'

import type { KnowledgeBaseDocument } from '../shared'
import { KnowledgeBaseDocumentEditor } from './knowledge-base-document-editor'

vi.mock('./knowledge-base-rich-editor', () => ({
  KnowledgeBaseRichEditor: ({
    documentRelativePath,
    markdown,
    onChange
  }: {
    documentRelativePath: string
    markdown: string
    onChange: (markdown: string) => void
  }) => (
    <textarea
      aria-label="Rich Markdown editor"
      data-document-relative-path={documentRelativePath}
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
    expect(screen.getByRole('textbox', { name: 'Rich Markdown editor' })).toHaveAttribute(
      'data-document-relative-path',
      'docs/note.mdx'
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

  it('treats ordinary braces in Markdown files as prose', () => {
    const markdown = 'Use {workspace} as the path placeholder.'

    render(
      <KnowledgeBaseDocumentEditor
        document={{
          ...markdownDocument,
          name: 'note.md',
          relativePath: 'docs/note.md',
          content: markdown
        }}
      />
    )

    expect(screen.getByRole('textbox', { name: 'Rich Markdown editor' })).toHaveValue(markdown)
  })

  it('opens unsupported MDX in source mode instead of risking content loss', () => {
    const mdx = '# Note\n\n<Callout type="info">Important</Callout>'

    render(<KnowledgeBaseDocumentEditor document={{ ...markdownDocument, content: mdx }} />)

    expect(screen.getByRole('textbox', { name: 'Edit note.mdx' })).toHaveValue(mdx)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This document contains MDX or raw HTML that rich mode cannot preserve.'
    )
    expect(screen.getByRole('button', { name: 'Source' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens footnotes in source mode instead of allowing a lossy rich edit', () => {
    const markdown = 'A note[^1].\n\n[^1]: Footnote body.'

    render(
      <KnowledgeBaseDocumentEditor
        document={{
          ...markdownDocument,
          name: 'note.md',
          relativePath: 'docs/note.md',
          content: markdown
        }}
      />
    )

    expect(screen.getByRole('textbox', { name: 'Edit note.md' })).toHaveValue(markdown)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This document contains footnotes that rich mode cannot preserve.'
    )
    expect(screen.getByRole('button', { name: 'Rich' })).toBeDisabled()
  })

  it.each([
    ['inline math', 'Euler says $e^{i\\pi}+1=0$.'],
    ['block math', '$$\\int_0^1 x^2 dx$$'],
    ['a named entity', 'Copyright &copy; 2026.'],
    ['a numeric entity', 'Copyright &#169; 2026.'],
    ['escaped heading punctuation', '\\# not a heading'],
    ['a GitHub alert', '> [!NOTE]\n> Durable context.'],
    ['a reference link', '[Notes][durable]\n\n[durable]: https://example.com/notes']
  ])('keeps %s byte-for-byte in source mode', (_description, markdown) => {
    render(
      <KnowledgeBaseDocumentEditor
        document={{
          ...markdownDocument,
          name: 'note.md',
          relativePath: 'docs/note.md',
          content: markdown
        }}
      />
    )

    expect(screen.getByRole('textbox', { name: 'Edit note.md' })).toHaveValue(markdown)
    expect(screen.getByRole('button', { name: 'Rich' })).toBeDisabled()
  })

  it('keeps rich mode available for MDX examples inside code fences', () => {
    const markdown = '# Example\n\n```mdx\n<Callout>Example only</Callout>\n```'

    render(<KnowledgeBaseDocumentEditor document={{ ...markdownDocument, content: markdown }} />)

    expect(screen.getByRole('textbox', { name: 'Rich Markdown editor' })).toHaveValue(markdown)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('blocks rich mode when source edits introduce unsupported MDX', () => {
    render(<KnowledgeBaseDocumentEditor document={markdownDocument} />)
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    const source = screen.getByRole('textbox', { name: 'Edit note.mdx' })
    const mdx = '# Note\n\n<Callout>Important</Callout>'

    fireEvent.change(source, { target: { value: mdx } })

    expect(screen.getByRole('button', { name: 'Rich' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This document contains MDX or raw HTML that rich mode cannot preserve.'
    )
    expect(source).toHaveValue(mdx)
  })

  it('switches to source mode when an external reload introduces unsupported MDX', async () => {
    vi.useFakeTimers()
    const mdx = '# External\n\n<Callout>Changed outside Space Zero</Callout>'
    window.spacezero.knowledgeBase.checkDocument = vi.fn(async () => ({
      changed: true as const,
      document: {
        ...markdownDocument,
        content: mdx,
        revision: 'revision-external'
      }
    }))

    render(<KnowledgeBaseDocumentEditor document={markdownDocument} />)
    await act(async () => vi.advanceTimersByTime(2_100))

    expect(screen.getByRole('textbox', { name: 'Edit note.mdx' })).toHaveValue(mdx)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This document contains MDX or raw HTML that rich mode cannot preserve.'
    )
  })

  it('keeps plain text files in source mode without rich controls', () => {
    render(
      <KnowledgeBaseDocumentEditor
        document={{
          ...markdownDocument,
          name: 'notes.txt',
          relativePath: 'notes.txt',
          contentKind: 'text'
        }}
      />
    )

    expect(screen.getByRole('textbox', { name: 'Edit notes.txt' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rich' })).not.toBeInTheDocument()
  })
})
