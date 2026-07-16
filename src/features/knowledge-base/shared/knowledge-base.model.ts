export type KnowledgeBaseStatus =
  | { setupState: 'unconfigured' }
  | { setupState: 'configured'; rootPath: string }

export type KnowledgeBaseConfiguration = {
  rootPath: string
  configuredAt: string
}

export type KnowledgeBaseSyncStatus = {
  remoteState: 'local-only' | 'configured'
  remoteUrl?: string
  syncState: 'idle' | 'syncing' | 'error' | 'conflict'
  lastSyncAt?: string
  lastSyncError?: string
}

export type KnowledgeBaseContentKind = 'folder' | 'markdown' | 'text' | 'binary'

export type KnowledgeBaseTreeItem = {
  name: string
  relativePath: string
  kind: 'folder' | 'file'
  contentKind: KnowledgeBaseContentKind
  size?: number
  modifiedAt?: string
  children?: KnowledgeBaseTreeItem[]
}

export type KnowledgeBaseSearchResult = {
  name: string
  relativePath: string
  matchType: 'filename' | 'content'
  snippet?: string
}

export type KnowledgeBaseDocument = {
  name: string
  relativePath: string
  contentKind: Exclude<KnowledgeBaseContentKind, 'folder'>
  size: number
  modifiedAt: string
  revision: string
  content?: string
}

export type KnowledgeBaseSaveResult =
  | { status: 'saved'; document: KnowledgeBaseDocument }
  | { status: 'conflict'; document: KnowledgeBaseDocument }

export type KnowledgeBaseDocumentCheck =
  | { changed: false }
  | { changed: true; document: KnowledgeBaseDocument }
