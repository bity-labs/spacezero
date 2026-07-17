import { act, fireEvent, render, screen } from '@testing-library/react'

import type { KnowledgeBaseDocument } from '../shared'
import { KnowledgeBaseSourceEditor } from './knowledge-base-source-editor'

const documentFixture: KnowledgeBaseDocument = {
  name: 'note.md',
  relativePath: 'docs/note.md',
  contentKind: 'markdown',
  size: 15,
  modifiedAt: new Date(0).toISOString(),
  revision: 'revision-1',
  content: '# Durable note'
}

describe('KnowledgeBaseSourceEditor', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('autosaves Markdown after a short debounce and shows saving state', async () => {
    vi.useFakeTimers()
    let resolveSave: ((result: Awaited<ReturnType<typeof window.spacezero.knowledgeBase.saveDocument>>) => void) | undefined
    const saveDocument = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof window.spacezero.knowledgeBase.saveDocument>>>((resolve) => {
          resolveSave = resolve
        })
    )
    window.spacezero.knowledgeBase.saveDocument = saveDocument

    render(<KnowledgeBaseSourceEditor document={documentFixture} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit note.md' }), {
      target: { value: '# Updated note' }
    })

    await act(async () => vi.advanceTimersByTime(650))
    expect(saveDocument).toHaveBeenCalledWith({
      relativePath: 'docs/note.md',
      content: '# Updated note',
      expectedRevision: 'revision-1'
    })
    expect(screen.getByRole('status')).toHaveTextContent('Saving…')

    await act(async () =>
      resolveSave?.({
        status: 'saved',
        document: {
          ...documentFixture,
          content: '# Updated note',
          revision: 'revision-2'
        }
      })
    )
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })

  it('queues edits made while an earlier autosave is still running', async () => {
    vi.useFakeTimers()
    let resolveFirstSave:
      | ((result: Awaited<ReturnType<typeof window.spacezero.knowledgeBase.saveDocument>>) => void)
      | undefined
    const saveDocument = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<
            Awaited<ReturnType<typeof window.spacezero.knowledgeBase.saveDocument>>
          >((resolve) => {
            resolveFirstSave = resolve
          })
      )
      .mockImplementationOnce(async ({ content }: { content: string }) => ({
        status: 'saved' as const,
        document: {
          ...documentFixture,
          content,
          revision: 'revision-3'
        }
      }))
    window.spacezero.knowledgeBase.saveDocument = saveDocument

    render(<KnowledgeBaseSourceEditor document={documentFixture} />)
    const editor = screen.getByRole('textbox', { name: 'Edit note.md' })
    fireEvent.change(editor, { target: { value: '# First edit' } })
    act(() => vi.advanceTimersByTime(650))
    fireEvent.change(editor, { target: { value: '# Second edit' } })
    act(() => vi.advanceTimersByTime(650))

    await act(async () => {
      resolveFirstSave?.({
        status: 'saved',
        document: {
          ...documentFixture,
          content: '# First edit',
          revision: 'revision-2'
        }
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(saveDocument).toHaveBeenCalledTimes(2)
    expect(saveDocument).toHaveBeenLastCalledWith({
      relativePath: 'docs/note.md',
      content: '# Second edit',
      expectedRevision: 'revision-2'
    })
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })

  it('flushes unsaved text when unmounted before the debounce expires', async () => {
    vi.useFakeTimers()
    const saveDocument = vi.fn(async ({ content }: { content: string }) => ({
      status: 'saved' as const,
      document: {
        ...documentFixture,
        content,
        revision: 'revision-2'
      }
    }))
    window.spacezero.knowledgeBase.saveDocument = saveDocument

    const view = render(<KnowledgeBaseSourceEditor document={documentFixture} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit note.md' }), {
      target: { value: '# Keep this note' }
    })

    view.unmount()
    await act(async () => Promise.resolve())

    expect(saveDocument).toHaveBeenCalledWith({
      relativePath: 'docs/note.md',
      content: '# Keep this note',
      expectedRevision: 'revision-1'
    })
  })

  it('shows save errors without discarding editor text', async () => {
    vi.useFakeTimers()
    window.spacezero.knowledgeBase.saveDocument = vi.fn(async () => {
      throw new Error('disk full')
    })

    render(<KnowledgeBaseSourceEditor document={documentFixture} />)
    const editor = screen.getByRole('textbox', { name: 'Edit note.md' })
    fireEvent.change(editor, { target: { value: '# Unsaved note' } })
    await act(async () => {
      vi.advanceTimersByTime(650)
      await Promise.resolve()
    })

    expect(screen.getByRole('status')).toHaveTextContent('Save error')
    expect(editor).toHaveValue('# Unsaved note')
  })

  it('surfaces external conflicts and never silently overwrites unsaved edits', async () => {
    vi.useFakeTimers()
    window.spacezero.knowledgeBase.saveDocument = vi.fn(async () => ({
      status: 'conflict' as const,
      document: {
        ...documentFixture,
        content: '# External note',
        revision: 'revision-external'
      }
    }))

    render(<KnowledgeBaseSourceEditor document={documentFixture} />)
    const editor = screen.getByRole('textbox', { name: 'Edit note.md' })
    fireEvent.change(editor, { target: { value: '# My unsaved note' } })
    await act(async () => {
      vi.advanceTimersByTime(650)
      await Promise.resolve()
    })

    expect(screen.getByRole('alert')).toHaveTextContent('changed outside Space Zero')
    expect(editor).toHaveValue('# My unsaved note')
  })

  it('detects and reloads an external change while a clean file is open', async () => {
    vi.useFakeTimers()
    window.spacezero.knowledgeBase.checkDocument = vi.fn(async () => ({
      changed: true as const,
      document: {
        ...documentFixture,
        content: '# External note',
        revision: 'revision-external'
      }
    }))

    render(<KnowledgeBaseSourceEditor document={documentFixture} />)
    await act(async () => vi.advanceTimersByTime(2_100))

    expect(screen.getByRole('textbox', { name: 'Edit note.md' })).toHaveValue('# External note')
    expect(screen.getByRole('status')).toHaveTextContent('Changed externally')
  })
})
