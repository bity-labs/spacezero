import { app } from 'electron'
import electronUpdater from 'electron-updater'

import type { UpdateStatus } from '../shared'

export type UpdaterAdapter = {
  checkForUpdates: () => Promise<unknown>
  on: (event: string, listener: (...args: unknown[]) => void) => void
}

type UpdateServiceOptions = {
  currentVersion: string
  now?: () => Date
  updater?: UpdaterAdapter
}

export const GITHUB_RELEASE_NOTES_URL = 'https://github.com/bity-labs/spacezero/releases'

const UPDATE_ERROR_MESSAGE = 'Unable to check for updates.'

export class UpdateService {
  private readonly currentVersion: string
  private readonly now: () => Date
  private readonly updater: UpdaterAdapter
  private status: UpdateStatus

  constructor({
    currentVersion,
    now = () => new Date(),
    updater = electronUpdater.autoUpdater as unknown as UpdaterAdapter
  }: UpdateServiceOptions) {
    this.currentVersion = currentVersion
    this.now = now
    this.updater = updater
    this.status = this.createStatus('idle')

    this.updater.on('checking-for-update', () => {
      this.status = this.createStatus('checking', { lastCheckedAt: this.nowIso(), clearError: true })
    })
    this.updater.on('update-available', (info) => {
      this.status = this.createStatus('update-available', {
        lastCheckedAt: this.status.lastCheckedAt ?? this.nowIso(),
        availableVersion: readVersion(info) ?? this.status.availableVersion,
        clearError: true
      })
    })
    this.updater.on('update-not-available', () => {
      this.status = this.createStatus('no-update-available', {
        lastCheckedAt: this.status.lastCheckedAt ?? this.nowIso(),
        clearError: true
      })
    })
    this.updater.on('update-downloaded', (info) => {
      const version = readVersion(info) ?? this.status.availableVersion
      this.status = this.createStatus('update-downloaded', {
        lastCheckedAt: this.status.lastCheckedAt ?? this.nowIso(),
        availableVersion: version,
        downloadedVersion: version,
        clearError: true
      })
    })
    this.updater.on('error', (error) => {
      this.status = this.createStatus('error', {
        lastCheckedAt: this.status.lastCheckedAt ?? this.nowIso(),
        errorMessage: error instanceof Error ? error.message : UPDATE_ERROR_MESSAGE
      })
    })
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    this.status = this.createStatus('checking', { lastCheckedAt: this.nowIso(), clearError: true })

    try {
      await this.updater.checkForUpdates()
    } catch (error) {
      this.status = this.createStatus('error', {
        lastCheckedAt: this.status.lastCheckedAt,
        errorMessage: error instanceof Error ? error.message : UPDATE_ERROR_MESSAGE
      })
    }

    return this.status
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
  updateService ??= new UpdateService({ currentVersion: app.getVersion() })
  return updateService
}

function readVersion(info: unknown): string | null {
  if (!info || typeof info !== 'object') return null
  const version = (info as { version?: unknown }).version
  return typeof version === 'string' && version.length > 0 ? version : null
}
