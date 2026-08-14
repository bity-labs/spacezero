import { useEffect, useRef, useState } from 'react'

import type { GitHubDeviceAuthorization } from '../../shared'
import { notifyGitHubConnectionChanged, useGitHubConnection } from '../hooks/use-github-connection'
import { GitHubAccountSettingsScreen } from './github-account-settings-screen'

export function AccountSettings(): React.JSX.Element {
  const { connection, isLoading, error: loadError, refresh, setConnection } = useGitHubConnection()
  const [authorization, setAuthorization] = useState<GitHubDeviceAuthorization | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const attemptRef = useRef(0)
  const pendingAuthorizationRef = useRef<GitHubDeviceAuthorization | null>(null)

  useEffect(() => {
    return () => {
      attemptRef.current += 1
      const pendingAuthorization = pendingAuthorizationRef.current
      pendingAuthorizationRef.current = null
      if (pendingAuthorization) {
        void window.spacezero.github
          .cancelAuthorization({ flowId: pendingAuthorization.flowId })
          .catch(() => undefined)
      }
    }
  }, [])

  async function startAuthorization(): Promise<void> {
    const attempt = ++attemptRef.current
    setError(null)
    setCopied(false)

    try {
      const nextAuthorization = await window.spacezero.github.startAuthorization()
      if (attempt !== attemptRef.current) {
        await window.spacezero.github
          .cancelAuthorization({ flowId: nextAuthorization.flowId })
          .catch(() => undefined)
        return
      }
      pendingAuthorizationRef.current = nextAuthorization
      setAuthorization(nextAuthorization)

      const nextConnection = await window.spacezero.github.waitForAuthorization({
        flowId: nextAuthorization.flowId
      })
      if (attempt !== attemptRef.current) return
      pendingAuthorizationRef.current = null
      setConnection(nextConnection)
      setAuthorization(null)
      notifyGitHubConnectionChanged()
    } catch (caught) {
      if (attempt !== attemptRef.current) return
      pendingAuthorizationRef.current = null
      setAuthorization(null)
      setError(toAuthorizationError(caught))
    }
  }

  async function cancelAuthorization(): Promise<void> {
    const current = pendingAuthorizationRef.current
    attemptRef.current += 1
    pendingAuthorizationRef.current = null
    setAuthorization(null)
    setError(null)
    if (current) {
      await window.spacezero.github
        .cancelAuthorization({ flowId: current.flowId })
        .catch(() => undefined)
    }
  }

  async function copyCode(): Promise<void> {
    if (!authorization) return
    await window.spacezero.github.copyDeviceCode({ flowId: authorization.flowId })
    setCopied(true)
  }

  async function openAuthorization(): Promise<void> {
    if (!authorization) return
    await window.spacezero.github.openAuthorization({ flowId: authorization.flowId })
  }

  async function openInstallation(): Promise<void> {
    setError(null)
    try {
      await window.spacezero.github.openInstallation()
    } catch (caught) {
      setError(toAuthorizationError(caught))
    }
  }

  async function checkRepositoryAccess(): Promise<void> {
    setError(null)
    await refresh({ force: true })
    notifyGitHubConnectionChanged()
  }

  async function openManageAccess(): Promise<void> {
    setError(null)
    try {
      await window.spacezero.github.openManageAccess()
    } catch (caught) {
      setError(toAuthorizationError(caught))
    }
  }

  async function disconnect(): Promise<void> {
    if (!window.confirm('Disconnect GitHub from Space Zero? Local Projects and files are kept.')) {
      return
    }
    setError(null)
    try {
      await window.spacezero.github.disconnect()
      setConnection({ status: 'disconnected' })
      notifyGitHubConnectionChanged()
    } catch (caught) {
      setError(toAuthorizationError(caught))
    }
  }

  return (
    <GitHubAccountSettingsScreen
      connection={connection}
      isLoading={isLoading}
      error={error ?? loadError}
      authorization={authorization}
      copied={copied}
      onStartAuthorization={() => void startAuthorization()}
      onCancelAuthorization={() => void cancelAuthorization()}
      onCopyCode={() => void copyCode()}
      onOpenAuthorization={() => void openAuthorization()}
      onOpenInstallation={() => void openInstallation()}
      onCheckRepositoryAccess={() => void checkRepositoryAccess()}
      onOpenManageAccess={() => void openManageAccess()}
      onDisconnect={() => void disconnect()}
    />
  )
}

function toAuthorizationError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('authorization-cancelled')) return 'GitHub authorization was cancelled.'
  if (message.includes('authorization-denied'))
    return 'GitHub authorization was denied. Try again or continue locally.'
  if (message.includes('authorization-expired')) return 'The GitHub device code expired. Try again.'
  if (message.includes('configuration-missing'))
    return 'GitHub integration is not configured for this build.'
  if (message.includes('credentials-unavailable'))
    return 'Protected credential storage is unavailable on this device.'
  return 'GitHub authorization failed. Check your connection and try again.'
}
