import { basename } from 'node:path'

import { nanoid } from 'nanoid'

import type {
  BrowserDownloadActionRequest,
  BrowserDownloadSnapshot,
  BrowserDownloadStatus,
  BrowserDownloadUpdatedEvent
} from '../shared'

export type BrowserDownloadItem = {
  getFilename: () => string
  getReceivedBytes: () => number
  getTotalBytes: () => number
  setSavePath: (path: string) => void
  cancel: () => void
  pause?: () => void
  resume?: () => void
  on: (event: 'updated', listener: () => void) => void
  once: (event: 'done', listener: (_event: unknown, state: 'completed' | 'cancelled' | 'interrupted') => void) => void
}

export type BrowserDownloadDialog = {
  showSaveDialog: (request: { suggestedFilename: string; ownerWindow?: unknown }) => Promise<string | null>
}

export type BrowserDownloadNativeOperations = {
  openPath: (path: string) => Promise<void>
  revealInFolder: (path: string) => void | Promise<void>
}

type BrowserDownloadRecord = {
  id: string
  tabId: string
  filename: string
  status: BrowserDownloadStatus
  receivedBytes: number
  totalBytes: number | null
  completedPath: string | null
}

type BrowserDownloadListener = (event: BrowserDownloadUpdatedEvent) => void

export class BrowserDownloadsService {
  private readonly records = new Map<string, BrowserDownloadRecord>()
  private readonly listeners = new Set<BrowserDownloadListener>()

  constructor(
    private readonly dialog: BrowserDownloadDialog,
    private readonly nativeOperations: BrowserDownloadNativeOperations
  ) {}

  onEvent(listener: BrowserDownloadListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async handleDownloadStarted(
    tabId: string,
    item: BrowserDownloadItem,
    ownerWindow?: unknown
  ): Promise<void> {
    item.pause?.()
    const record: BrowserDownloadRecord = {
      id: `browser-download-${nanoid()}`,
      tabId,
      filename: safeSuggestedFilename(item.getFilename()),
      status: 'selecting-save-location',
      receivedBytes: 0,
      totalBytes: safeTotalBytes(item.getTotalBytes()),
      completedPath: null
    }
    this.records.set(record.id, record)
    this.publish(record)

    item.on('updated', () => {
      if (record.status !== 'downloading') return
      record.receivedBytes = Math.max(0, item.getReceivedBytes())
      record.totalBytes = safeTotalBytes(item.getTotalBytes())
      this.publish(record)
    })
    item.once('done', (_event, state) => {
      if (state === 'completed') {
        record.status = 'completed'
        record.receivedBytes = Math.max(record.receivedBytes, item.getReceivedBytes())
      } else if (state === 'cancelled') {
        record.status = 'cancelled'
        record.completedPath = null
      } else {
        record.status = 'failed'
        record.completedPath = null
      }
      record.totalBytes = safeTotalBytes(item.getTotalBytes())
      this.publish(record)
    })

    let savePath: string | null
    try {
      savePath = await this.dialog.showSaveDialog({
        suggestedFilename: record.filename,
        ownerWindow
      })
    } catch {
      if (record.status !== 'selecting-save-location') return
      record.status = 'failed'
      record.completedPath = null
      this.publish(record)
      item.cancel()
      return
    }

    if (record.status !== 'selecting-save-location') return

    if (!savePath) {
      record.status = 'cancelled'
      record.completedPath = null
      this.publish(record)
      item.cancel()
      return
    }

    item.setSavePath(savePath)
    record.status = 'downloading'
    record.completedPath = savePath
    record.receivedBytes = Math.max(0, item.getReceivedBytes())
    record.totalBytes = safeTotalBytes(item.getTotalBytes())
    this.publish(record)
    item.resume?.()
  }

  async openCompletedDownload(request: BrowserDownloadActionRequest): Promise<void> {
    const record = this.assertCompletedRecord(request.downloadId)
    await this.nativeOperations.openPath(record.completedPath)
  }

  async revealCompletedDownload(request: BrowserDownloadActionRequest): Promise<void> {
    const record = this.assertCompletedRecord(request.downloadId)
    await this.nativeOperations.revealInFolder(record.completedPath)
  }

  private assertCompletedRecord(downloadId: string): BrowserDownloadRecord & { completedPath: string } {
    const record = this.records.get(downloadId)
    if (!record || record.status !== 'completed' || !record.completedPath) {
      throw new Error('Browser download action is not available for this download.')
    }
    return record as BrowserDownloadRecord & { completedPath: string }
  }

  private publish(record: BrowserDownloadRecord): void {
    const snapshot = toDownloadSnapshot(record)
    for (const listener of this.listeners) {
      listener({ type: 'download-updated', download: snapshot })
    }
  }
}

export function safeSuggestedFilename(filename: string): string {
  const fallback = 'download'
  const leaf = [...basename(filename || fallback)]
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code > 31 && code !== 127
    })
    .join('')
    .trim()
  if (!leaf || leaf === '.' || leaf === '..') return fallback
  return leaf.replace(/[/:\\]/g, '_') || fallback
}

function safeTotalBytes(totalBytes: number): number | null {
  return Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : null
}

function toDownloadSnapshot(record: BrowserDownloadRecord): BrowserDownloadSnapshot {
  return {
    id: record.id,
    tabId: record.tabId,
    filename: record.filename,
    status: record.status,
    receivedBytes: record.receivedBytes,
    totalBytes: record.totalBytes
  }
}
