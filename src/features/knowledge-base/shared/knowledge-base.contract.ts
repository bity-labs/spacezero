import type { KnowledgeBaseStatus } from './knowledge-base.model'

export const KNOWLEDGE_BASE_IPC_CHANNELS = {
  getStatus: 'knowledgeBase:getStatus',
  createNew: 'knowledgeBase:createNew'
} as const

export type KnowledgeBaseAPI = {
  getStatus: () => Promise<KnowledgeBaseStatus>
  createNew: () => Promise<KnowledgeBaseStatus>
}
