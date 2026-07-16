import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  createKnowledgeBaseFilesService,
  type KnowledgeBaseFilesService
} from './knowledge-base-files.service'
import { createKnowledgeBaseHost } from './knowledge-base-host.adapter'
import { createKnowledgeBaseService, type KnowledgeBaseService } from './knowledge-base.service'
import { createKnowledgeBaseConfigurationRepository } from './knowledge-base-settings.repository'
import { createKnowledgeBaseSyncStateRepository } from './knowledge-base-sync.repository'
import {
  createKnowledgeBaseSyncService,
  type KnowledgeBaseSyncService
} from './knowledge-base-sync.service'

type KnowledgeBaseApplicationService = KnowledgeBaseService &
  KnowledgeBaseFilesService &
  KnowledgeBaseSyncService

let service: KnowledgeBaseApplicationService | undefined

export function getKnowledgeBaseService(): KnowledgeBaseApplicationService {
  if (!service) {
    const configurationRepository = createKnowledgeBaseConfigurationRepository()
    const host = createKnowledgeBaseHost()
    service = {
      ...createKnowledgeBaseService({
        configurationRepository,
        host,
        rootPath: getDefaultKnowledgeBasePath()
      }),
      ...createKnowledgeBaseFilesService({ configurationRepository }),
      ...createKnowledgeBaseSyncService({
        configurationRepository,
        syncStateRepository: createKnowledgeBaseSyncStateRepository(),
        host
      })
    }
  }
  return service
}

export function getDefaultKnowledgeBasePath(): string {
  return resolve(
    process.env.SPACEZERO_KNOWLEDGE_BASE_PATH ?? join(homedir(), 'SpaceZero', 'knowledge-base')
  )
}
