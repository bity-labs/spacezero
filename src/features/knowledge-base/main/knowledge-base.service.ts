import { dirname, join, resolve } from 'node:path'

import type {
  KnowledgeBaseConfiguration,
  KnowledgeBaseStatus
} from '../shared/knowledge-base.model'
import { toRedactedGitError } from './knowledge-base-git-security'

export const KNOWLEDGE_BASE_AGENTS_INSTRUCTIONS = `# Knowledge Base Instructions

This repository is the user's Knowledge Base.

- Prefer Markdown for durable notes and documentation.
- Store image assets under \`assets/img/\` and reference them with relative Markdown paths.
- Keep the folder and file structure user-controlled.
- Read existing context before adding or changing documents.
- Make focused edits and preserve existing organization unless asked to reorganize.
- Do not edit files under \`.git/\`.
`

export type KnowledgeBaseConfigurationRepository = {
  get: () => Promise<KnowledgeBaseConfiguration | undefined>
  save: (configuration: KnowledgeBaseConfiguration) => Promise<void>
  clear: () => Promise<void>
}

export type KnowledgeBaseHost = {
  pathExists: (path: string) => Promise<boolean>
  resolveDirectory: (path: string) => Promise<string>
  createDirectory: (path: string) => Promise<void>
  ensureParentDirectory: (path: string) => Promise<void>
  removeDirectory: (path: string) => Promise<void>
  writeTextFile: (path: string, content: string) => Promise<void>
  runGit: (
    cwd: string,
    args: readonly string[]
  ) => Promise<{ stdout: string; stderr: string }>
}

export type KnowledgeBaseService = {
  getStatus: () => Promise<KnowledgeBaseStatus>
  createNew: () => Promise<KnowledgeBaseStatus>
  cloneFromGit: (request: { gitUrl: string }) => Promise<KnowledgeBaseStatus>
  reset: () => Promise<KnowledgeBaseStatus>
}

export function createKnowledgeBaseService({
  configurationRepository,
  host,
  rootPath,
  clearSyncState = async () => undefined,
  onConfigurationChange = () => undefined,
  now = () => new Date()
}: {
  configurationRepository: KnowledgeBaseConfigurationRepository
  host: KnowledgeBaseHost
  rootPath: string
  clearSyncState?: () => Promise<void>
  onConfigurationChange?: () => void
  now?: () => Date
}): KnowledgeBaseService {
  return {
    async getStatus() {
      const configuration = await configurationRepository.get()
      if (!configuration) return { setupState: 'unconfigured' }

      try {
        if (!(await host.pathExists(configuration.rootPath))) {
          return {
            setupState: 'unavailable',
            rootPath: configuration.rootPath,
            reason: 'missing'
          }
        }
      } catch {
        return {
          setupState: 'unavailable',
          rootPath: configuration.rootPath,
          reason: 'inaccessible'
        }
      }

      try {
        const canonicalRoot = await host.resolveDirectory(configuration.rootPath)
        const repositoryCheck = await host.runGit(canonicalRoot, [
          'rev-parse',
          '--show-toplevel'
        ])
        const repositoryRoot = repositoryCheck.stdout.trim()
        if (
          repositoryRoot &&
          resolve(await host.resolveDirectory(repositoryRoot)) === resolve(canonicalRoot)
        ) {
          return { setupState: 'configured', rootPath: configuration.rootPath }
        }
      } catch {
        // A persisted path is usable only while it remains a Git repository.
      }

      return {
        setupState: 'unavailable',
        rootPath: configuration.rootPath,
        reason: 'not-git-repository'
      }
    },

    async createNew() {
      await assertCanConfigure(configurationRepository, host, rootPath)
      await clearSyncState()

      let created = false
      try {
        await host.createDirectory(rootPath)
        created = true
        await host.runGit(rootPath, ['init', '-b', 'main'])
        await host.writeTextFile(
          join(rootPath, 'AGENTS.md'),
          KNOWLEDGE_BASE_AGENTS_INSTRUCTIONS
        )
        await host.runGit(rootPath, ['add', 'AGENTS.md'])
        await host.runGit(rootPath, ['commit', '-m', 'Initialize Knowledge Base'])
        await configurationRepository.save({ rootPath, configuredAt: now().toISOString() })
        onConfigurationChange()
        return { setupState: 'configured', rootPath }
      } catch (error) {
        if (created) await host.removeDirectory(rootPath).catch(() => undefined)
        throw error
      }
    },

    async reset() {
      await clearSyncState()
      await configurationRepository.clear()
      onConfigurationChange()
      return { setupState: 'unconfigured' }
    },

    async cloneFromGit(request) {
      await assertCanConfigure(configurationRepository, host, rootPath)
      const gitUrl = request.gitUrl.trim()
      if (!gitUrl) throw new Error('Git repository URL is required.')
      await clearSyncState()

      await host.ensureParentDirectory(rootPath)
      try {
        await host.runGit(dirname(rootPath), ['clone', gitUrl, rootPath])
        await configurationRepository.save({ rootPath, configuredAt: now().toISOString() })
        onConfigurationChange()
        return { setupState: 'configured', rootPath }
      } catch (error) {
        if (await host.pathExists(rootPath)) {
          await host.removeDirectory(rootPath).catch(() => undefined)
        }
        throw toRedactedGitError(error)
      }
    }
  }
}

async function assertCanConfigure(
  configurationRepository: KnowledgeBaseConfigurationRepository,
  host: KnowledgeBaseHost,
  rootPath: string
): Promise<void> {
  if (await configurationRepository.get()) {
    throw new Error('Knowledge Base is already configured.')
  }
  if (await host.pathExists(rootPath)) {
    throw new Error('Knowledge Base folder already exists. Move or remove it before setup.')
  }
}
