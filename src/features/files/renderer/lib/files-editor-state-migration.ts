import type * as monaco from 'monaco-editor'

import { createFilesMonacoModelPath } from './files-editor-model'

type MountedFilesEditor = {
  editor: monaco.editor.IStandaloneCodeEditor
  monacoInstance: typeof monaco
}

const mountedEditors = new Map<string, MountedFilesEditor>()
const pendingViewStates = new Map<string, monaco.editor.ICodeEditorViewState>()

export function registerFilesMonacoEditor(
  modelPath: string,
  editor: monaco.editor.IStandaloneCodeEditor,
  monacoInstance: typeof monaco
): () => void {
  mountedEditors.set(modelPath, { editor, monacoInstance })
  const pendingViewState = pendingViewStates.get(modelPath)
  if (pendingViewState) {
    editor.restoreViewState(pendingViewState)
    pendingViewStates.delete(modelPath)
  }
  return () => {
    const mounted = mountedEditors.get(modelPath)
    if (mounted?.editor === editor) mountedEditors.delete(modelPath)
  }
}

export function migrateFilesMonacoEditorState(
  sessionId: string,
  sourcePath: string,
  destinationPath: string
): void {
  const sourcePrefix = createFilesMonacoModelPath(sessionId, sourcePath)
  const descendantPrefix = `${sourcePrefix}/`
  const mounted = [...mountedEditors.entries()].filter(
    ([modelPath]) => modelPath === sourcePrefix || modelPath.startsWith(descendantPrefix)
  )
  const monacoInstance = mounted[0]?.[1].monacoInstance
  if (!monacoInstance) return

  for (const [oldModelPath, { editor }] of mounted) {
    const oldUri = monacoInstance.Uri.parse(oldModelPath)
    const oldModel = monacoInstance.editor.getModel(oldUri)
    if (!oldModel) continue

    const relativeSuffix = decodeFilesMonacoRelativeSuffix(oldModelPath.slice(sourcePrefix.length))
    const newRelativePath = `${destinationPath}${relativeSuffix}`
    const newModelPath = createFilesMonacoModelPath(sessionId, newRelativePath)
    const newUri = monacoInstance.Uri.parse(newModelPath)
    const language = oldModel.getLanguageId()
    const value = oldModel.getValue()
    const viewState =
      editor.getModel()?.uri.toString() === oldUri.toString() ? editor.saveViewState() : null

    const existingNewModel = monacoInstance.editor.getModel(newUri)
    if (existingNewModel) existingNewModel.dispose()
    monacoInstance.editor.createModel(value, language, newUri)
    if (viewState) pendingViewStates.set(newModelPath, viewState)
    oldModel.dispose()
  }
}

function decodeFilesMonacoRelativeSuffix(encodedSuffix: string): string {
  return encodedSuffix
    .split('/')
    .map((segment, index) => (index === 0 && segment === '' ? '' : decodeURIComponent(segment)))
    .join('/')
}
