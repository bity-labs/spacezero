import { useCallback, useEffect, useState } from 'react'

import type { GitHubConnection } from '../../shared'

const CONNECTION_CHANGED_EVENT = 'spacezero:github-connection-changed'

export function useGitHubConnection(): {
  connection: GitHubConnection | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  setConnection: (connection: GitHubConnection) => void
} {
  const [connection, setConnection] = useState<GitHubConnection | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      setConnection(await window.spacezero.github.getConnection())
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
    window.addEventListener(CONNECTION_CHANGED_EVENT, listener)
    return () => window.removeEventListener(CONNECTION_CHANGED_EVENT, listener)
  }, [refresh])

  return { connection, isLoading, error, refresh, setConnection }
}

export function notifyGitHubConnectionChanged(): void {
  window.dispatchEvent(new Event(CONNECTION_CHANGED_EVENT))
}
