type FilesEditorViewStateFlush = () => void

const filesEditorViewStateFlushers = new Set<FilesEditorViewStateFlush>()

export function registerFilesEditorViewStateFlush(flush: FilesEditorViewStateFlush): () => void {
  filesEditorViewStateFlushers.add(flush)
  return () => {
    filesEditorViewStateFlushers.delete(flush)
  }
}

export function flushFilesEditorViewStates(): void {
  for (const flush of filesEditorViewStateFlushers) flush()
}
