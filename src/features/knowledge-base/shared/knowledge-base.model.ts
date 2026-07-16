export type KnowledgeBaseStatus =
  | { setupState: 'unconfigured' }
  | { setupState: 'configured'; rootPath: string }

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
  content?: string
}
