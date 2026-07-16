import { describe, expect, it, vi } from 'vitest'

import type { KnowledgeBaseSyncStatus } from '../shared'
import {
  createKnowledgeBaseSyncCoordinator,
  createKnowledgeBaseSyncScheduler
} from './knowledge-base-sync-coordinator'

const localOnlyStatus: KnowledgeBaseSyncStatus = {
  remoteState: 'local-only',
  syncState: 'idle'
}

const remoteStatus: KnowledgeBaseSyncStatus = {
  remoteState: 'configured',
  remoteUrl: 'https://example.com/notes.git',
  syncState: 'idle'
}

describe('createKnowledgeBaseSyncCoordinator', () => {
  it('skips background and manual sync when no origin exists', async () => {
    const service = {
      getSyncStatus: vi.fn(async () => localOnlyStatus),
      syncNow: vi.fn(async () => remoteStatus)
    }
    const coordinator = createKnowledgeBaseSyncCoordinator(service)

    await expect(coordinator.sync()).resolves.toEqual(localOnlyStatus)
    expect(service.syncNow).not.toHaveBeenCalled()
  })

  it('coalesces overlapping sync requests into one run', async () => {
    let resolveSync: ((status: KnowledgeBaseSyncStatus) => void) | undefined
    const service = {
      getSyncStatus: vi.fn(async () => remoteStatus),
      syncNow: vi.fn(
        () =>
          new Promise<KnowledgeBaseSyncStatus>((resolve) => {
            resolveSync = resolve
          })
      )
    }
    const coordinator = createKnowledgeBaseSyncCoordinator(service)

    const first = coordinator.sync()
    const second = coordinator.sync()
    await vi.waitFor(() => expect(service.syncNow).toHaveBeenCalledTimes(1))
    resolveSync?.(remoteStatus)

    await expect(Promise.all([first, second])).resolves.toEqual([remoteStatus, remoteStatus])
    expect(service.getSyncStatus).toHaveBeenCalledTimes(1)
  })
})

describe('createKnowledgeBaseSyncScheduler', () => {
  it('syncs on app open, focus, and every 15 minutes and stops cleanly', async () => {
    vi.useFakeTimers()
    const sync = vi.fn(async () => remoteStatus)
    const scheduler = createKnowledgeBaseSyncScheduler({ sync })

    try {
      scheduler.start()
      await Promise.resolve()
      expect(sync).toHaveBeenCalledTimes(1)

      scheduler.onAppFocus()
      await Promise.resolve()
      expect(sync).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(15 * 60 * 1_000)
      expect(sync).toHaveBeenCalledTimes(3)

      scheduler.stop()
      await vi.advanceTimersByTimeAsync(15 * 60 * 1_000)
      expect(sync).toHaveBeenCalledTimes(3)
    } finally {
      scheduler.stop()
      vi.useRealTimers()
    }
  })
})
