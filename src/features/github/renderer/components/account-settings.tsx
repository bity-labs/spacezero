import { useEffect, useRef, useState } from 'react'
import { ArrowSquareOut, Check, Copy, GithubLogo } from '@phosphor-icons/react'

import type { GitHubDeviceAuthorization, GitHubInstallation } from '../../shared'
import { notifyGitHubConnectionChanged, useGitHubConnection } from '../hooks/use-github-connection'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@renderer/components/ui/avatar'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'

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

  if (isLoading) {
    return <GitHubAccountLoadingPlaceholder />
  }

  const identity =
    !authorization && connection && 'identity' in connection ? connection.identity : null

  return (
    <div className="space-y-4">
      {loadError || error ? (
        <Alert variant="destructive">
          <AlertDescription>{error ?? loadError}</AlertDescription>
        </Alert>
      ) : null}

      {identity ? (
        <Card className="gap-4 p-5">
          <div className="flex items-center gap-3">
            <Avatar className="size-11">
              <AvatarImage src={identity.avatarUrl} alt={`@${identity.login}`} />
              <AvatarFallback>{identity.login.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">@{identity.login}</p>
              <p className="text-sm text-muted-foreground">{getConnectionLabel(connection)}</p>
            </div>
          </div>
          {connection?.status === 'reconnect-required' ? (
            <Button className="w-fit gap-2" onClick={() => void startAuthorization()}>
              <GithubLogo className="size-4" aria-hidden="true" />
              Reconnect GitHub
            </Button>
          ) : connection?.status === 'connected' ? (
            <p className="text-sm text-muted-foreground">
              {connection.repositories.length} accessible{' '}
              {connection.repositories.length === 1 ? 'repository' : 'repositories'} across{' '}
              {connection.installations.length}{' '}
              {connection.installations.length === 1 ? 'installation' : 'installations'}.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Install the Space Zero GitHub App and choose selected or all repositories. Issue,
                Pull Request, contents, and workflow write access is requested only for explicit
                builder actions; checks and statuses remain read-only.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button className="w-fit gap-2" onClick={() => void openInstallation()}>
                  <ArrowSquareOut className="size-4" aria-hidden="true" />
                  Choose repository access
                </Button>
                <Button variant="outline" onClick={() => void checkRepositoryAccess()}>
                  Check repository access
                </Button>
              </div>
            </div>
          )}
          {connection && 'installations' in connection && connection.installations ? (
            <InstallationGroups installations={connection.installations} />
          ) : null}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {connection?.status !== 'reconnect-required' ? (
              <Button variant="outline" onClick={() => void openInstallation()}>
                Add or change repository access
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void openManageAccess()}>
              Manage/Revoke access on GitHub
            </Button>
            <Button variant="ghost" onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </div>
        </Card>
      ) : authorization ? (
        <Card className="gap-5 p-5">
          <div>
            <p className="font-medium">Enter this code on GitHub</p>
            <p className="mt-1 text-sm text-muted-foreground">
              GitHub opened in your system browser. This code expires at{' '}
              {new Date(authorization.expiresAt).toLocaleTimeString()}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded-md border bg-muted px-4 py-2 text-lg font-semibold tracking-widest">
              {authorization.userCode}
            </code>
            <Button variant="outline" className="gap-2" onClick={() => void copyCode()}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy code'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() =>
                void window.spacezero.github.openAuthorization({ flowId: authorization.flowId })
              }
            >
              <ArrowSquareOut className="size-4" aria-hidden="true" />
              Open GitHub
            </Button>
            <Button variant="ghost" onClick={() => void cancelAuthorization()}>
              Cancel
            </Button>
          </div>
          <p className="text-sm text-muted-foreground" role="status">
            Waiting for GitHub authorization…
          </p>
        </Card>
      ) : (
        <Card className="gap-4 p-5">
          <div>
            <p className="font-medium">Connect GitHub</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use GitHub Issues and Pull Requests without creating a Space Zero account. GitHub
              opens in your system browser.
            </p>
          </div>
          <Button className="w-fit gap-2" onClick={() => void startAuthorization()}>
            <GithubLogo className="size-4" aria-hidden="true" />
            Connect GitHub
          </Button>
        </Card>
      )}
    </div>
  )
}

function GitHubAccountLoadingPlaceholder(): React.JSX.Element {
  return (
    <div className="space-y-4" role="status" aria-label="Loading GitHub account">
      <Card className="gap-4 p-5" data-testid="github-account-loading-card" aria-hidden="true">
        <div className="flex items-center gap-3">
          <div className="size-11 animate-pulse rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full max-w-md animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-3 border-t pt-4">
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-9 w-44 animate-pulse rounded-md bg-muted" />
          <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
        </div>
      </Card>
    </div>
  )
}

function InstallationGroups({
  installations
}: {
  installations: GitHubInstallation[]
}): React.JSX.Element | null {
  if (installations.length === 0) return null

  const personal = installations.filter((installation) => installation.owner.type === 'user')
  const organizations = installations.filter(
    (installation) => installation.owner.type === 'organization'
  )

  return (
    <div className="space-y-4 border-t pt-4">
      <InstallationGroup title="Personal" installations={personal} />
      <InstallationGroup title="Organizations" installations={organizations} />
    </div>
  )
}

function InstallationGroup({
  title,
  installations
}: {
  title: string
  installations: GitHubInstallation[]
}): React.JSX.Element | null {
  if (installations.length === 0) return null

  return (
    <section aria-label={`${title} GitHub installations`} className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      {installations.map((installation) => (
        <div
          key={installation.id}
          className="flex items-center justify-between gap-4 rounded-md border p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{installation.owner.login}</p>
            <p className="text-xs text-muted-foreground">{getInstallationStatus(installation)}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {installation.repositoryCount}{' '}
            {installation.repositoryCount === 1 ? 'repository' : 'repositories'}
          </span>
        </div>
      ))}
    </section>
  )
}

function getInstallationStatus(installation: GitHubInstallation): string {
  if (installation.status === 'organization-authorization-required') {
    return 'Organization or SSO authorization required'
  }
  if (installation.status === 'suspended') return 'Installation unavailable'
  if (installation.status === 'no-repositories') return 'No accessible repositories'
  return installation.repositorySelection === 'all' ? 'All repositories' : 'Selected repositories'
}

function getConnectionLabel(
  connection: ReturnType<typeof useGitHubConnection>['connection']
): string {
  if (connection?.status === 'connected') return 'Connected'
  if (connection?.status === 'reconnect-required') return 'Reconnect GitHub'
  return 'Repository access required'
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
