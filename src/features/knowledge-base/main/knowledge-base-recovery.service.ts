import type { KnowledgeBaseService } from './knowledge-base.service'

export type KnowledgeBaseRecoveryService = {
  openFolder: () => Promise<void>
}

export function createKnowledgeBaseRecoveryService({
  service,
  openPath
}: {
  service: Pick<KnowledgeBaseService, 'getStatus'>
  openPath: (path: string) => Promise<string>
}): KnowledgeBaseRecoveryService {
  return {
    async openFolder() {
      const status = await service.getStatus()
      if (status.setupState !== 'configured') throw new Error('Knowledge Base is not configured.')
      const error = await openPath(status.rootPath)
      if (error) throw new Error(error)
    }
  }
}
