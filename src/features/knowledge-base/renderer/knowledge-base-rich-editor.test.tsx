import { useState, type ComponentProps } from 'react'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { KnowledgeBaseRichEditor as RichEditor } from './knowledge-base-rich-editor'

type RichEditorProps = ComponentProps<typeof RichEditor>

function ControlledKnowledgeBaseRichEditor({
  initialMarkdown,
  onChange
}: {
  initialMarkdown: string
  onChange: (markdown: string) => void
}): React.JSX.Element {
  const [markdown, setMarkdown] = useState(initialMarkdown)

  return (
    <KnowledgeBaseRichEditor
      markdown={markdown}
      onChange={(nextMarkdown) => {
        setMarkdown(nextMarkdown)
        onChange(nextMarkdown)
      }}
    />
  )
}

function KnowledgeBaseRichEditor({
  documentRelativePath = 'docs/note.md',
  ...props
}: Omit<RichEditorProps, 'documentRelativePath'> & {
  documentRelativePath?: string
}): React.JSX.Element {
  return <RichEditor documentRelativePath={documentRelativePath} {...props} />
}

describe('KnowledgeBaseRichEditor', () => {
  it('renders Markdown in an accessible rich text editor', async () => {
    render(<KnowledgeBaseRichEditor markdown="# Durable note" onChange={vi.fn()} />)

    expect(await screen.findByRole('textbox', { name: 'Rich Markdown editor' })).toHaveTextContent(
      'Durable note'
    )
  })

  it('shows existing string frontmatter as editable property rows above the Markdown body', async () => {
    render(
      <KnowledgeBaseRichEditor
        markdown={'---\nname: Builder\ndescription: Agent workspace\n---\n\n# Body'}
        onChange={vi.fn()}
      />
    )

    expect(await screen.findByRole('heading', { name: 'Properties' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Property key name' })).toHaveValue('name')
    expect(screen.getByRole('textbox', { name: 'Property value name' })).toHaveValue('Builder')
    expect(screen.getByRole('textbox', { name: 'Property key description' })).toHaveValue(
      'description'
    )
    expect(screen.getByRole('textbox', { name: 'Property value description' })).toHaveValue(
      'Agent workspace'
    )
    expect(screen.getByRole('button', { name: 'Add property' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Rich Markdown editor' })).toHaveTextContent('Body')
  })

  it('edits property values and keys while preserving the Markdown body', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ControlledKnowledgeBaseRichEditor
        initialMarkdown={'---\nname: Builder\n---\n\n# Body\n\nKeep this line.'}
        onChange={onChange}
      />
    )

    const value = await screen.findByRole('textbox', { name: 'Property value name' })
    await user.clear(value)
    await user.type(value, 'Space Zero')
    const key = screen.getByRole('textbox', { name: 'Property key name' })
    await user.clear(key)
    await user.type(key, 'displayName')
    await user.tab()

    expect(screen.getByRole('textbox', { name: 'Property key displayName' })).toHaveValue(
      'displayName'
    )
    expect(onChange.mock.lastCall?.[0]).toBe(
      '---\ndisplayName: "Space Zero"\n---\n\n# Body\n\nKeep this line.'
    )
    expect(screen.getByRole('textbox', { name: 'Rich Markdown editor' })).toHaveTextContent('Body')
    expect(screen.getByRole('textbox', { name: 'Rich Markdown editor' })).toHaveTextContent(
      'Keep this line.'
    )
  })

  it('shows validation and leaves Markdown unchanged for duplicate or empty property keys', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ControlledKnowledgeBaseRichEditor
        initialMarkdown={'---\nname: Builder\ndescription: Workspace\n---\n\nBody'}
        onChange={onChange}
      />
    )

    const key = await screen.findByRole('textbox', { name: 'Property key name' })
    await user.clear(key)
    await user.type(key, 'description')
    await user.tab()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A property named "description" already exists.'
    )
    expect(onChange).not.toHaveBeenCalled()

    await user.click(key)
    await user.clear(key)
    await user.tab()

    expect(screen.getByRole('alert')).toHaveTextContent('Property keys cannot be empty.')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('adds an editable empty string property to a document without frontmatter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <KnowledgeBaseRichEditor markdown={'# Body\n\nKeep this line.'} onChange={onChange} />
    )
    await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    await user.click(screen.getByRole('button', { name: 'Add property' }))

    const updatedMarkdown = onChange.mock.lastCall?.[0] as string
    expect(updatedMarkdown).toBe('---\nproperty: ""\n---\n\n# Body\n\nKeep this line.')
    rerender(<KnowledgeBaseRichEditor markdown={updatedMarkdown} onChange={onChange} />)
    expect(screen.getByRole('textbox', { name: 'Property key property' })).toHaveValue('property')
    expect(screen.getByRole('textbox', { name: 'Property value property' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Rich Markdown editor' })).toHaveTextContent('Body')
  })

  it('provides the Simple Editor formatting toolbar', async () => {
    render(<KnowledgeBaseRichEditor markdown="# Durable note" onChange={vi.fn()} />)
    await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    expect(screen.getByRole('toolbar', { name: 'Markdown formatting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Text style' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Blockquote' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Code block' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeInTheDocument()
  })

  it('changes block styles from the text style menu', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<KnowledgeBaseRichEditor markdown="Title" onChange={onChange} />)
    await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    screen.getByRole('button', { name: 'Text style' }).focus()
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('menuitem', { name: 'Heading 2' }))

    expect(onChange).toHaveBeenLastCalledWith('## Title')
  })

  it('formats a block as a GitHub-style checklist', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<KnowledgeBaseRichEditor markdown="Ship the editor" onChange={onChange} />)
    await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    await user.click(screen.getByRole('button', { name: 'Checklist' }))

    expect(onChange).toHaveBeenLastCalledWith('- [ ] Ship the editor')
  })

  it('writes highlighted text as Markdown', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<KnowledgeBaseRichEditor markdown="" onChange={onChange} />)
    const editor = await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    await user.click(screen.getByRole('button', { name: 'Highlight' }))
    editor.focus()
    await user.keyboard('Important')

    expect(onChange).toHaveBeenLastCalledWith('==Important==')
  })

  it('renders existing Markdown images without rewriting the document', async () => {
    const onChange = vi.fn()
    render(
      <KnowledgeBaseRichEditor
        markdown={'![Architecture](https://example.com/architecture.png "Diagram")'}
        onChange={onChange}
      />
    )

    expect(await screen.findByRole('img', { name: 'Architecture' })).toHaveAttribute(
      'src',
      'https://example.com/architecture.png'
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it('loads Knowledge Base images through the safe desktop API without changing Markdown', async () => {
    const onChange = vi.fn()
    const loadImage = vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,iVBORw=='
    }))
    window.spacezero.knowledgeBase.loadImage = loadImage

    render(
      <KnowledgeBaseRichEditor
        documentRelativePath="docs/note.md"
        markdown="![Architecture](../assets/img/architecture.png)"
        onChange={onChange}
      />
    )

    expect(await screen.findByRole('img', { name: 'Architecture' })).toHaveAttribute(
      'src',
      'data:image/png;base64,iVBORw=='
    )
    expect(loadImage).toHaveBeenCalledWith({
      documentRelativePath: 'docs/note.md',
      markdownPath: '../assets/img/architecture.png'
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not reload unchanged Knowledge Base images after unrelated edits', async () => {
    const user = userEvent.setup()
    const loadImage = vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,iVBORw=='
    }))
    window.spacezero.knowledgeBase.loadImage = loadImage
    render(
      <KnowledgeBaseRichEditor
        markdown="![Architecture](../assets/img/architecture.png)"
        onChange={vi.fn()}
      />
    )
    await waitFor(() => expect(loadImage).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'Horizontal rule' }))

    expect(loadImage).toHaveBeenCalledTimes(1)
  })

  it('uploads an image into the Knowledge Base and inserts its relative Markdown path', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const importImage = vi.fn(async () => ({
      assetRelativePath: 'assets/img/architecture-diagram.png',
      markdownPath: '../assets/img/architecture-diagram.png',
      altText: 'Architecture Diagram'
    }))
    window.spacezero.knowledgeBase.importImage = importImage
    render(
      <KnowledgeBaseRichEditor
        documentRelativePath="docs/note.md"
        markdown=""
        onChange={onChange}
      />
    )
    await screen.findByRole('textbox', { name: 'Rich Markdown editor' })
    const image = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'Architecture Diagram.png', {
      type: 'image/png'
    })

    await user.upload(screen.getByLabelText('Choose image'), image)

    await waitFor(() =>
      expect(importImage).toHaveBeenCalledWith({
        documentRelativePath: 'docs/note.md',
        fileName: 'Architecture Diagram.png',
        bytes: expect.any(Uint8Array)
      })
    )
    expect(onChange).toHaveBeenLastCalledWith(
      '![Architecture Diagram](../assets/img/architecture-diagram.png)'
    )
  })

  it('reports an image import failure without changing the document', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    window.spacezero.knowledgeBase.importImage = vi.fn(async () => {
      throw new Error('Unsupported image type.')
    })
    render(<KnowledgeBaseRichEditor markdown="" onChange={onChange} />)
    await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    await user.upload(
      screen.getByLabelText('Choose image'),
      new File([new Uint8Array([0x00])], 'unsafe.png', { type: 'image/png' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported image type.')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders GitHub-flavored Markdown tables', async () => {
    render(
      <KnowledgeBaseRichEditor
        markdown={'| Decision | Status |\n| --- | --- |\n| Use Tiptap | Accepted |'}
        onChange={vi.fn()}
      />
    )

    expect(await screen.findByRole('table')).toHaveTextContent('Use Tiptap')
    expect(screen.getByRole('columnheader', { name: 'Decision' })).toBeInTheDocument()
  })

  it('inserts a Markdown table from the toolbar', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<KnowledgeBaseRichEditor markdown="" onChange={onChange} />)
    await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    await user.click(screen.getByRole('button', { name: 'Insert table' }))

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(onChange.mock.lastCall?.[0]).toContain('|')
  })

  it('opens an in-editor form for adding links', async () => {
    const user = userEvent.setup()
    render(<KnowledgeBaseRichEditor markdown="" onChange={vi.fn()} />)
    await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    await user.click(screen.getByRole('button', { name: 'Link' }))

    expect(screen.getByRole('dialog', { name: 'Edit link' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Link URL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply link' })).toBeInTheDocument()
  })

  it('serializes links created through the toolbar as Markdown', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<KnowledgeBaseRichEditor markdown="" onChange={onChange} />)
    const editor = await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    await user.click(screen.getByRole('button', { name: 'Link' }))
    await user.type(screen.getByRole('textbox', { name: 'Link URL' }), 'https://tiptap.dev')
    await user.click(screen.getByRole('button', { name: 'Apply link' }))
    editor.focus()
    await user.keyboard('Tiptap')

    expect(onChange).toHaveBeenLastCalledWith('[Tiptap](https://tiptap.dev)')
  })

  it('rejects unsafe link protocols', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<KnowledgeBaseRichEditor markdown="" onChange={onChange} />)
    await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    await user.click(screen.getByRole('button', { name: 'Link' }))
    await user.type(screen.getByRole('textbox', { name: 'Link URL' }), 'javascript:alert(1)')
    await user.click(screen.getByRole('button', { name: 'Apply link' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter an HTTP, HTTPS')
    expect(screen.getByRole('dialog', { name: 'Edit link' })).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('emits Markdown when the builder edits rich text', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<KnowledgeBaseRichEditor markdown="" onChange={onChange} />)

    const editor = await screen.findByRole('textbox', { name: 'Rich Markdown editor' })
    editor.focus()
    await user.keyboard('Durable note')

    expect(onChange).toHaveBeenLastCalledWith('Durable note')
  })

  it('preserves representative supported Markdown semantics after a rich edit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const markdown = [
      '# Decision',
      '',
      '> Durable context',
      '',
      '- [x] Reviewed',
      '',
      '| Key | Value |',
      '| --- | --- |',
      '| Source | [Notes](https://example.com/notes) |'
    ].join('\n')
    render(<KnowledgeBaseRichEditor markdown={markdown} onChange={onChange} />)
    await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    await user.click(screen.getByRole('button', { name: 'Horizontal rule' }))

    const serialized = onChange.mock.lastCall?.[0] as string
    expect(serialized).toContain('# Decision')
    expect(serialized).toContain('> Durable context')
    expect(serialized).toContain('- [x] Reviewed')
    expect(serialized).toContain('| Key')
    expect(serialized).toContain('[Notes](https://example.com/notes)')
  })

  it('applies upstream Markdown without reporting it as a local edit', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <KnowledgeBaseRichEditor markdown="# Original note" onChange={onChange} />
    )
    const editor = await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    rerender(<KnowledgeBaseRichEditor markdown="# External note" onChange={onChange} />)

    await waitFor(() => expect(editor).toHaveTextContent('External note'))
    expect(editor).not.toHaveTextContent('Original note')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps unsupported YAML frontmatter intact and unavailable to the properties UI', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const frontmatter = '---\ntitle: Durable note\ntags:\n  - knowledge\n---\n\n'
    render(<KnowledgeBaseRichEditor markdown={`${frontmatter}Body`} onChange={onChange} />)
    const editor = await screen.findByRole('textbox', { name: 'Rich Markdown editor' })

    expect(editor).toHaveTextContent('Body')
    expect(editor).not.toHaveTextContent('title: Durable note')
    expect(screen.queryByRole('heading', { name: 'Properties' })).not.toBeInTheDocument()
    editor.focus()
    await user.keyboard('updated ')

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.lastCall?.[0]).toMatch(
      /^---\ntitle: Durable note\ntags:\n {2}- knowledge\n---\n\n/
    )
    expect(onChange.mock.lastCall?.[0]).toContain('updated')
  })
})
