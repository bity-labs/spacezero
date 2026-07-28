import { useCallback, useEffect, useRef, useState } from 'react'

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
  const refreshRequestId = useRef(0)

  const refresh = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const requestId = refreshRequestId.current + 1
    refreshRequestId.current = requestId
    setError(null)
    setConnection(null)
    setIsLoading(true)
    try {
      const nextConnection = await (force
        ? window.spacezero.github.refreshConnection()
        : window.spacezero.github.getConnection())
      if (refreshRequestId.current === requestId) {
        setConnection(nextConnection)
      }
    } catch {
      if (refreshRequestId.current === requestId) {
        setError('Unable to read the GitHub connection.')
      }
    } finally {
      if (refreshRequestId.current === requestId) {
        setIsLoading(false)
      }
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
