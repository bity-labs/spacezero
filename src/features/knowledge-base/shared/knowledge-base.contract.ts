import type {
  KnowledgeBaseDocument,
  KnowledgeBaseStatus,
  KnowledgeBaseTreeItem
} from './knowledge-base.model'

export const KNOWLEDGE_BASE_IPC_CHANNELS = {
  getStatus: 'knowledgeBase:getStatus',
  createNew: 'knowledgeBase:createNew',
  cloneFromGit: 'knowledgeBase:cloneFromGit',
  getTree: 'knowledgeBase:getTree',
  openDocument: 'knowledgeBase:openDocument'
} as const

export type KnowledgeBaseAPI = {
  getStatus: () => Promise<KnowledgeBaseStatus>
  createNew: () => Promise<KnowledgeBaseStatus>
  cloneFromGit: (request: { gitUrl: string }) => Promise<KnowledgeBaseStatus>
  getTree: () => Promise<KnowledgeBaseTreeItem[]>
  openDocument: (request: { relativePath: string }) => Promise<KnowledgeBaseDocument>
}
