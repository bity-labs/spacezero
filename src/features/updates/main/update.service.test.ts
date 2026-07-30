import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { countLiveTerminals, listAgentSessions } = vi.hoisted(() => ({
  countLiveTerminals: vi.fn<() => number>(),
  listAgentSessions: vi.fn<() => Promise<unknown[]>>()
}))

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: {
      checkForUpdates: vi.fn<() => Promise<null>>().mockResolvedValue(null),
      on: vi.fn()
    }
  }
}))

vi.mock('../../agent-workspace/main/agent-utility-process', () => ({
  getAgentUtilityProcessHost: () => ({
    listSessions: listAgentSessions
  })
}))

vi.mock('../../terminal/main/terminal.runtime', () => ({
  getTerminalService: () => ({
    countLiveTerminals
  })
}))

import { UpdateService, type UpdaterAdapter } from './update.service'

class FakeUpdater implements UpdaterAdapter {
  autoDownload = false
  readonly checkForUpdates = vi.fn<() => ReturnType<UpdaterAdapter['checkForUpdates']>>().mockResolvedValue(null)
  readonly quitAndInstall = vi.fn()
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
  beforeEach(() => {
    listAgentSessions.mockResolvedValue([])
    countLiveTerminals.mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })
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

  it('checks on launch and periodically while automatic checks are running', async () => {
    vi.useFakeTimers()
    const updater = new FakeUpdater()
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      updater
    })

    service.startAutomaticChecks({ intervalMs: 1_000 })
    await vi.waitFor(() => expect(updater.checkForUpdates).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1_000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(3)

    service.stopAutomaticChecks()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(3)
  })

  it('keeps automatic checks idempotent while the service is already running', async () => {
    vi.useFakeTimers()
    const updater = new FakeUpdater()
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      updater
    })

    service.startAutomaticChecks({ intervalMs: 1_000 })
    service.startAutomaticChecks({ intervalMs: 1_000 })
    await vi.waitFor(() => expect(updater.checkForUpdates).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1_000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)

    service.stopAutomaticChecks()
  })

  it('enables background downloads before checking for public updates', async () => {
    const updater = new FakeUpdater()
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      updater
    })

    await service.checkForUpdates()

    expect(updater.autoDownload).toBe(true)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('safely mocks update checks without calling electron-updater when updates are disabled', async () => {
    vi.useFakeTimers()
    const updater = new FakeUpdater()
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      now: () => new Date('2026-01-02T03:04:05.000Z'),
      updater,
      updateChecksEnabled: false
    })

    service.startAutomaticChecks({ intervalMs: 1_000 })
    await vi.advanceTimersByTimeAsync(1_000)
    const status = await service.checkForUpdates()

    expect(updater.autoDownload).toBe(false)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(status).toMatchObject({
      state: 'no-update-available',
      lastCheckedAt: '2026-01-02T03:04:05.000Z',
      errorMessage: null
    })
  })

  it('consumes background download failures from automatic update checks', async () => {
    const updater = new FakeUpdater()
    const downloadError = new Error('background download failed')
    let rejectDownload: (error: Error) => void = () => undefined
    const downloadPromise = new Promise<Array<string>>((_, reject) => {
      rejectDownload = reject
    })
    updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: '0.1.0-beta.2' },
      versionInfo: { version: '0.1.0-beta.2' },
      downloadPromise
    })
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      now: () => new Date('2026-01-02T03:04:05.000Z'),
      updater
    })
    const states: string[] = []
    service.onStatusChange((status) => states.push(status.state))

    const status = await service.checkForUpdates()
    updater.emit('error', downloadError)
    rejectDownload(downloadError)

    await vi.waitFor(() => {
      expect(service.getStatus()).toMatchObject({
        state: 'error',
        lastCheckedAt: '2026-01-02T03:04:05.000Z',
        errorMessage: 'background download failed'
      })
    })
    expect(status.lastCheckedAt).toBe('2026-01-02T03:04:05.000Z')
    expect(states).toContain('error')
  })

  it('requires confirmation before applying a downloaded update when active work is present', async () => {
    const updater = new FakeUpdater()
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      updater,
      activeWorkProvider: async () => ({ projectSessions: 1, chatContexts: 1, terminalTabs: 2 })
    })
    updater.emit('update-downloaded', { version: '0.1.0-beta.2' })

    await expect(service.applyDownloadedUpdate()).resolves.toEqual({
      status: 'needs-confirmation',
      activeWork: { projectSessions: 1, chatContexts: 1, terminalTabs: 2 },
      updateStatus: service.getStatus()
    })
    expect(updater.quitAndInstall).not.toHaveBeenCalled()

    await expect(service.applyDownloadedUpdate({ confirmActiveWork: true })).resolves.toEqual({
      status: 'applying',
      activeWork: { projectSessions: 1, chatContexts: 1, terminalTabs: 2 },
      updateStatus: service.getStatus()
    })
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('fails closed when production session discovery rejects before applying a downloaded update', async () => {
    const updater = new FakeUpdater()
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      updater
    })
    listAgentSessions.mockRejectedValueOnce(new Error('utility unavailable'))
    updater.emit('update-downloaded', { version: '0.1.0-beta.2' })

    await expect(service.applyDownloadedUpdate()).rejects.toThrow('utility unavailable')
    expect(listAgentSessions).toHaveBeenCalledTimes(1)
    expect(countLiveTerminals).not.toHaveBeenCalled()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('does not apply updates when nothing has been downloaded', async () => {
    const updater = new FakeUpdater()
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      updater,
      activeWorkProvider: async () => ({ projectSessions: 0, chatContexts: 0, terminalTabs: 0 })
    })

    await expect(service.applyDownloadedUpdate()).resolves.toMatchObject({
      status: 'no-downloaded-update',
      activeWork: { projectSessions: 0, chatContexts: 0, terminalTabs: 0 },
      updateStatus: { state: 'idle' }
    })
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('applies a downloaded update immediately when no sessions or terminals are active', async () => {
    const updater = new FakeUpdater()
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      updater,
      activeWorkProvider: async () => ({ projectSessions: 0, chatContexts: 0, terminalTabs: 0 })
    })
    updater.emit('update-downloaded', { version: '0.1.0-beta.2' })

    await expect(service.applyDownloadedUpdate()).resolves.toMatchObject({ status: 'applying' })
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('records and publishes available, downloaded, and error update states from updater events', async () => {
    const updater = new FakeUpdater()
    const service = new UpdateService({
      currentVersion: '0.1.0-beta.1',
      now: () => new Date('2026-01-02T03:04:05.000Z'),
      updater
    })
    const states: string[] = []
    const unsubscribe = service.onStatusChange((status) => states.push(status.state))

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
    expect(states).toEqual(['update-available', 'update-downloaded', 'error'])

    unsubscribe()
    updater.emit('update-not-available')
    expect(states).toEqual(['update-available', 'update-downloaded', 'error'])
  })
})
