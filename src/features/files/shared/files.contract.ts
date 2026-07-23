export const FILES_IPC_CHANNELS = {
  listDirectory: 'files:listDirectory',
  openDocument: 'files:openDocument',
  saveDocument: 'files:saveDocument'
} as const

export type FilesEntryKind = 'directory' | 'file' | 'symlink'

export type FilesEntry = {
  name: string
  relativePath: string
  kind: FilesEntryKind
}

export type ListFilesDirectoryRequest = {
  sessionId: string
  relativePath: string
}

export type OpenFilesDocumentRequest = {
  sessionId: string
  relativePath: string
}

export type SaveFilesDocumentRequest = {
  sessionId: string
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

export type FilesMetadataDocument = FilesDocumentBase & {
  contentKind: 'binary' | 'oversized'
  content?: undefined
}

export type FilesDocument = FilesTextDocument | FilesMetadataDocument

export type SaveFilesDocumentResult =
  | { status: 'saved'; document: FilesTextDocument }
  | { status: 'conflict'; document: FilesDocument }

export type FilesAPI = {
  listDirectory: (request: ListFilesDirectoryRequest) => Promise<FilesEntry[]>
  openDocument: (request: OpenFilesDocumentRequest) => Promise<FilesDocument>
  saveDocument: (request: SaveFilesDocumentRequest) => Promise<SaveFilesDocumentResult>
}
