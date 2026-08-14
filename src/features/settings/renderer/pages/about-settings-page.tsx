import { useEffect, useState } from 'react'

import type { UpdateStatus } from '../../../updates/shared'
import { UpdateRestartControl } from '../../../updates/renderer'
import { AboutSettingsScreen } from '../screens/about-settings-screen'

export function AboutSettingsPage(): React.JSX.Element {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [loadError, setLoadError] = useState(false)

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
    <AboutSettingsScreen
      updateStatus={updateStatus}
      loadError={loadError}
      restartControl={<UpdateRestartControl placement="settings" />}
      onCheckForUpdates={() => void handleCheckForUpdates()}
    />
  )
}
