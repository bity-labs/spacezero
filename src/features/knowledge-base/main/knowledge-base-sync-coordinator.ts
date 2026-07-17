import type { KnowledgeBaseSyncStatus } from '../shared'
import type { KnowledgeBaseOperationCoordinator } from './knowledge-base-operation-coordinator'
import type { KnowledgeBaseSyncService } from './knowledge-base-sync.service'

const BACKGROUND_SYNC_INTERVAL_MS = 15 * 60 * 1_000

export type KnowledgeBaseSyncCoordinator = {
  sync: () => Promise<KnowledgeBaseSyncStatus>
}

export function createKnowledgeBaseSyncCoordinator(
  service: Pick<KnowledgeBaseSyncService, 'getSyncStatus' | 'syncNow'>,
  operations: KnowledgeBaseOperationCoordinator = {
    runExclusive: (operation) => operation()
  }
): KnowledgeBaseSyncCoordinator {
  let activeSync: Promise<KnowledgeBaseSyncStatus> | undefined

  return {
    sync() {
      if (activeSync) return activeSync

      const run = operations.runExclusive(async () => {
        const status = await service.getSyncStatus()
        return status.remoteState === 'local-only' ? status : service.syncNow()
      })
      activeSync = run

      void run.finally(() => {
        if (activeSync === run) activeSync = undefined
      }).catch(() => undefined)
      return run
    }
  }
}

export type KnowledgeBaseSyncScheduler = {
  start: () => void
  onAppFocus: () => void
  stop: () => void
}

export function createKnowledgeBaseSyncScheduler({
  sync,
  intervalMs = BACKGROUND_SYNC_INTERVAL_MS
}: {
  sync: () => Promise<KnowledgeBaseSyncStatus>
  intervalMs?: number
}): KnowledgeBaseSyncScheduler {
  let interval: ReturnType<typeof setInterval> | undefined

  function trigger(): void {
    void sync().catch(() => undefined)
  }

  return {
    start() {
      if (interval) return
      trigger()
      interval = setInterval(trigger, intervalMs)
      if (typeof interval === 'object' && 'unref' in interval) interval.unref()
    },
    onAppFocus: trigger,
    stop() {
      if (interval) clearInterval(interval)
      interval = undefined
    }
  }
}
