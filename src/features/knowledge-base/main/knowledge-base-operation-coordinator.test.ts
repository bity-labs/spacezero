import { describe, expect, it } from 'vitest'

import { createKnowledgeBaseOperationCoordinator } from './knowledge-base-operation-coordinator'

describe('createKnowledgeBaseOperationCoordinator', () => {
  it('serializes file mutations and Git operations', async () => {
    const coordinator = createKnowledgeBaseOperationCoordinator()
    const events: string[] = []
    let finishSave: (() => void) | undefined

    const save = coordinator.runExclusive(async () => {
      events.push('save:start')
      await new Promise<void>((resolve) => {
        finishSave = resolve
      })
      events.push('save:end')
    })
    const sync = coordinator.runExclusive(async () => {
      events.push('sync:start')
      events.push('sync:end')
    })

    await Promise.resolve()
    expect(events).toEqual(['save:start'])

    finishSave?.()
    await Promise.all([save, sync])

    expect(events).toEqual(['save:start', 'save:end', 'sync:start', 'sync:end'])
  })

  it('continues processing after an operation fails', async () => {
    const coordinator = createKnowledgeBaseOperationCoordinator()

    await expect(
      coordinator.runExclusive(async () => {
        throw new Error('save failed')
      })
    ).rejects.toThrow('save failed')
    await expect(coordinator.runExclusive(async () => 'synced')).resolves.toBe('synced')
  })
})
