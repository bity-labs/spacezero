export type KnowledgeBaseStatus =
  | { setupState: 'unconfigured' }
  | { setupState: 'configured'; rootPath: string }

export type KnowledgeBaseConfiguration = {
  rootPath: string
  configuredAt: string
}
