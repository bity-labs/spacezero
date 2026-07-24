import { useMemo } from 'react'
import Editor from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'

import { configureFilesMonacoEnvironment } from '../lib/monaco-environment'

configureFilesMonacoEnvironment()

export type FilesMonacoEditorMount = (
  editor: monaco.editor.IStandaloneCodeEditor,
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
  const editorOptions = useMemo<monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({ ...options, automaticLayout: true }),
    [options]
  )

  return (
    <Editor
      key={path}
      className="size-full"
      height={height}
      keepCurrentModel
      language={language}
      loading={null}
      options={editorOptions}
      path={path}
      saveViewState
      theme={theme}
      value={value}
      onChange={onChange}
      onMount={onMount}
    />
  )
}
