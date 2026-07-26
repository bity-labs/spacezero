import type { FilesContext } from '../shared'
import { useFilesStore, type FilesOpenTabIntent } from './files-store'

export type FilesOpenLocation = {
  contextKey: string
  ipcContext: FilesContext
  relativePath: string
  line?: number
  intent?: FilesOpenTabIntent
}

export type FilesOpenLocationResult = { status: 'opened' } | { status: 'failed'; message: string }

let nextOpenLocationRequestId = 10_000

export async function openFilesLocation({
  contextKey,
  ipcContext,
  relativePath,
  line,
  intent = 'preview'
}: FilesOpenLocation): Promise<FilesOpenLocationResult> {
  nextOpenLocationRequestId += 1
  const requestId = nextOpenLocationRequestId
  const store = useFilesStore.getState()
  const shouldFetch = store.beginOpenTab(contextKey, relativePath, intent, requestId, line)
  if (!shouldFetch) return { status: 'opened' }

  try {
    const document = await window.spacezero.files.openDocument({
      context: ipcContext,
      relativePath
    })
    useFilesStore.getState().finishOpenTab(contextKey, document, requestId)
    return { status: 'opened' }
  } catch (error) {
    const message = filesOpenLocationErrorMessage(error)
    useFilesStore.getState().failOpenTab(contextKey, relativePath, message, requestId)
    return { status: 'failed', message }
  }
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
