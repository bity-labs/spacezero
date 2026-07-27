import { useEffect, useMemo, useRef } from 'react'
import Editor from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'

import { registerFilesMonacoEditor } from '../lib/files-editor-state-migration'
import { configureFilesMonacoEnvironment } from '../lib/monaco-environment'

configureFilesMonacoEnvironment()

export type FilesMonacoEditorMount = (
  editor: Pick<
    monaco.editor.IStandaloneCodeEditor,
    | 'addCommand'
    | 'focus'
    | 'getModel'
    | 'revealLineInCenter'
    | 'restoreViewState'
    | 'saveViewState'
    | 'setPosition'
  >,
  monacoInstance: typeof monaco
) => void

type FilesMonacoEditorProps = {
  height: string
  language: string
  options: monaco.editor.IStandaloneEditorConstructionOptions
  path: string
  theme: string
  value: string
  onChange: (value: string | undefined) => void
  onMount: FilesMonacoEditorMount
}

export function FilesMonacoEditor({
  height,
  language,
  options,
  path,
  theme,
  value,
  onChange,
  onMount
}: FilesMonacoEditorProps): React.JSX.Element {
  const unregisterRef = useRef<(() => void) | null>(null)
  const editorOptions = useMemo<monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({ ...options, automaticLayout: true }),
    [options]
  )

  useEffect(
    () => () => {
      unregisterRef.current?.()
      unregisterRef.current = null
    },
    []
  )

  return (
    <Editor
      key={path}
      className="size-full"
      height={height}
      language={language}
      loading={null}
      options={editorOptions}
      path={path}
      saveViewState
      theme={theme}
      value={value}
      onChange={onChange}
      onMount={(editor, monacoInstance) => {
        unregisterRef.current?.()
        unregisterRef.current = registerFilesMonacoEditor(path, editor, monacoInstance)
        onMount(editor, monacoInstance)
      }}
    />
  )
}
