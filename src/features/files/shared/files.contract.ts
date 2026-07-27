export const FILES_IPC_CHANNELS = {
  listDirectory: 'files:listDirectory',
  openDocument: 'files:openDocument',
  saveDocument: 'files:saveDocument',
  createEntry: 'files:createEntry',
  moveEntry: 'files:moveEntry',
  trashEntry: 'files:trashEntry',
  revealInSystemFileManager: 'files:revealInSystemFileManager',
  search: 'files:search',
  cancelSearch: 'files:cancelSearch',
  observe: 'files:observe',
  unobserve: 'files:unobserve',
  observationEvent: 'files:observationEvent'
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

export type CreateFilesEntryRequest = {
  context: FilesContext
  relativePath: string
  kind: 'file' | 'folder'
}

export type MoveFilesEntryRequest = {
  context: FilesContext
  sourcePath: string
  destinationPath: string
}

export type TrashFilesEntryRequest = {
  context: FilesContext
  relativePath: string
}

export type SearchFilesRequest = {
  context: FilesContext
  query: string
  includeIgnored: boolean
  requestId: string
  maxResults?: number
}

export type CancelFilesSearchRequest = {
  context: FilesContext
  requestId: string
}

export type ObserveFilesRequest = {
  context: FilesContext
  subscriptionId: string
}

export type ObserveFilesResult = {
  subscriptionId: string
}

export type UnobserveFilesRequest = {
  subscriptionId: string
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
  { status: 'saved'; document: FilesTextDocument } | { status: 'conflict'; document: FilesDocument }

export type FilesSearchSnippet = {
  line: number
  column: number
  text: string
}

export type FilesSearchResult =
  | {
      kind: 'filename'
      relativePath: string
      name: string
    }
  | {
      kind: 'content'
      relativePath: string
      name: string
      snippets: FilesSearchSnippet[]
    }

export type FilesObservationEvent = {
  subscriptionId: string
  contextKey: string
  kind: 'changed' | 'watch-error'
  relativePath: string | null
  message?: string
}

export type RevealFilesEntryRequest = {
  context: FilesContext
  relativePath: string
}

export type FilesAPI = {
  listDirectory: (request: ListFilesDirectoryRequest) => Promise<FilesEntry[]>
  openDocument: (request: OpenFilesDocumentRequest) => Promise<FilesDocument>
  saveDocument: (request: SaveFilesDocumentRequest) => Promise<SaveFilesDocumentResult>
  createEntry: (request: CreateFilesEntryRequest) => Promise<void>
  moveEntry: (request: MoveFilesEntryRequest) => Promise<void>
  trashEntry: (request: TrashFilesEntryRequest) => Promise<void>
  revealInSystemFileManager: (request: RevealFilesEntryRequest) => Promise<void>
  search: (request: SearchFilesRequest) => Promise<FilesSearchResult[]>
  cancelSearch: (request: CancelFilesSearchRequest) => Promise<void>
  observe: (request: ObserveFilesRequest) => Promise<ObserveFilesResult>
  unobserve: (request: UnobserveFilesRequest) => Promise<void>
  onObservationEvent: (listener: (event: FilesObservationEvent) => void) => () => void
}
