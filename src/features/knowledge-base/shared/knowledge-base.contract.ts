import type { WorkspaceSession } from '../../sessions/shared'
import type {
  KnowledgeBaseImageImport,
  KnowledgeBaseImagePreview,
  KnowledgeBaseStatus
} from './knowledge-base.model'

export const KNOWLEDGE_BASE_IPC_CHANNELS = {
  getStatus: 'knowledgeBase:getStatus',
  getCurrentSession: 'knowledgeBase:getCurrentSession',
  startNewChat: 'knowledgeBase:startNewChat',
  reset: 'knowledgeBase:reset',
  createNew: 'knowledgeBase:createNew',
  cloneFromGit: 'knowledgeBase:cloneFromGit',
  importImage: 'knowledgeBase:importImage',
  loadImage: 'knowledgeBase:loadImage',
  openFolder: 'knowledgeBase:openFolder'
} as const

export type KnowledgeBaseAPI = {
  getStatus: () => Promise<KnowledgeBaseStatus>
  getCurrentSession: () => Promise<WorkspaceSession>
  startNewChat: () => Promise<WorkspaceSession>
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
