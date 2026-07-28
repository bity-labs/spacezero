import { app } from 'electron'
import electronUpdater from 'electron-updater'

import type { UpdateStatus } from '../shared'

export type UpdaterAdapter = {
  autoDownload?: boolean
  checkForUpdates: () => Promise<unknown>
  on: (event: string, listener: (...args: unknown[]) => void) => void
}

type UpdateServiceOptions = {
  currentVersion: string
  now?: () => Date
  updater?: UpdaterAdapter
  updateChecksEnabled?: boolean
}

type AutomaticCheckOptions = {
  intervalMs?: number
}

type UpdateStatusListener = (status: UpdateStatus) => void

export const GITHUB_RELEASE_NOTES_URL = 'https://github.com/bity-labs/spacezero/releases'

export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

const UPDATE_ERROR_MESSAGE = 'Unable to check for updates.'

export class UpdateService {
  private readonly currentVersion: string
  private readonly now: () => Date
  private readonly updater: UpdaterAdapter
  private readonly updateChecksEnabled: boolean
  private readonly listeners = new Set<UpdateStatusListener>()
  private automaticCheckTimer: NodeJS.Timeout | null = null
  private status: UpdateStatus

  constructor({
    currentVersion,
    now = () => new Date(),
    updater = electronUpdater.autoUpdater as unknown as UpdaterAdapter,
    updateChecksEnabled = true
  }: UpdateServiceOptions) {
    this.currentVersion = currentVersion
    this.now = now
    this.updater = updater
    this.updateChecksEnabled = updateChecksEnabled
    this.status = this.createStatus('idle')

    if (this.updateChecksEnabled) this.updater.autoDownload = true

    this.updater.on('checking-for-update', () => {
      this.updateStatus('checking', { lastCheckedAt: this.nowIso(), clearError: true })
    })
    this.updater.on('update-available', (info) => {
      this.updateStatus('update-available', {
        lastCheckedAt: this.status.lastCheckedAt ?? this.nowIso(),
        availableVersion: readVersion(info) ?? this.status.availableVersion,
        clearError: true
      })
    })
    this.updater.on('update-not-available', () => {
      this.updateStatus('no-update-available', {
        lastCheckedAt: this.status.lastCheckedAt ?? this.nowIso(),
        clearError: true
      })
    })
    this.updater.on('update-downloaded', (info) => {
      const version = readVersion(info) ?? this.status.availableVersion
      this.updateStatus('update-downloaded', {
        lastCheckedAt: this.status.lastCheckedAt ?? this.nowIso(),
        availableVersion: version,
        downloadedVersion: version,
        clearError: true
      })
    })
    this.updater.on('error', (error) => {
      this.updateStatus('error', {
        lastCheckedAt: this.status.lastCheckedAt ?? this.nowIso(),
        errorMessage: error instanceof Error ? error.message : UPDATE_ERROR_MESSAGE
      })
    })
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  onStatusChange(listener: UpdateStatusListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  startAutomaticChecks({ intervalMs = UPDATE_CHECK_INTERVAL_MS }: AutomaticCheckOptions = {}): void {
    if (!this.updateChecksEnabled || this.automaticCheckTimer) return

    void this.checkForUpdates()
    this.automaticCheckTimer = setInterval(() => {
      void this.checkForUpdates()
    }, intervalMs)
  }

  stopAutomaticChecks(): void {
    if (!this.automaticCheckTimer) return

    clearInterval(this.automaticCheckTimer)
    this.automaticCheckTimer = null
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    this.updateStatus('checking', { lastCheckedAt: this.nowIso(), clearError: true })

    if (!this.updateChecksEnabled) {
      this.updateStatus('no-update-available', {
        lastCheckedAt: this.status.lastCheckedAt,
        clearError: true
      })
      return this.status
    }

    try {
      await this.updater.checkForUpdates()
    } catch (error) {
      this.updateStatus('error', {
        lastCheckedAt: this.status.lastCheckedAt,
        errorMessage: error instanceof Error ? error.message : UPDATE_ERROR_MESSAGE
      })
    }

    return this.status
  }

  private updateStatus(
    state: UpdateStatus['state'],
    overrides: Partial<UpdateStatus> & { clearError?: boolean } = {}
  ): void {
    this.status = this.createStatus(state, overrides)
    for (const listener of this.listeners) listener(this.status)
  }

  private createStatus(
    state: UpdateStatus['state'],
    overrides: Partial<UpdateStatus> & { clearError?: boolean } = {}
  ): UpdateStatus {
    const previous = this.status

    return {
      currentVersion: this.currentVersion,
      releaseChannel: 'beta',
      lastCheckedAt: overrides.lastCheckedAt ?? previous?.lastCheckedAt ?? null,
      state,
      availableVersion: overrides.availableVersion ?? previous?.availableVersion ?? null,
      downloadedVersion: overrides.downloadedVersion ?? previous?.downloadedVersion ?? null,
      errorMessage: overrides.clearError ? null : (overrides.errorMessage ?? previous?.errorMessage ?? null),
      releaseNotesUrl: GITHUB_RELEASE_NOTES_URL
    }
  }

  private nowIso(): string {
    return this.now().toISOString()
  }
}

let updateService: UpdateService | null = null

export function getUpdateService(): UpdateService {
  updateService ??= new UpdateService({
    currentVersion: app.getVersion(),
    updateChecksEnabled: isUpdateEnabledBuild()
  })
  return updateService
}

export function isUpdateEnabledBuild(): boolean {
  return process.platform === 'darwin' && app.isPackaged && process.env.NODE_ENV !== 'test'
}

function readVersion(info: unknown): string | null {
  if (!info || typeof info !== 'object') return null
  const version = (info as { version?: unknown }).version
  return typeof version === 'string' && version.length > 0 ? version : null
}
