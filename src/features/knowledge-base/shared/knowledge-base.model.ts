export const MAX_KNOWLEDGE_BASE_IMAGE_BYTES = 10 * 1024 * 1024

export type KnowledgeBaseStatus =
  | { setupState: 'unconfigured' }
  | {
      setupState: 'unavailable'
      rootPath: string
      reason: 'missing' | 'not-git-repository' | 'inaccessible'
    }
  | { setupState: 'configured'; rootPath: string; setupWarning?: string }

export type KnowledgeBaseConfiguration = {
  rootPath: string
  configuredAt: string
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

export type KnowledgeBaseDocument = {
  name: string
  relativePath: string
  contentKind: Exclude<KnowledgeBaseContentKind, 'folder'>
  size: number
  modifiedAt: string
  revision: string
  content?: string
}

export type KnowledgeBaseImagePreview = {
  dataUrl: string
}

export type KnowledgeBaseImageImport = {
  assetRelativePath: string
  markdownPath: string
  altText: string
}

export type KnowledgeBaseSaveResult =
  | { status: 'saved'; document: KnowledgeBaseDocument }
  | { status: 'conflict'; document: KnowledgeBaseDocument }
