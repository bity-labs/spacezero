export type UpdateState =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'update-downloaded'
  | 'no-update-available'
  | 'error'

export type ReleaseChannel = 'beta'

export type UpdateStatus = {
  currentVersion: string
  releaseChannel: ReleaseChannel
  lastCheckedAt: string | null
  state: UpdateState
  availableVersion: string | null
  downloadedVersion: string | null
  errorMessage: string | null
  releaseNotesUrl: string
}

export type UpdateActiveWorkSummary = {
  projectSessions: number
  chatContexts: number
  terminalTabs: number
}

export type ApplyDownloadedUpdateRequest = {
  confirmActiveWork?: boolean
}

export type ApplyDownloadedUpdateResult =
  | {
      status: 'needs-confirmation'
      activeWork: UpdateActiveWorkSummary
      updateStatus: UpdateStatus
    }
  | {
      status: 'applying'
      activeWork: UpdateActiveWorkSummary
      updateStatus: UpdateStatus
    }
  | {
      status: 'no-downloaded-update'
      activeWork: UpdateActiveWorkSummary
      updateStatus: UpdateStatus
    }
