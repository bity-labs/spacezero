import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { UpdateStatus } from '../../../updates/shared'
import { UpdateRestartControl } from '../../../updates/renderer'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { SettingsPageHeader } from '../components/settings-page-header'
import { SettingsRow } from '../components/settings-row'
import { SettingsSection } from '../components/settings-section'

function getUpdateStateLabel(
  status: UpdateStatus | null,
  t: ReturnType<typeof useTranslation>['t'],
  loadError: boolean
): string {
  if (loadError) return t('settings.about.states.error')
  if (!status) return t('settings.about.loading')

  return t(`settings.about.states.${status.state}`)
}

function formatUpdateCheckedAt(
  lastCheckedAt: string | null | undefined,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (!lastCheckedAt) return t('settings.about.neverChecked')

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(lastCheckedAt))
}

export function AboutSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [loadError, setLoadError] = useState(false)
  const isChecking = updateStatus?.state === 'checking'

  useEffect(() => {
    let isCurrent = true
    const unsubscribe = window.spacezero.update.onStatusChange((status) => {
      if (!isCurrent) return
      setLoadError(false)
      setUpdateStatus(status)
    })

    window.spacezero.update
      .getStatus()
      .then((status) => {
        if (!isCurrent) return
        setUpdateStatus(status)
      })
      .catch(() => {
        if (!isCurrent) return
        setLoadError(true)
      })

    return () => {
      isCurrent = false
      unsubscribe()
    }
  }, [])

  async function handleCheckForUpdates(): Promise<void> {
    setLoadError(false)
    setUpdateStatus((status) =>
      status ? { ...status, state: 'checking', errorMessage: null } : status
    )

    try {
      const status = await window.spacezero.update.checkForUpdates()
      setUpdateStatus(status)
    } catch {
      setLoadError(true)
    }
  }

  return (
    <>
      <SettingsPageHeader title={t('settings.about.title')} />
      <div className="space-y-8">
        <SettingsSection>
          <SettingsRow
            title={t('settings.about.versionLabel')}
            description={updateStatus?.currentVersion ?? t('settings.about.loading')}
          >
            {null}
          </SettingsRow>
          <SettingsRow
            title={t('settings.about.updateStateLabel')}
            description={getUpdateStateLabel(updateStatus, t, loadError)}
          >
            <div className="flex items-center gap-2">
              {updateStatus?.availableVersion ? (
                <Badge variant="outline">{updateStatus.availableVersion}</Badge>
              ) : null}
              <UpdateRestartControl placement="settings" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCheckForUpdates()}
                disabled={isChecking}
              >
                {isChecking ? t('settings.about.checkingAction') : t('settings.about.checkAction')}
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow
            title={t('settings.about.lastCheckedLabel')}
            description={formatUpdateCheckedAt(updateStatus?.lastCheckedAt, t)}
          >
            {updateStatus?.downloadedVersion ? (
              <Badge variant="outline">{updateStatus.downloadedVersion}</Badge>
            ) : null}
          </SettingsRow>
          {loadError || updateStatus?.state === 'error' ? (
            <div className="border-t border-border/70 p-4">
              <Alert variant="destructive">
                <AlertDescription>
                  {updateStatus?.errorMessage ?? t('settings.about.loadError')}
                </AlertDescription>
              </Alert>
            </div>
          ) : null}
        </SettingsSection>
      </div>
    </>
  )
}
