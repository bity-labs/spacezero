import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  createKnowledgeBaseFilesService,
  type KnowledgeBaseFilesService
} from './knowledge-base-files.service'
import { createKnowledgeBaseHost } from './knowledge-base-host.adapter'
import { createKnowledgeBaseService, type KnowledgeBaseService } from './knowledge-base.service'
import { createKnowledgeBaseConfigurationRepository } from './knowledge-base-settings.repository'

type KnowledgeBaseApplicationService = KnowledgeBaseService & KnowledgeBaseFilesService

let service: KnowledgeBaseApplicationService | undefined

export function getKnowledgeBaseService(): KnowledgeBaseApplicationService {
  if (!service) {
    const configurationRepository = createKnowledgeBaseConfigurationRepository()
    service = {
      ...createKnowledgeBaseService({
        configurationRepository,
        host: createKnowledgeBaseHost(),
        rootPath: getDefaultKnowledgeBasePath()
      }),
      ...createKnowledgeBaseFilesService({ configurationRepository })
    }
  }
  return service
}

export function getDefaultKnowledgeBasePath(): string {
  return resolve(
    process.env.SPACEZERO_KNOWLEDGE_BASE_PATH ?? join(homedir(), 'SpaceZero', 'knowledge-base')
  )
}
