import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const diffsMock = vi.hoisted(() => ({
  editor: {
    applyEdits: vi.fn(),
    blur: vi.fn(),
    canRedo: false,
    canUndo: false,
    cleanUp: vi.fn(),
    focus: vi.fn(),
    getState: vi.fn(() => ({
      selections: [
        {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 2 },
          direction: 0
        }
      ],
      view: { scrollLeft: 4, scrollTop: 8 }
    })),
    redo: vi.fn(),
    setMarkers: vi.fn(),
    setOptions: vi.fn(),
    setState: vi.fn(),
    undo: vi.fn()
  },
  editorConstructor: vi.fn(),
  fileProps: undefined as Record<string, unknown> | undefined
}))

vi.mock('@pierre/diffs/edit', () => ({
  Editor: class {
    constructor(options: unknown) {
      diffsMock.editorConstructor(options)
      return diffsMock.editor
    }
  }
}))

vi.mock('@pierre/diffs/react', () => {
  return {
    EditProvider: ({
      children,
      createEditor
    }: React.PropsWithChildren<{ createEditor: (options: unknown) => unknown }>) => {
      createEditor({ persistState: true })
      return <>{children}</>
    },
    File: (props: Record<string, unknown>) => {
      diffsMock.fileProps = props
      const editorOptions = props.editorOptions as {
        onAttach: (editor: typeof diffsMock.editor) => void
        onBlur?: () => void
        onChange: (file: { contents: string }) => void
        onFocus?: () => void
      }
      editorOptions.onAttach(diffsMock.editor)
      return (
        <textarea
          aria-label="Source editor"
          value={(props.file as { contents: string }).contents}
          onBlur={() => editorOptions.onBlur?.()}
          onFocus={() => editorOptions.onFocus?.()}
          onChange={(event) => editorOptions.onChange({ contents: event.target.value })}
        />
      )
    },
    Virtualizer: ({ children }: React.PropsWithChildren) => (
      <div data-testid="virtualizer">{children}</div>
    )
  }
})

import {
  FilesDiffsEditor,
  resetFilesDiffsEditorContext,
  type FilesDiffsEditorHandle,
  type FilesSourceEditorState
} from './files-diffs-editor'

describe('FilesDiffsEditor', () => {
  beforeEach(() => {
    resetFilesDiffsEditorContext('session-1')
    vi.clearAllMocks()
    diffsMock.fileProps = undefined
  })

  it('contains Diffs Edit behind a controlled, virtualized source-editor adapter', () => {
    const onChange = vi.fn()

    render(
      <FilesDiffsEditor
        cacheKey="spacezero-files:session-1:src/app.ts:baseline-1"
        contextKey="session-1"
        fileName="src/app.ts"
        theme="dark"
        value="export const value = 1"
        onChange={onChange}
        onSave={vi.fn()}
      />
    )

    expect(screen.getByTestId('virtualizer')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('export const value = 1')
    expect(diffsMock.fileProps).toMatchObject({
      edit: true,
      file: {
        name: 'src/app.ts',
        contents: 'export const value = 1',
        cacheKey: 'spacezero-files:session-1:src/app.ts:baseline-1'
      },
      options: {
        disableFileHeader: true,
        overflow: 'scroll',
        theme: 'pierre-dark-soft',
        themeType: 'dark'
      }
    })

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'changed' } })
    expect(onChange).toHaveBeenCalledWith('changed')
  })

  it('routes mod+s through explicit save and exposes editor commands through a narrow handle', () => {
    const onSave = vi.fn()
    const handle = createRef<FilesDiffsEditorHandle>()

    render(
      <FilesDiffsEditor
        ref={handle}
        cacheKey="document"
        contextKey="session-1"
        fileName="README"
        theme="light"
        value="plain text"
        onChange={vi.fn()}
        onSave={onSave}
      />
    )

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 's', ctrlKey: true })
    expect(onSave).toHaveBeenCalledTimes(1)

    handle.current?.undo()
    handle.current?.redo()
    handle.current?.applyEdits([
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        },
        newText: '# '
      }
    ])
    expect(diffsMock.editor.undo).toHaveBeenCalledTimes(1)
    expect(diffsMock.editor.redo).toHaveBeenCalledTimes(1)
    expect(diffsMock.editor.applyEdits).toHaveBeenCalledTimes(1)
  })

  it('restores view state, applies diagnostics, focuses a one-based location, and reports state on blur', () => {
    const initialState: FilesSourceEditorState = {
      selections: [
        {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 1 },
          direction: 0
        }
      ],
      view: { scrollLeft: 3, scrollTop: 5 }
    }
    const onFocusChange = vi.fn()
    const onStateChange = vi.fn()
    const onTargetLocationApplied = vi.fn()

    render(
      <FilesDiffsEditor
        cacheKey="document"
        contextKey="session-1"
        diagnostics={[
          {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 4 },
            severity: 'warning',
            message: 'Check this value'
          }
        ]}
        fileName="app.ts"
        initialState={initialState}
        targetLocation={{ line: 3, character: 4 }}
        theme="dark-high-contrast"
        value="one\ntwo\nthree"
        onChange={vi.fn()}
        onFocusChange={onFocusChange}
        onSave={vi.fn()}
        onStateChange={onStateChange}
        onTargetLocationApplied={onTargetLocationApplied}
      />
    )

    expect(diffsMock.editor.setState).toHaveBeenCalledWith(initialState)
    expect(diffsMock.editor.setMarkers).toHaveBeenCalledWith([
      expect.objectContaining({ severity: 'warning', message: 'Check this value' })
    ])
    expect(diffsMock.editor.focus).toHaveBeenCalledWith({
      lineNumber: 3,
      character: 3,
      offset: 24
    })
    expect(onTargetLocationApplied).toHaveBeenCalledTimes(1)

    fireEvent.focus(screen.getByRole('textbox'))
    expect(onFocusChange).toHaveBeenCalledWith(true)
    fireEvent.blur(screen.getByRole('textbox'))
    expect(onFocusChange).toHaveBeenCalledWith(false)
    expect(onStateChange).toHaveBeenCalledWith(diffsMock.editor.getState())
  })
})
