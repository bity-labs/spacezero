import { describe, expect, it, vi } from 'vitest'

import { UpdateService, type UpdaterAdapter } from './update.service'

class FakeUpdater implements UpdaterAdapter {
  readonly checkForUpdates = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  on(event: string, listener: (...args: unknown[]) => void): void {
    const listeners = this.listeners.get(event) ?? []
    listeners.push(listener)
    this.listeners.set(event, listeners)
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((listener) => listener(...args))
  }
}

describe('UpdateService', () => {
  it('exposes current beta version and release notes source before checking', () => {
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      updater: new FakeUpdater()
    })

    expect(service.getStatus()).toEqual({
      currentVersion: '0.1.0-beta.1',
      releaseChannel: 'beta',
      lastCheckedAt: null,
      state: 'idle',
      availableVersion: null,
      downloadedVersion: null,
      errorMessage: null,
      releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
    })
  })

  it('runs manual checks through the injected updater without network access in the test', async () => {
    const updater = new FakeUpdater()
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      now: () => new Date('2026-01-02T03:04:05.000Z'),
      updater
    })

    const checkPromise = service.checkForUpdates()
    updater.emit('update-not-available')
    const status = await checkPromise

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(status.state).toBe('no-update-available')
    expect(status.lastCheckedAt).toBe('2026-01-02T03:04:05.000Z')
    expect(status.errorMessage).toBeNull()
  })

  it('records available, downloaded, and error update states from updater events', async () => {
    const updater = new FakeUpdater()
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      now: () => new Date('2026-01-02T03:04:05.000Z'),
      updater
    })

    updater.emit('update-available', { version: '0.1.0-beta.2' })
    expect(service.getStatus()).toMatchObject({
      state: 'update-available',
      availableVersion: '0.1.0-beta.2',
      downloadedVersion: null,
      errorMessage: null
    })

    updater.emit('update-downloaded', { version: '0.1.0-beta.2' })
    expect(service.getStatus()).toMatchObject({
      state: 'update-downloaded',
      availableVersion: '0.1.0-beta.2',
      downloadedVersion: '0.1.0-beta.2',
      errorMessage: null
    })

    updater.emit('error', new Error('GitHub releases unavailable'))
    expect(service.getStatus()).toMatchObject({
      state: 'error',
      errorMessage: 'GitHub releases unavailable'
    })
  })
})
