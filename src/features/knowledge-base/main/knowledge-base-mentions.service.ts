import {
  appendKnowledgeBaseMentionContext,
  parseKnowledgeBaseMentions
} from '../shared'
import { resolveKnowledgeBaseRelativePath } from './knowledge-base-files.service'
import type { KnowledgeBaseConfigurationRepository } from './knowledge-base.service'

export type KnowledgeBasePromptHints = {
  message: string
  displayMessage?: string
}

export type KnowledgeBaseMentionsService = {
  addPromptHints: (message: string) => Promise<KnowledgeBasePromptHints>
}

export function createKnowledgeBaseMentionsService({
  configurationRepository
}: {
  configurationRepository: KnowledgeBaseConfigurationRepository
}): KnowledgeBaseMentionsService {
  return {
    async addPromptHints(message) {
      const mentions = parseKnowledgeBaseMentions(message)
      if (mentions.length === 0) return { message }

      const configuration = await configurationRepository.get()
      if (!configuration) {
        throw new Error(
          'Knowledge Base is not configured. Open Knowledge Base to set it up.'
        )
      }

      const resolvedMentions = mentions.map((mention) => ({
        mention,
        absolutePath: resolveKnowledgeBaseRelativePath(
          configuration.rootPath,
          mention.relativePath
        ).absolutePath
      }))
      return {
        message: appendKnowledgeBaseMentionContext(message, resolvedMentions),
        displayMessage: message
      }
    }
  }
}
