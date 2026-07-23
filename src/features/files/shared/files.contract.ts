export const FILES_IPC_CHANNELS = {
  listDirectory: 'files:listDirectory'
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

export type FilesAPI = {
  listDirectory: (request: ListFilesDirectoryRequest) => Promise<FilesEntry[]>
}
