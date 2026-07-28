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
