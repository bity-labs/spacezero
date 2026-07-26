export const FILES_IPC_CHANNELS = {
  listDirectory: 'files:listDirectory',
  openDocument: 'files:openDocument',
  saveDocument: 'files:saveDocument',
  revealInSystemFileManager: 'files:revealInSystemFileManager'
} as const

export const KNOWLEDGE_BASE_FILES_CONTEXT_KEY = 'knowledge-base' as const

export type FilesContext =
  | { kind: 'project-session'; sessionId: string }
  | { kind: 'knowledge-base'; contextKey: typeof KNOWLEDGE_BASE_FILES_CONTEXT_KEY }

export type FilesEntryKind = 'directory' | 'file' | 'symlink'

export type FilesEntry = {
  name: string
  relativePath: string
  kind: FilesEntryKind
}

export type ListFilesDirectoryRequest = {
  context: FilesContext
  relativePath: string
}

export type OpenFilesDocumentRequest = {
  context: FilesContext
  relativePath: string
}

export type SaveFilesDocumentRequest = {
  context: FilesContext
  relativePath: string
  content: string
  expectedRevision: string
}

export type FilesDocumentBase = {
  name: string
  relativePath: string
  size: number
  modifiedAt: string
  revision: string
}

export type FilesTextDocument = FilesDocumentBase & {
  contentKind: 'text'
  content: string
  hasBom: boolean
  lineEnding: 'lf' | 'crlf'
}

export type FilesImageDocument = FilesDocumentBase & {
  contentKind: 'image'
  classification: 'image'
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  dataUrl: string
  content?: undefined
}

export type FilesMetadataDocument = FilesDocumentBase & {
  contentKind: 'binary' | 'oversized'
  classification: 'binary' | 'oversized-text' | 'oversized-image'
  content?: undefined
}

export type FilesDocument = FilesTextDocument | FilesImageDocument | FilesMetadataDocument

export type SaveFilesDocumentResult =
  | { status: 'saved'; document: FilesTextDocument }
  | { status: 'conflict'; document: FilesDocument }

export type RevealFilesEntryRequest = {
  context: FilesContext
  relativePath: string
}

export type FilesAPI = {
  listDirectory: (request: ListFilesDirectoryRequest) => Promise<FilesEntry[]>
  openDocument: (request: OpenFilesDocumentRequest) => Promise<FilesDocument>
  saveDocument: (request: SaveFilesDocumentRequest) => Promise<SaveFilesDocumentResult>
  revealInSystemFileManager: (request: RevealFilesEntryRequest) => Promise<void>
}
