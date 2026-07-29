import type {
  KnowledgeBaseChatContext,
  KnowledgeBaseImageImport,
  KnowledgeBaseImagePreview,
  KnowledgeBaseStatus
} from './knowledge-base.model'

export const KNOWLEDGE_BASE_IPC_CHANNELS = {
  getStatus: 'knowledgeBase:getStatus',
  getCurrentChatContext: 'knowledgeBase:getCurrentChatContext',
  clearChat: 'knowledgeBase:clearChat',
  reset: 'knowledgeBase:reset',
  createNew: 'knowledgeBase:createNew',
  cloneFromGit: 'knowledgeBase:cloneFromGit',
  importImage: 'knowledgeBase:importImage',
  loadImage: 'knowledgeBase:loadImage',
  openFolder: 'knowledgeBase:openFolder'
} as const

export type KnowledgeBaseAPI = {
  getStatus: () => Promise<KnowledgeBaseStatus>
  getCurrentChatContext: () => Promise<KnowledgeBaseChatContext>
  clearChat: () => Promise<KnowledgeBaseChatContext>
  reset: () => Promise<KnowledgeBaseStatus>
  createNew: () => Promise<KnowledgeBaseStatus>
  cloneFromGit: (request: { gitUrl: string }) => Promise<KnowledgeBaseStatus>
  importImage: (request: {
    documentRelativePath: string
    fileName: string
    bytes: Uint8Array
  }) => Promise<KnowledgeBaseImageImport>
  loadImage: (request: {
    documentRelativePath: string
    markdownPath: string
  }) => Promise<KnowledgeBaseImagePreview>
  openFolder: () => Promise<void>
}
