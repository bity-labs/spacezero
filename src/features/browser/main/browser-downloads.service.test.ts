import { describe, expect, it, vi } from 'vitest'

import {
  BrowserDownloadsService,
  safeSuggestedFilename,
  type BrowserDownloadDialog,
  type BrowserDownloadItem,
  type BrowserDownloadNativeOperations
} from './browser-downloads.service'

class FakeDownloadItem implements BrowserDownloadItem {
  readonly listeners = new Map<string, Array<(...args: never[]) => void>>()
  savePath: string | null = null
  cancelled = false
  paused = false
  resumed = false
  receivedBytes = 0
  totalBytes = 100

  constructor(private readonly filename: string) {}

  getFilename(): string {
    return this.filename
  }

  getReceivedBytes(): number {
    return this.receivedBytes
  }

  getTotalBytes(): number {
    return this.totalBytes
  }

  setSavePath(path: string): void {
    this.savePath = path
  }

  cancel(): void {
    this.cancelled = true
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.resumed = true
  }

  on(event: 'updated', listener: () => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener as (...args: never[]) => void])
  }

  once(
    event: 'done',
    listener: (_event: unknown, state: 'completed' | 'cancelled' | 'interrupted') => void
  ): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener as (...args: never[]) => void])
  }

  emitUpdated(): void {
    for (const listener of this.listeners.get('updated') ?? []) listener()
  }

  emitDone(state: 'completed' | 'cancelled' | 'interrupted'): void {
    for (const listener of this.listeners.get('done') ?? []) listener({} as never, state as never)
  }
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function createService(dialog: BrowserDownloadDialog): {
  service: BrowserDownloadsService
  nativeOperations: BrowserDownloadNativeOperations
  events: Array<Parameters<Parameters<BrowserDownloadsService['onEvent']>[0]>[0]>
} {
  const nativeOperations = {
    openPath: vi.fn().mockResolvedValue(undefined),
    revealInFolder: vi.fn()
  }
  const service = new BrowserDownloadsService(dialog, nativeOperations)
  const events: Array<Parameters<Parameters<BrowserDownloadsService['onEvent']>[0]>[0]> = []
  service.onEvent((event) => events.push(event))
  return { service, nativeOperations, events }
}

describe('safeSuggestedFilename', () => {
  it('derives a safe leaf filename from Electron metadata', () => {
    expect(safeSuggestedFilename('/tmp/report.pdf')).toBe('report.pdf')
    expect(safeSuggestedFilename('..')).toBe('download')
    expect(safeSuggestedFilename('bad/name\0.txt')).toBe('name.txt')
    expect(safeSuggestedFilename('')).toBe('download')
  })
})

