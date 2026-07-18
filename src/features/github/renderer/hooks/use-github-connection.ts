import { useCallback, useEffect, useState } from 'react'

import type { GitHubConnection } from '../../shared'

export const GITHUB_CONNECTION_CHANGED_EVENT = 'spacezero:github-connection-changed'

export function useGitHubConnection(): {
  connection: GitHubConnection | null
  isLoading: boolean
  error: string | null
  refresh: (options?: { force?: boolean }) => Promise<void>
  setConnection: (connection: GitHubConnection) => void
} {
  const [connection, setConnection] = useState<GitHubConnection | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    setError(null)
    try {
      setConnection(
        await (force
          ? window.spacezero.github.refreshConnection()
          : window.spacezero.github.getConnection())
      )
    } catch {
      setError('Unable to read the GitHub connection.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    async function loadConnection(): Promise<void> {
      await refresh()
    }

    void loadConnection()
    const listener = (): void => {
      void refresh()
    }
    window.addEventListener(GITHUB_CONNECTION_CHANGED_EVENT, listener)
    return () => window.removeEventListener(GITHUB_CONNECTION_CHANGED_EVENT, listener)
  }, [refresh])

  return { connection, isLoading, error, refresh, setConnection }
}

export function notifyGitHubConnectionChanged(): void {
  window.dispatchEvent(new Event(GITHUB_CONNECTION_CHANGED_EVENT))
}
