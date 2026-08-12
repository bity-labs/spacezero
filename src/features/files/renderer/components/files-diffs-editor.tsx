import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type KeyboardEvent
} from 'react'
import type { FileContents } from '@pierre/diffs'
import { Editor, type EditorOptions } from '@pierre/diffs/edit'
import { EditProvider, File, Virtualizer } from '@pierre/diffs/react'

export type FilesSourceEditorPosition = {
  line: number
  character: number
}

export type FilesSourceEditorRange = {
  start: FilesSourceEditorPosition
  end: FilesSourceEditorPosition
}

export type FilesSourceEditorSelection = FilesSourceEditorRange & {
  direction: -1 | 0 | 1
}

export type FilesSourceEditorState = {
  selections?: FilesSourceEditorSelection[]
  view?: {
    scrollLeft: number
    scrollTop?: number
  }
}

export type FilesSourceEditorTextEdit = {
  range: FilesSourceEditorRange
  newText: string
}

export type FilesSourceEditorDiagnostic = FilesSourceEditorRange & {
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  source?: string
  code?: string
}

export type FilesDiffsEditorHandle = {
  applyEdits: (edits: FilesSourceEditorTextEdit[]) => void
  blur: () => void
  canRedo: () => boolean
  canUndo: () => boolean
  focus: (location?: { line: number; character?: number }) => void
  getState: () => FilesSourceEditorState | undefined
  redo: () => void
  undo: () => void
}

type FilesDiffsEditorProps = {
  cacheKey: string
  contextKey: string
  diagnostics?: FilesSourceEditorDiagnostic[]
  fileName: string
  initialState?: FilesSourceEditorState
  targetLocation?: { line: number; character?: number }
  theme: 'light' | 'dark' | 'dark-high-contrast'
  value: string
  onChange: (value: string) => void
  onFocusChange?: (focused: boolean) => void
  onSave: () => void | Promise<void>
  onStateChange?: (state: FilesSourceEditorState) => void
  onTargetLocationApplied?: () => void
}

type FilesEditor = Editor<undefined>

const contextEditors = new Map<string, FilesEditor>()

function getOrCreateEditor(contextKey: string, options: EditorOptions<undefined>): FilesEditor {
  const existing = contextEditors.get(contextKey)
  if (existing) {
    existing.setOptions(options)
    return existing
  }
  const editor = new Editor<undefined>(options)
  contextEditors.set(contextKey, editor)
  return editor
}

export function resetFilesDiffsEditorContext(contextKey: string): void {
  const editor = contextEditors.get(contextKey)
  editor?.cleanUp()
  contextEditors.delete(contextKey)
}

export const FilesDiffsEditor = forwardRef<FilesDiffsEditorHandle, FilesDiffsEditorProps>(
  function FilesDiffsEditor(
    {
      cacheKey,
      contextKey,
      diagnostics = [],
      fileName,
      initialState,
      targetLocation,
      theme,
      value,
      onChange,
      onFocusChange,
      onSave,
      onStateChange,
      onTargetLocationApplied
    },
    forwardedRef
  ): React.JSX.Element {
    const editorRef = useRef<FilesEditor | null>(null)
    const callbacksRef = useRef({
      onChange,
      onFocusChange,
      onStateChange,
      onTargetLocationApplied
    })
    callbacksRef.current = { onChange, onFocusChange, onStateChange, onTargetLocationApplied }
    const editorStateRef = useRef({ cacheKey, diagnostics, initialState, targetLocation })
    editorStateRef.current = { cacheKey, diagnostics, initialState, targetLocation }
    const initializedCacheKeyRef = useRef<string | null>(null)
    const appliedTargetRef = useRef<string | null>(null)

    const publishState = useCallback(() => {
      const state = editorRef.current?.getState() as FilesSourceEditorState | undefined
      if (state) callbacksRef.current.onStateChange?.(state)
      return state
    }, [])

    const configureAttachedEditor = useCallback((editor: FilesEditor) => {
      const state = editorStateRef.current
      if (initializedCacheKeyRef.current !== state.cacheKey) {
        initializedCacheKeyRef.current = state.cacheKey
        if (state.initialState) editor.setState(state.initialState)
      }
      editor.setMarkers(state.diagnostics)
      const targetKey = state.targetLocation
        ? `${state.cacheKey}:${state.targetLocation.line}:${state.targetLocation.character ?? 1}`
        : null
      if (state.targetLocation && appliedTargetRef.current !== targetKey) {
        appliedTargetRef.current = targetKey
        editor.focus({
          lineNumber: Math.max(1, state.targetLocation.line),
          character: Math.max(0, (state.targetLocation.character ?? 1) - 1),
          offset: 24
        })
        callbacksRef.current.onTargetLocationApplied?.()
      } else if (!state.targetLocation) {
        appliedTargetRef.current = null
      }
    }, [])

    const editorOptions = useMemo<EditorOptions<undefined>>(
      () => ({
        persistState: true,
        onAttach: (editor) => {
          editorRef.current = editor
          configureAttachedEditor(editor)
        },
        onChange: (file) => callbacksRef.current.onChange(file.contents),
        onFocus: () => callbacksRef.current.onFocusChange?.(true),
        onBlur: () => {
          publishState()
          callbacksRef.current.onFocusChange?.(false)
        }
      }),
      [configureAttachedEditor, contextKey, publishState]
    )

    const createEditor = useCallback(
      (options: EditorOptions<undefined>) => getOrCreateEditor(contextKey, options),
      [contextKey]
    )

    const file = useMemo<FileContents>(
      () => ({ name: fileName, contents: value, cacheKey }),
      [cacheKey, fileName, value]
    )

    const fileOptions = useMemo(
      () => ({
        disableFileHeader: true,
        overflow: 'scroll' as const,
        theme:
          theme === 'light'
            ? 'pierre-light'
            : theme === 'dark'
              ? 'pierre-dark-soft'
              : 'pierre-dark',
        themeType: theme === 'light' ? ('light' as const) : ('dark' as const)
      }),
      [theme]
    )

    useEffect(() => {
      if (editorRef.current) configureAttachedEditor(editorRef.current)
    }, [cacheKey, configureAttachedEditor, diagnostics, initialState, targetLocation])

    useImperativeHandle(
      forwardedRef,
      () => ({
        applyEdits: (edits) => editorRef.current?.applyEdits(edits),
        blur: () => editorRef.current?.blur(),
        canRedo: () => editorRef.current?.canRedo ?? false,
        canUndo: () => editorRef.current?.canUndo ?? false,
        focus: (location) =>
          editorRef.current?.focus(
            location
              ? {
                  lineNumber: Math.max(1, location.line),
                  character: Math.max(0, (location.character ?? 1) - 1),
                  offset: 24
                }
              : undefined
          ),
        getState: publishState,
        redo: () => editorRef.current?.redo(),
        undo: () => editorRef.current?.undo()
      }),
      [publishState]
    )

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 's')
        return
      event.preventDefault()
      event.stopPropagation()
      void onSave()
    }

    return (
      <div
        aria-label="Source editor"
        className="size-full min-h-0 min-w-0 overflow-hidden"
        role="region"
        onKeyDownCapture={handleKeyDown}
      >
        <EditProvider createEditor={createEditor}>
          <Virtualizer style={{ height: '100%', maxHeight: '100%', overflow: 'auto' }}>
            <File
              key={contextKey}
              className="block min-h-full min-w-max"
              edit
              editorOptions={editorOptions}
              file={file}
              options={fileOptions}
            />
          </Virtualizer>
        </EditProvider>
      </div>
    )
  }
)
