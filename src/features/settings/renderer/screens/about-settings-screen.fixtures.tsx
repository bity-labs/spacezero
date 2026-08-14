import { Badge } from '@renderer/components/ui/badge'
import type { AboutSettingsScreenProps } from './about-settings-screen'

const noOp = (): void => undefined

export const aboutSettingsScreenDefaultArgs = {
  updateStatus: {
    state: 'update-available',
    currentVersion: '0.9.0',
    releaseChannel: 'beta',
    availableVersion: '1.0.0',
    downloadedVersion: null,
    lastCheckedAt: '2026-01-15T10:30:00.000Z',
    errorMessage: null,
    releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases/tag/v1.0.0'
  },
  loadError: false,
  restartControl: <Badge variant="outline">Restart ready</Badge>,
  onCheckForUpdates: noOp
} satisfies AboutSettingsScreenProps

export const aboutSettingsScreenCheckingArgs = {
  ...aboutSettingsScreenDefaultArgs,
  updateStatus: {
    ...aboutSettingsScreenDefaultArgs.updateStatus,
    state: 'checking',
    availableVersion: null
  }
} satisfies AboutSettingsScreenProps

export const aboutSettingsScreenErrorArgs = {
  ...aboutSettingsScreenDefaultArgs,
  updateStatus: {
    ...aboutSettingsScreenDefaultArgs.updateStatus,
    state: 'error',
    availableVersion: null,
    errorMessage: 'Could not reach the update service.'
  }
} satisfies AboutSettingsScreenProps
