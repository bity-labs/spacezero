import { shell } from 'electron'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { createProjectsRepository } from '../../projects/main/projects.repository'
import { getStorageSettings } from '../../settings/main/storage-settings.service'

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
import {
  createKnowledgeBaseRootProvider,
  type KnowledgeBaseRootProvider
} from './knowledge-base-root.provider'
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
let rootProvider: KnowledgeBaseRootProvider | undefined
let syncCoordinator: KnowledgeBaseSyncCoordinator | undefined
let syncScheduler: KnowledgeBaseSyncScheduler | undefined
let projectsService: KnowledgeBaseProjectsService | undefined
let mentionsService: KnowledgeBaseMentionsService | undefined

export function getKnowledgeBaseService(): KnowledgeBaseApplicationService {
  if (!service) {
    const configurationRepository = createKnowledgeBaseConfigurationRepository()
    const syncStateRepository = createKnowledgeBaseSyncStateRepository()
    const host = createKnowledgeBaseHost()
    const knowledgeBaseService = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: getKnowledgeBaseSetupPath,
      clearSyncState: () => syncStateRepository.clear(),
      onConfigurationChange: () => rootProvider?.invalidate()
    })
    rootProvider = createKnowledgeBaseRootProvider({
      getStatus: knowledgeBaseService.getStatus
    })
    const coreService = {
      ...knowledgeBaseService,
      ...createKnowledgeBaseFilesService({
        rootProvider,
        operations: operationCoordinator
      }),
      ...createKnowledgeBaseSyncService({
        rootProvider,
        syncStateRepository,
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

export function getKnowledgeBaseRootProvider(): KnowledgeBaseRootProvider {
  if (!rootProvider) getKnowledgeBaseService()
  if (!rootProvider) throw new Error('Knowledge Base root provider is unavailable.')
  return rootProvider
}

export function getKnowledgeBaseOperationCoordinator(): ReturnType<
  typeof createKnowledgeBaseOperationCoordinator
> {
  return operationCoordinator
}

export function getKnowledgeBaseMentionsService(): KnowledgeBaseMentionsService {
  mentionsService ??= createKnowledgeBaseMentionsService({
    rootProvider: getKnowledgeBaseRootProvider()
  })
  return mentionsService
}

export function getKnowledgeBaseProjectsService(): KnowledgeBaseProjectsService {
  projectsService ??= createKnowledgeBaseProjectsService({
    rootProvider: getKnowledgeBaseRootProvider(),
    projectsRepository: createProjectsRepository(),
    host: createKnowledgeBaseProjectFolderHost(),
    operations: operationCoordinator
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

export async function getKnowledgeBaseSetupPath(): Promise<string> {
  if (process.env.SPACEZERO_KNOWLEDGE_BASE_PATH) return getDefaultKnowledgeBasePath()

  const { spaceZeroHome } = await getStorageSettings()
  return resolve(spaceZeroHome, 'knowledge-base')
}

export function getDefaultKnowledgeBasePath(): string {
  return resolve(
    process.env.SPACEZERO_KNOWLEDGE_BASE_PATH ?? join(homedir(), 'SpaceZero', 'knowledge-base')
  )
}
