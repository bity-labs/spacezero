import type { FilesContext } from '../../files/shared'
import {
  getDetachedFilesWorkingDocuments,
  getFilesWorkingDocument,
  useFilesStore,
  type FilesSaveRequestSnapshot
} from '../../files/renderer/files-store'

const GIT_DIFF_CLOSE_PROMPT =
  'Closing Git Diff would remove the final editor surface for unsaved documents. Type save to Save and close, discard to Discard and close, or cancel.'
const SAVE_CONFLICT_MESSAGE =
  'This file changed on disk. Reload from disk or review the external changes before saving.'

export async function requestCloseGitDiffSidePaneTab({
  filesContextKey,
  ipcContext
}: {
  filesContextKey: string
  ipcContext: FilesContext
}): Promise<boolean> {
  const detachedDocuments = getDetachedFilesWorkingDocuments(filesContextKey)
  const orphanedDocuments = detachedDocuments.filter((document) => document.dirty)
  if (orphanedDocuments.length === 0) {
    discardDetachedDocuments(filesContextKey, detachedDocuments)
    return true
  }

  const choice = window.prompt(GIT_DIFF_CLOSE_PROMPT, 'cancel')?.trim().toLowerCase()
  if (choice === 'discard') {
    discardDetachedDocuments(filesContextKey, detachedDocuments)
    return true
  }
  if (choice !== 'save') return false

  const outcomes: string[] = []
  let allSaved = true
  for (const document of orphanedDocuments) {
    const request: FilesSaveRequestSnapshot = {
      relativePath: document.relativePath,
      content: document.draft,
      expectedRevision: document.revision
    }
    useFilesStore.getState().markSaving(filesContextKey, request)
    try {
      const result = await window.spacezero.files.saveDocument({ context: ipcContext, ...request })
      if (result.status === 'conflict') {
        allSaved = false
        useFilesStore.getState().markSaveFailed(filesContextKey, SAVE_CONFLICT_MESSAGE, request)
        useFilesStore
          .getState()
          .markExternalConflict(filesContextKey, document.relativePath, result.document.revision)
        outcomes.push(`${document.relativePath}: conflict`)
        continue
      }

      useFilesStore.getState().markSaved(filesContextKey, result.document, request)
      const currentDocument = getFilesWorkingDocument(filesContextKey, document.relativePath)
      if (currentDocument?.dirty) {
        allSaved = false
        outcomes.push(`${document.relativePath}: newer edits remain unsaved`)
      } else {
        useFilesStore
          .getState()
          .discardDetachedWorkingDocument(filesContextKey, document.relativePath)
        outcomes.push(`${document.relativePath}: saved`)
      }
    } catch {
      allSaved = false
      useFilesStore
        .getState()
        .markSaveFailed(
          filesContextKey,
          'Couldn’t save this file. Your changes are still in memory.',
          request
        )
      outcomes.push(`${document.relativePath}: failed`)
    }
  }

  if (!allSaved) {
    window.alert(`Git Diff remains open.\n${outcomes.join('\n')}`)
  }
  if (allSaved) discardDetachedDocuments(filesContextKey, detachedDocuments)
  return allSaved
}

function discardDetachedDocuments(
  filesContextKey: string,
  documents: Array<{ relativePath: string }>
): void {
  for (const document of documents) {
    useFilesStore.getState().discardDetachedWorkingDocument(filesContextKey, document.relativePath)
  }
}
