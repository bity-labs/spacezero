import { describe, expect, it, vi } from 'vitest'

import { createKnowledgeBaseRecoveryService } from './knowledge-base-recovery.service'

describe('createKnowledgeBaseRecoveryService', () => {
  it('reveals the configured Knowledge Base folder', async () => {
    const openPath = vi.fn(async () => '')
    const service = createKnowledgeBaseRecoveryService({
      service: {
        getStatus: async () => ({
          setupState: 'configured',
          rootPath: '/home/builder/SpaceZero/knowledge-base'
        })
      },
      openPath
    })

    await expect(service.openFolder()).resolves.toBeUndefined()
    expect(openPath).toHaveBeenCalledWith('/home/builder/SpaceZero/knowledge-base')
  })

  it('does not reveal an unavailable Knowledge Base path', async () => {
    const openPath = vi.fn(async () => '')
    const service = createKnowledgeBaseRecoveryService({
      service: {
        getStatus: async () => ({ setupState: 'unconfigured' })
      },
      openPath
    })

    await expect(service.openFolder()).rejects.toThrow('Knowledge Base is not configured.')
    expect(openPath).not.toHaveBeenCalled()
  })
})
