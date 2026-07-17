import { dirname, join } from 'node:path'

import type {
  KnowledgeBaseConfiguration,
  KnowledgeBaseStatus
} from '../shared/knowledge-base.model'

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
}

export type KnowledgeBaseHost = {
  pathExists: (path: string) => Promise<boolean>
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
}

export function createKnowledgeBaseService({
  configurationRepository,
  host,
  rootPath,
  now = () => new Date()
}: {
  configurationRepository: KnowledgeBaseConfigurationRepository
  host: KnowledgeBaseHost
  rootPath: string
  now?: () => Date
}): KnowledgeBaseService {
  return {
    async getStatus() {
      const configuration = await configurationRepository.get()
      return configuration
        ? { setupState: 'configured', rootPath: configuration.rootPath }
        : { setupState: 'unconfigured' }
    },

    async createNew() {
      await assertCanConfigure(configurationRepository, host, rootPath)

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
        return { setupState: 'configured', rootPath }
      } catch (error) {
        if (created) await host.removeDirectory(rootPath).catch(() => undefined)
        throw error
      }
    },

    async cloneFromGit(request) {
      await assertCanConfigure(configurationRepository, host, rootPath)
      const gitUrl = request.gitUrl.trim()
      if (!gitUrl) throw new Error('Git repository URL is required.')

      await host.ensureParentDirectory(rootPath)
      try {
        await host.runGit(dirname(rootPath), ['clone', gitUrl, rootPath])
        await configurationRepository.save({ rootPath, configuredAt: now().toISOString() })
        return { setupState: 'configured', rootPath }
      } catch (error) {
        if (await host.pathExists(rootPath)) {
          await host.removeDirectory(rootPath).catch(() => undefined)
        }
        throw error
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
