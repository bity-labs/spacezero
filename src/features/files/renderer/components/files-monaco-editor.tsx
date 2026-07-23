import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'

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
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return
    const editor = monaco.editor.create(containerRef.current, {
      ...options,
      automaticLayout: true,
      theme
    })
    editorRef.current = editor
    const changeSubscription = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue())
    })
    onMount(editor, monaco)

    return () => {
      changeSubscription.dispose()
      editor.dispose()
      editorRef.current = null
    }
  }, [onMount, options, theme])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.updateOptions(options)
  }, [options])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    monaco.editor.setTheme(theme)
  }, [theme])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const uri = monaco.Uri.parse(path)
    let model = monaco.editor.getModel(uri)
    if (!model) {
      model = monaco.editor.createModel(value, language, uri)
    } else {
      monaco.editor.setModelLanguage(model, language)
      if (model.getValue() !== value) model.setValue(value)
    }
    editor.setModel(model)
  }, [language, path, value])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (model && model.getValue() !== value) model.setValue(value)
  }, [value])

  return <div ref={containerRef} className="size-full" style={{ height }} />
}
