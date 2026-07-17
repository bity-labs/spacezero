import type {
  KnowledgeBaseDocument,
  KnowledgeBaseDocumentCheck,
  KnowledgeBaseImageImport,
  KnowledgeBaseImagePreview,
  KnowledgeBaseSaveResult,
  KnowledgeBaseSearchResult,
  KnowledgeBaseStatus,
  KnowledgeBaseSyncStatus,
  KnowledgeBaseTreeItem
} from './knowledge-base.model'

export const KNOWLEDGE_BASE_IPC_CHANNELS = {
  getStatus: 'knowledgeBase:getStatus',
  reset: 'knowledgeBase:reset',
  createNew: 'knowledgeBase:createNew',
  cloneFromGit: 'knowledgeBase:cloneFromGit',
  getTree: 'knowledgeBase:getTree',
  openDocument: 'knowledgeBase:openDocument',
  search: 'knowledgeBase:search',
  importImage: 'knowledgeBase:importImage',
  loadImage: 'knowledgeBase:loadImage',
  createItem: 'knowledgeBase:createItem',
  renameItem: 'knowledgeBase:renameItem',
  moveItem: 'knowledgeBase:moveItem',
  deleteItem: 'knowledgeBase:deleteItem',
  saveDocument: 'knowledgeBase:saveDocument',
  checkDocument: 'knowledgeBase:checkDocument',
  getSyncStatus: 'knowledgeBase:getSyncStatus',
  addRemote: 'knowledgeBase:addRemote',
  syncNow: 'knowledgeBase:syncNow',
  openFolder: 'knowledgeBase:openFolder',
  openRemote: 'knowledgeBase:openRemote'
} as const

export type KnowledgeBaseAPI = {
  getStatus: () => Promise<KnowledgeBaseStatus>
  reset: () => Promise<KnowledgeBaseStatus>
  createNew: () => Promise<KnowledgeBaseStatus>
  cloneFromGit: (request: { gitUrl: string }) => Promise<KnowledgeBaseStatus>
  getTree: () => Promise<KnowledgeBaseTreeItem[]>
  openDocument: (request: { relativePath: string }) => Promise<KnowledgeBaseDocument>
  search: (request: { query: string }) => Promise<KnowledgeBaseSearchResult[]>
  importImage: (request: {
    documentRelativePath: string
    fileName: string
    bytes: Uint8Array
  }) => Promise<KnowledgeBaseImageImport>
  loadImage: (request: {
    documentRelativePath: string
    markdownPath: string
  }) => Promise<KnowledgeBaseImagePreview>
  createItem: (request: {
    relativePath: string
    kind: 'file' | 'folder'
  }) => Promise<void>
  renameItem: (request: { relativePath: string; newName: string }) => Promise<void>
  moveItem: (request: { sourcePath: string; destinationPath: string }) => Promise<void>
  deleteItem: (request: { relativePath: string }) => Promise<void>
  saveDocument: (request: {
    relativePath: string
    content: string
    expectedRevision: string
  }) => Promise<KnowledgeBaseSaveResult>
  checkDocument: (request: {
    relativePath: string
    revision: string
  }) => Promise<KnowledgeBaseDocumentCheck>
  getSyncStatus: () => Promise<KnowledgeBaseSyncStatus>
  addRemote: (request: { gitUrl: string }) => Promise<KnowledgeBaseSyncStatus>
  syncNow: () => Promise<KnowledgeBaseSyncStatus>
  openFolder: () => Promise<void>
  openRemote: () => Promise<void>
}