describe('BrowserDownloadsService', () => {
  it('prompts for Save As before setting the save path and reports completion without leaking paths', async () => {
    const item = new FakeDownloadItem('../report.pdf')
    const dialog = { showSaveDialog: vi.fn().mockResolvedValue('/safe/report.pdf') }
    const { service, nativeOperations, events } = createService(dialog)

    await service.handleDownloadStarted('tab-1', item)
    item.receivedBytes = 50
    item.emitUpdated()
    item.receivedBytes = 100
    item.emitDone('completed')

    expect(item.paused).toBe(true)
    expect(dialog.showSaveDialog).toHaveBeenCalledWith({ suggestedFilename: 'report.pdf', ownerWindow: undefined })
    expect(item.savePath).toBe('/safe/report.pdf')
    expect(item.resumed).toBe(true)
    expect(events.map((event) => event.download.status)).toEqual([
      'selecting-save-location',
      'downloading',
      'downloading',
      'completed'
    ])
    expect(events.at(-1)?.download).toMatchObject({
      tabId: 'tab-1',
      filename: 'report.pdf',
      receivedBytes: 100,
      totalBytes: 100
    })
    expect(JSON.stringify(events)).not.toContain('/safe/report.pdf')

    const downloadId = events.at(-1)?.download.id
    await service.openCompletedDownload({ downloadId: downloadId! })
    await service.revealCompletedDownload({ downloadId: downloadId! })
    expect(nativeOperations.openPath).toHaveBeenCalledWith('/safe/report.pdf')
    expect(nativeOperations.revealInFolder).toHaveBeenCalledWith('/safe/report.pdf')
  })

  it('cancels safely when Save As is dismissed', async () => {
    const item = new FakeDownloadItem('archive.zip')
    const { service, events } = createService({ showSaveDialog: vi.fn().mockResolvedValue(null) })

    await service.handleDownloadStarted('tab-1', item)

    expect(item.cancelled).toBe(true)
    expect(item.savePath).toBeNull()
    expect(events.map((event) => event.download.status)).toEqual([
      'selecting-save-location',
      'cancelled'
    ])
  })

  it('keeps early completion before Save As acceptance as non-actionable failure', async () => {
    const item = new FakeDownloadItem('archive.zip')
    const saveDialog = createDeferred<string | null>()
    const { service, nativeOperations, events } = createService({ showSaveDialog: vi.fn(() => saveDialog.promise) })

    const started = service.handleDownloadStarted('tab-1', item)
    await vi.waitFor(() => expect(events.at(-1)?.download.status).toBe('selecting-save-location'))
    item.receivedBytes = 100
    item.emitDone('completed')
    saveDialog.resolve('/safe/archive.zip')
    await started

    expect(item.savePath).toBeNull()
    expect(item.resumed).toBe(false)
    expect(events.map((event) => event.download.status)).toEqual(['selecting-save-location', 'failed'])
    expect(events.at(-1)?.download).toMatchObject({
      tabId: 'tab-1',
      filename: 'archive.zip',
      receivedBytes: 100,
      totalBytes: 100
    })
    expect(JSON.stringify(events)).not.toContain('/safe/archive.zip')

    const downloadId = events.at(-1)?.download.id
    await expect(service.openCompletedDownload({ downloadId: downloadId! })).rejects.toThrow(/not available/)
    await expect(service.revealCompletedDownload({ downloadId: downloadId! })).rejects.toThrow(/not available/)
    expect(nativeOperations.openPath).not.toHaveBeenCalled()
    expect(nativeOperations.revealInFolder).not.toHaveBeenCalled()
  })

  it('does not resume or overwrite interrupted downloads when Save As resolves later', async () => {
    const item = new FakeDownloadItem('archive.zip')
    const saveDialog = createDeferred<string | null>()
    const { service, events } = createService({ showSaveDialog: vi.fn(() => saveDialog.promise) })

    const started = service.handleDownloadStarted('tab-1', item)
    await vi.waitFor(() => expect(events.at(-1)?.download.status).toBe('selecting-save-location'))
    item.emitDone('interrupted')
    saveDialog.resolve('/safe/archive.zip')
    await started

    expect(events.map((event) => event.download.status)).toEqual(['selecting-save-location', 'failed'])
    expect(item.savePath).toBeNull()
    expect(item.resumed).toBe(false)
  })

  it('does not resume or overwrite cancelled downloads when Save As resolves later', async () => {
    const item = new FakeDownloadItem('archive.zip')
    const saveDialog = createDeferred<string | null>()
    const { service, events } = createService({ showSaveDialog: vi.fn(() => saveDialog.promise) })

    const started = service.handleDownloadStarted('tab-1', item)
    await vi.waitFor(() => expect(events.at(-1)?.download.status).toBe('selecting-save-location'))
    item.emitDone('cancelled')
    saveDialog.resolve('/safe/archive.zip')
    await started

    expect(events.map((event) => event.download.status)).toEqual(['selecting-save-location', 'cancelled'])
    expect(item.savePath).toBeNull()
    expect(item.resumed).toBe(false)
  })

  it('reports dialog failures as failed and rejects stale actions', async () => {
    const item = new FakeDownloadItem('archive.zip')
    const { service, nativeOperations, events } = createService({
      showSaveDialog: vi.fn().mockRejectedValue(new Error('dialog failed'))
    })

    await service.handleDownloadStarted('tab-1', item)

    expect(events.at(-1)?.download.status).toBe('failed')
    await expect(service.openCompletedDownload({ downloadId: events.at(-1)!.download.id })).rejects.toThrow(
      /not available/
    )
    expect(item.cancelled).toBe(true)
    expect(nativeOperations.openPath).not.toHaveBeenCalled()
  })
})
