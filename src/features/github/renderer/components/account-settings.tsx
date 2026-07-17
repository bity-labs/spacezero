import { useRef, useState } from 'react'
import { ArrowSquareOut, Check, Copy, GithubLogo } from '@phosphor-icons/react'

import type { GitHubDeviceAuthorization } from '../../shared'
import { notifyGitHubConnectionChanged, useGitHubConnection } from '../hooks/use-github-connection'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@renderer/components/ui/avatar'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'

export function AccountSettings(): React.JSX.Element {
  const { connection, isLoading, error: loadError, setConnection } = useGitHubConnection()
  const [authorization, setAuthorization] = useState<GitHubDeviceAuthorization | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const attemptRef = useRef(0)

  async function startAuthorization(): Promise<void> {
    const attempt = ++attemptRef.current
    setError(null)
    setCopied(false)

    try {
      const nextAuthorization = await window.spacezero.github.startAuthorization()
      if (attempt !== attemptRef.current) return
      setAuthorization(nextAuthorization)

      const nextConnection = await window.spacezero.github.waitForAuthorization({
        flowId: nextAuthorization.flowId
      })
      if (attempt !== attemptRef.current) return
      setConnection(nextConnection)
      setAuthorization(null)
      notifyGitHubConnectionChanged()
    } catch (caught) {
      if (attempt !== attemptRef.current) return
      setAuthorization(null)
      setError(toAuthorizationError(caught))
    }
  }

  async function cancelAuthorization(): Promise<void> {
    const current = authorization
    attemptRef.current += 1
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

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading GitHub account…</p>
  }

  const identity = connection && 'identity' in connection ? connection.identity : null

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
              <p className="text-sm text-muted-foreground">
                {connection?.status === 'reconnect-required'
                  ? 'Reconnect GitHub'
                  : 'Repository access required'}
              </p>
            </div>
          </div>
          {connection?.status === 'reconnect-required' ? (
            <Button className="w-fit gap-2" onClick={() => void startAuthorization()}>
              <GithubLogo className="size-4" aria-hidden="true" />
              Reconnect GitHub
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your identity is authorized. Install the Space Zero GitHub App to choose repository
              access.
            </p>
          )}
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
