import { describe, expect, it } from 'vitest'

import type { KnowledgeBaseConfigurationRepository } from './knowledge-base.service'
import { createKnowledgeBaseMentionsService } from './knowledge-base-mentions.service'

function configurationRepository(
  rootPath?: string
): KnowledgeBaseConfigurationRepository {
  return {
    async get() {
      return rootPath
        ? { rootPath, configuredAt: new Date(0).toISOString() }
        : undefined
    },
    async save() {}
  }
}

describe('createKnowledgeBaseMentionsService', () => {
  it('turns file and folder mentions into scoped absolute hints without reading contents', async () => {
    const service = createKnowledgeBaseMentionsService({
      configurationRepository: configurationRepository(
        '/home/builder/SpaceZero/knowledge-base'
      )
    })

    const result = await service.addPromptHints(
      'Use @kb/decisions/architecture.md and @kb/projects/space-zero/'
    )

    expect(result.displayMessage).toBe(
      'Use @kb/decisions/architecture.md and @kb/projects/space-zero/'
    )
    expect(result.message).toContain(
      '@kb/decisions/architecture.md -> /home/builder/SpaceZero/knowledge-base/decisions/architecture.md'
    )
    expect(result.message).toContain(
      '@kb/projects/space-zero/ -> /home/builder/SpaceZero/knowledge-base/projects/space-zero'
    )
    expect(result.message).toContain('Do not automatically read every file in a mentioned folder')
  })

  it('leaves prompts without mentions untouched', async () => {
    const service = createKnowledgeBaseMentionsService({
      configurationRepository: configurationRepository()
    })

    await expect(service.addPromptHints('Explain this project')).resolves.toEqual({
      message: 'Explain this project'
    })
  })

  it('clearly reports unconfigured Knowledge Base mentions', async () => {
    const service = createKnowledgeBaseMentionsService({
      configurationRepository: configurationRepository()
    })

    await expect(service.addPromptHints('Read @kb/notes.md')).rejects.toThrow(
      'Knowledge Base is not configured. Open Knowledge Base to set it up.'
    )
  })

  it('rejects mention traversal and protected Git internals', async () => {
    const service = createKnowledgeBaseMentionsService({
      configurationRepository: configurationRepository('/knowledge')
    })

    await expect(service.addPromptHints('Read @kb/../secret.md')).rejects.toThrow(
      'Knowledge Base path is outside the configured root.'
    )
    await expect(service.addPromptHints('Read @kb/.git/config')).rejects.toThrow(
      'Knowledge Base Git internals are protected.'
    )
  })
})
