import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FilesDiffsEditor,
  getOrCreateFilesDiffsEditor,
  resetFilesDiffsEditorContext
} from '../../../features/files/renderer/components/files-diffs-editor'
import { DiffViewer } from './diff-viewer'

const contextKey = 'real-pierre-multi-editor'
const cacheKeyA = 'spacezero-files:real-pierre:document:a.ts:revision-1'
const cacheKeyB = 'spacezero-files:real-pierre:document:b.ts:revision-1'
const originalA = 'export const a = 1\n'
const originalB = 'export const b = 1\n'
const editedA = 'export const a = 2\n'
const editedB = 'export const b = 2\n'

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

function replaceDocument(cacheKey: string, current: string, replacement: string): void {
  getOrCreateFilesDiffsEditor(contextKey, cacheKey, {}).applyEdits([
    {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 1, character: 0 }
      },
      newText: replacement
    }
  ])
  expect(current).not.toBe(replacement)
}

function MultiEditorHarness(): React.JSX.Element {
  const [valueA, setValueA] = useState(originalA)
  const [valueB, setValueB] = useState(originalB)
  const [collapsedA, setCollapsedA] = useState(false)
  const [surface, setSurface] = useState<'git' | 'files-a' | 'files-b'>('git')

  return (
    <div>
      {surface === 'git' ? (
        <>
          <DiffViewer
            ariaLabel="Diff A"
            items={[
              {
                id: 'a.ts',
                path: 'a.ts',
                collapsed: collapsedA,
                patch:
                  'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-export const a = 0\n+export const a = 1\n',
                editable: {
                  cacheKey: cacheKeyA,
                  contextKey,
                  value: valueA,
                  baselineValue: originalA,
                  onChange: setValueA
                }
              }
            ]}
          />
          <DiffViewer
            ariaLabel="Diff B"
            items={[
              {
                id: 'b.ts',
                path: 'b.ts',
                patch:
                  'diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-export const b = 0\n+export const b = 1\n',
                editable: {
                  cacheKey: cacheKeyB,
                  contextKey,
                  value: valueB,
                  baselineValue: originalB,
                  onChange: setValueB
                }
              }
            ]}
          />
        </>
      ) : (
        <FilesDiffsEditor
          cacheKey={surface === 'files-a' ? cacheKeyA : cacheKeyB}
          contextKey={contextKey}
          fileName={surface === 'files-a' ? 'a.ts' : 'b.ts'}
          theme="light"
          value={surface === 'files-a' ? valueA : valueB}
          onChange={surface === 'files-a' ? setValueA : setValueB}
          onSave={vi.fn()}
        />
      )}
      <output aria-label="Value A">{valueA}</output>
      <output aria-label="Value B">{valueB}</output>
      <button type="button" onClick={() => replaceDocument(cacheKeyA, valueA, editedA)}>
        Edit A
      </button>
      <button type="button" onClick={() => replaceDocument(cacheKeyB, valueB, editedB)}>
        Edit B
      </button>
      <button
        type="button"
        onClick={() => getOrCreateFilesDiffsEditor(contextKey, cacheKeyA, {}).undo()}
      >
        Undo A
      </button>
      <button
        type="button"
        onClick={() => getOrCreateFilesDiffsEditor(contextKey, cacheKeyB, {}).undo()}
      >
        Undo B
      </button>
      <button type="button" onClick={() => setCollapsedA((collapsed) => !collapsed)}>
        Toggle A
      </button>
      <button type="button" onClick={() => setSurface('files-a')}>
        Open A in Files
      </button>
      <button type="button" onClick={() => setSurface('files-b')}>
        Open B in Files
      </button>
    </div>
  )
}

describe('DiffViewer real Pierre multi-editor lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class implements IntersectionObserver {
        readonly root = null
        readonly rootMargin = '0px'
        readonly scrollMargin = '0px'
        readonly thresholds = [0]

        constructor(private readonly callback: IntersectionObserverCallback) {}

        disconnect(): void {}
        observe(target: Element): void {
          const rect = target.getBoundingClientRect()
          this.callback(
            [
              {
                boundingClientRect: rect,
                intersectionRatio: 1,
                intersectionRect: rect,
                isIntersecting: true,
                rootBounds: rect,
                target,
                time: 0
              }
            ],
            this
          )
        }
        takeRecords(): IntersectionObserverEntry[] {
          return []
        }
        unobserve(): void {}
      }
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 800, 300)
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: () => ({ width: 8 })
    } as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    cleanup()
    resetFilesDiffsEditorContext(contextKey)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps two live diff documents independent and reuses each document history in Files', async () => {
    const view = render(<MultiEditorHarness />)

    await waitFor(() => {
      const text = renderedText(view.container)
      expect(text).toContain(originalA.trim())
      expect(text).toContain(originalB.trim())
      expect(getOrCreateFilesDiffsEditor(contextKey, cacheKeyA, {}).getText()).toBe(originalA)
      expect(getOrCreateFilesDiffsEditor(contextKey, cacheKeyB, {}).getText()).toBe(originalB)
    })

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Edit A' })))
    await waitFor(() => expect(screen.getByLabelText('Value A')).toHaveTextContent(editedA.trim()))
    expect(screen.getByLabelText('Value B')).toHaveTextContent(originalB.trim())

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Edit B' })))
    await waitFor(() => expect(screen.getByLabelText('Value B')).toHaveTextContent(editedB.trim()))
    expect(screen.getByLabelText('Value A')).toHaveTextContent(editedA.trim())

    expect(getOrCreateFilesDiffsEditor(contextKey, cacheKeyA, {}).canUndo).toBe(true)
    expect(getOrCreateFilesDiffsEditor(contextKey, cacheKeyB, {}).canUndo).toBe(true)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Toggle A' })))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Toggle A' })))
    await waitFor(() => expect(renderedText(view.container)).toContain(editedA.trim()))
    expect(renderedText(view.container)).toContain(editedB.trim())

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open A in Files' })))
    await waitFor(() => {
      expect(renderedText(view.container)).toContain(editedA.trim())
      expect(getOrCreateFilesDiffsEditor(contextKey, cacheKeyA, {}).canUndo).toBe(true)
    })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo A' })))
    await waitFor(() => expect(screen.getByLabelText('Value A')).toHaveTextContent(originalA.trim()))
    expect(screen.getByLabelText('Value B')).toHaveTextContent(editedB.trim())

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open B in Files' })))
    await waitFor(() => {
      expect(renderedText(view.container)).toContain(editedB.trim())
      expect(getOrCreateFilesDiffsEditor(contextKey, cacheKeyB, {}).canUndo).toBe(true)
    })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo B' })))
    await waitFor(() => expect(screen.getByLabelText('Value B')).toHaveTextContent(originalB.trim()))
    expect(screen.getByLabelText('Value A')).toHaveTextContent(originalA.trim())
  })
})
