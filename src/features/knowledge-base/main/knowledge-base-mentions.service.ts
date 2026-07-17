import {
  appendKnowledgeBaseMentionContext,
  parseKnowledgeBaseMentions
} from '../shared'
import { resolveKnowledgeBaseRelativePath } from './knowledge-base-files.service'
import type { KnowledgeBaseRootProvider } from './knowledge-base-root.provider'

export type KnowledgeBasePromptHints = {
  message: string
  displayMessage?: string
}

export type KnowledgeBaseMentionsService = {
  addPromptHints: (message: string) => Promise<KnowledgeBasePromptHints>
}

export function createKnowledgeBaseMentionsService({
  rootProvider
}: {
  rootProvider: Pick<KnowledgeBaseRootProvider, 'getVerifiedRoot'>
}): KnowledgeBaseMentionsService {
  return {
    async addPromptHints(message) {
      const mentions = parseKnowledgeBaseMentions(message)
      if (mentions.length === 0) return { message }

      const rootPath = await rootProvider.getVerifiedRoot()
      const resolvedMentions = mentions.map((mention) => ({
        mention,
        absolutePath: resolveKnowledgeBaseRelativePath(rootPath, mention.relativePath)
          .absolutePath
      }))
      return {
        message: appendKnowledgeBaseMentionContext(message, resolvedMentions),
        displayMessage: message
      }
    }
  }
}
