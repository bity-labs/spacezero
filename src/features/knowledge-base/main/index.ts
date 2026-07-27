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
import {
  createKnowledgeBaseGitAgentService,
  type KnowledgeBaseGitAgentService
} from './knowledge-base-git-agent.service'
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

type KnowledgeBaseApplicationService = KnowledgeBaseService &
  KnowledgeBaseFilesService &
  KnowledgeBaseRecoveryService

const operationCoordinator = createKnowledgeBaseOperationCoordinator()

let service: KnowledgeBaseApplicationService | undefined
let rootProvider: KnowledgeBaseRootProvider | undefined
let projectsService: KnowledgeBaseProjectsService | undefined
let mentionsService: KnowledgeBaseMentionsService | undefined
let gitAgentService: KnowledgeBaseGitAgentService | undefined

export function getKnowledgeBaseService(): KnowledgeBaseApplicationService {
  if (!service) {
    const configurationRepository = createKnowledgeBaseConfigurationRepository()
    const host = createKnowledgeBaseHost()
    const knowledgeBaseService = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: getKnowledgeBaseSetupPath,
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
      })
    }
    service = {
      ...coreService,
      ...createKnowledgeBaseRecoveryService({
        service: coreService,
        openPath: (path) => shell.openPath(path)
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

export function getKnowledgeBaseGitAgentService(): KnowledgeBaseGitAgentService {
  gitAgentService ??= createKnowledgeBaseGitAgentService({
    rootProvider: getKnowledgeBaseRootProvider(),
    host: createKnowledgeBaseHost(),
    operations: operationCoordinator
  })
  return gitAgentService
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
