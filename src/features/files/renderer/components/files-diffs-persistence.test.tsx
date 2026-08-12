import { useRef, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFilesDocumentCacheKey } from '../lib/files-document-identity'
import { useFilesStore, type FilesTabState } from '../files-store'
import {
  FilesDiffsEditor,
  resetFilesDiffsEditorContext,
  type FilesDiffsEditorHandle
} from './files-diffs-editor'
import type { FilesTextDocument } from '../../shared'

const sessionId = 'session-diffs-discard'
const relativePath = 'src/example.ts'
const savedContent = 'const value = "saved"'
const discardedDraft = 'const value = "discarded"'

function textDocument(): FilesTextDocument {
  return {
    name: 'example.ts',
    relativePath,
    contentKind: 'text',
    content: savedContent,
    revision: 'revision-1',
    size: savedContent.length,
    modifiedAt: new Date(0).toISOString(),
    hasBom: false,
    lineEnding: 'lf'
  }
}

function readyDocument(
  tab: FilesTabState | undefined
): Extract<FilesTabState, { status: 'ready' }> {
  if (tab?.status !== 'ready') throw new Error('Expected an open text document')
  return tab
}

function renderedText(root: ParentNode): string {
  let text = ''
  for (const node of root.childNodes) {
    if (node instanceof Text) text += node.data
    if (node instanceof Element) {
      text += renderedText(node)
      if (node.shadowRoot) text += renderedText(node.shadowRoot)
    }
  }
  return text
}

function PersistenceHarness({ emittedDrafts }: { emittedDrafts: string[] }): React.JSX.Element {
  const document = readyDocument(useFilesStore((state) => state.contexts[sessionId]?.tabs[0]))
  const discardDirtyTabsInPath = useFilesStore((state) => state.discardDirtyTabsInPath)
  const updateDraft = useFilesStore((state) => state.updateDraft)
  const editorRef = useRef<FilesDiffsEditorHandle>(null)
  const [moveError, setMoveError] = useState<string | null>(null)

  return (
    <div>
      <FilesDiffsEditor
        ref={editorRef}
        cacheKey={createFilesDocumentCacheKey(
          sessionId,
          document.relativePath,
          document.editorStateKey
        )}
        contextKey={sessionId}
        fileName={document.relativePath}
        theme="light"
        value={document.draft}
        onChange={(draft) => {
          emittedDrafts.push(draft)
          updateDraft(sessionId, draft)
        }}
        onSave={vi.fn()}
      />
      <button
        type="button"
        onClick={() => {
          editorRef.current?.applyEdits([
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: savedContent.length }
              },
              newText: discardedDraft
            }
          ])
        }}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => {
          discardDirtyTabsInPath(sessionId, relativePath)
          void window.spacezero.files
            .moveEntry({
              context: { kind: 'project-session', sessionId },
              sourcePath: relativePath,
              destinationPath: 'src/renamed.ts'
            })
            .catch((error: unknown) =>
              setMoveError(error instanceof Error ? error.message : String(error))
            )
        }}
      >
        Discard and rename
      </button>
      {moveError ? <p role="alert">{moveError}</p> : null}
    </div>
  )
}

describe('Files Diffs persistence', () => {
  afterEach(() => {
    cleanup()
    resetFilesDiffsEditorContext(sessionId)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not resurrect discarded Diffs text when a rename fails and the path stays open', async () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab(sessionId, relativePath, 'permanent', 1)).toBe(true)
    store.finishOpenTab(sessionId, textDocument(), 1)
    const emittedDrafts: string[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect(): void {}
        observe(): void {}
        unobserve(): void {}
      }
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: () => ({ width: 8 })
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(window, 'postMessage').mockImplementation((message) => {
      window.dispatchEvent(new MessageEvent('message', { data: message }))
    })
    window.spacezero.files.moveEntry = vi.fn(async () => {
      throw new Error('rename failed')
    })

    const view = render(<PersistenceHarness emittedDrafts={emittedDrafts} />)

    await waitFor(() => expect(renderedText(view.container)).toContain(savedContent))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Edit' })))
    await waitFor(() =>
      expect(readyDocument(useFilesStore.getState().contexts[sessionId]?.tabs[0])).toMatchObject({
        draft: discardedDraft,
        dirty: true
      })
    )

    const emissionCountBeforeDiscard = emittedDrafts.length
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Discard and rename' }))
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('rename failed')
    await waitFor(() => {
      const document = readyDocument(useFilesStore.getState().contexts[sessionId]?.tabs[0])
      expect(document).toMatchObject({ draft: savedContent, dirty: false })
      expect(renderedText(view.container)).toContain(savedContent)
    })
    expect(renderedText(view.container)).not.toContain(discardedDraft)
    expect(emittedDrafts.slice(emissionCountBeforeDiscard)).not.toContain(discardedDraft)
  })
})
