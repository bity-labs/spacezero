import { shell } from 'electron'

import { createProjectsRepository } from '../../projects/main/projects.repository'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  createKnowledgeBaseFilesService,
  type KnowledgeBaseFilesService
} from './knowledge-base-files.service'
import { createKnowledgeBaseHost } from './knowledge-base-host.adapter'
import { createKnowledgeBaseOperationCoordinator } from './knowledge-base-operation-coordinator'
import { createKnowledgeBaseService, type KnowledgeBaseService } from './knowledge-base.service'
import {
  createKnowledgeBaseMentionsService,
  type KnowledgeBaseMentionsService
} from './knowledge-base-mentions.service'
import {
  createKnowledgeBaseProjectFolderHost,
  createKnowledgeBaseProjectsService,
  type KnowledgeBaseProjectsService
} from './knowledge-base-projects.service'
import {
  createKnowledgeBaseRecoveryService,
  type KnowledgeBaseRecoveryService
} from './knowledge-base-recovery.service'
import { createKnowledgeBaseConfigurationRepository } from './knowledge-base-settings.repository'
import {
  createKnowledgeBaseSyncCoordinator,
  createKnowledgeBaseSyncScheduler,
  type KnowledgeBaseSyncCoordinator,
  type KnowledgeBaseSyncScheduler
} from './knowledge-base-sync-coordinator'
import { createKnowledgeBaseSyncStateRepository } from './knowledge-base-sync.repository'
import {
  createKnowledgeBaseSyncService,
  type KnowledgeBaseSyncService
} from './knowledge-base-sync.service'

type KnowledgeBaseApplicationService = KnowledgeBaseService &
  KnowledgeBaseFilesService &
  KnowledgeBaseSyncService &
  KnowledgeBaseRecoveryService

const operationCoordinator = createKnowledgeBaseOperationCoordinator()

let service: KnowledgeBaseApplicationService | undefined
let syncCoordinator: KnowledgeBaseSyncCoordinator | undefined
let syncScheduler: KnowledgeBaseSyncScheduler | undefined
let projectsService: KnowledgeBaseProjectsService | undefined
let mentionsService: KnowledgeBaseMentionsService | undefined

export function getKnowledgeBaseService(): KnowledgeBaseApplicationService {
  if (!service) {
    const configurationRepository = createKnowledgeBaseConfigurationRepository()
    const host = createKnowledgeBaseHost()
    const coreService = {
      ...createKnowledgeBaseService({
        configurationRepository,
        host,
        rootPath: getDefaultKnowledgeBasePath()
      }),
      ...createKnowledgeBaseFilesService({
        configurationRepository,
        operations: operationCoordinator
      }),
      ...createKnowledgeBaseSyncService({
        configurationRepository,
        syncStateRepository: createKnowledgeBaseSyncStateRepository(),
        host
      })
    }
    service = {
      ...coreService,
      ...createKnowledgeBaseRecoveryService({
        service: coreService,
        openPath: (path) => shell.openPath(path),
        openExternal: (url) => shell.openExternal(url)
      })
    }
  }
  return service
}

export function getKnowledgeBaseMentionsService(): KnowledgeBaseMentionsService {
  mentionsService ??= createKnowledgeBaseMentionsService({
    configurationRepository: createKnowledgeBaseConfigurationRepository()
  })
  return mentionsService
}

export function getKnowledgeBaseProjectsService(): KnowledgeBaseProjectsService {
  projectsService ??= createKnowledgeBaseProjectsService({
    getKnowledgeBaseStatus: () => getKnowledgeBaseService().getStatus(),
    projectsRepository: createProjectsRepository(),
    host: createKnowledgeBaseProjectFolderHost()
  })
  return projectsService
}

export function getKnowledgeBaseSyncCoordinator(): KnowledgeBaseSyncCoordinator {
  syncCoordinator ??= createKnowledgeBaseSyncCoordinator(
    getKnowledgeBaseService(),
    operationCoordinator
  )
  return syncCoordinator
}

export function getKnowledgeBaseSyncScheduler(): KnowledgeBaseSyncScheduler {
  syncScheduler ??= createKnowledgeBaseSyncScheduler({
    sync: () => getKnowledgeBaseSyncCoordinator().sync()
  })
  return syncScheduler
}

export function getDefaultKnowledgeBasePath(): string {
  return resolve(
    process.env.SPACEZERO_KNOWLEDGE_BASE_PATH ?? join(homedir(), 'SpaceZero', 'knowledge-base')
  )
}
