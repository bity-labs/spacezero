import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { createKnowledgeBaseHost } from './knowledge-base-host.adapter'
import { createKnowledgeBaseService, type KnowledgeBaseService } from './knowledge-base.service'
import { createKnowledgeBaseConfigurationRepository } from './knowledge-base-settings.repository'

let service: KnowledgeBaseService | undefined

export function getKnowledgeBaseService(): KnowledgeBaseService {
  service ??= createKnowledgeBaseService({
    configurationRepository: createKnowledgeBaseConfigurationRepository(),
    host: createKnowledgeBaseHost(),
    rootPath: getDefaultKnowledgeBasePath()
  })
  return service
}

export function getDefaultKnowledgeBasePath(): string {
  return resolve(
    process.env.SPACEZERO_KNOWLEDGE_BASE_PATH ?? join(homedir(), 'SpaceZero', 'knowledge-base')
  )
}
