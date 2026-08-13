import type { FilesContext } from '../shared'
import { synchronizeFilesSidePaneTabs } from './files-side-pane'
import { useFilesStore, type FilesOpenTabIntent } from './files-store'

export type FilesOpenLocation = {
  contextKey: string
  sidePaneContextKey?: string
  ipcContext: FilesContext
  relativePath: string
  line?: number
  character?: number
  intent?: FilesOpenTabIntent
  revalidateExisting?: boolean
  allowMetadata?: boolean
}

export type FilesOpenLocationResult =
  { status: 'opened' } | { status: 'ignored' } | { status: 'failed'; message: string }

let nextOpenLocationRequestId = 10_000

export async function openFilesLocation({
  contextKey,
  sidePaneContextKey,
  ipcContext,
  relativePath,
  line,
  character,
  intent = 'preview',
  revalidateExisting = true,
  allowMetadata = false
}: FilesOpenLocation): Promise<FilesOpenLocationResult> {
  nextOpenLocationRequestId += 1
  const requestId = nextOpenLocationRequestId
  const store = useFilesStore.getState()
  const shouldFetch = store.beginOpenTab(
    contextKey,
    relativePath,
    intent,
    requestId,
    line,
    revalidateExisting,
    character
  )
  if (sidePaneContextKey) synchronizeFilesSidePaneTabs(contextKey, sidePaneContextKey, true)
  if (!shouldFetch) return { status: 'opened' }

  try {
    const document = await window.spacezero.files.openDocument({
      context: ipcContext,
      relativePath
    })
    if (document.contentKind !== 'text' && !allowMetadata) {
      const message = filesUnsupportedDocumentMessage(document.contentKind)
      const accepted = useFilesStore
        .getState()
        .failOpenTab(contextKey, relativePath, message, requestId)
      return accepted ? { status: 'failed', message } : { status: 'ignored' }
    }
    const accepted = useFilesStore.getState().finishOpenTab(contextKey, document, requestId)
    if (accepted && sidePaneContextKey) {
      synchronizeFilesSidePaneTabs(contextKey, sidePaneContextKey, true)
    }
    return accepted ? { status: 'opened' } : { status: 'ignored' }
  } catch (error) {
    const message = filesOpenLocationErrorMessage(error)
    const accepted = useFilesStore
      .getState()
      .failOpenTab(contextKey, relativePath, message, requestId)
    if (accepted && sidePaneContextKey) {
      synchronizeFilesSidePaneTabs(contextKey, sidePaneContextKey, true)
    }
    return accepted ? { status: 'failed', message } : { status: 'ignored' }
  }
}

function filesUnsupportedDocumentMessage(contentKind: 'binary' | 'oversized' | 'image'): string {
  if (contentKind === 'image') return 'This image can be previewed but not edited in Files.'
  return contentKind === 'oversized'
    ? 'This file is larger than 2 MiB and cannot be edited in Files.'
    : 'This file is binary and cannot be edited in Files.'
}

export function filesOpenLocationErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('files.notFile')) return 'This item is not a regular file.'
  if (code.includes('files.gitProtected'))
    return 'Git internals are protected and cannot be opened.'
  if (code.includes('files.symlinkTraversalDenied'))
    return 'Symbolic links cannot be opened in Files.'
  if (code.includes('files.notFound'))
    return 'This file no longer exists. Refresh Git and Files, then try again.'
  if (code.includes('files.inaccessible')) {
    return 'Space Zero cannot access this file. Check its permissions and try again.'
  }
  return 'Couldn’t open this file in Files. Refresh Git and try again.'
}
