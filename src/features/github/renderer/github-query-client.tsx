import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { GITHUB_CONNECTION_CHANGED_EVENT } from './hooks/use-github-connection'

export function createGitHubQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 10 * 60 * 1_000,
        retry: false,
        refetchOnMount: 'always',
        refetchOnWindowFocus: 'always',
        refetchInterval: false
      },
      mutations: { retry: false }
    }
  })
}

export function GitHubQueryProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [client] = useState(createGitHubQueryClient)

  useEffect(() => {
    const clearIdentityScopedData = (): void => {
      void client.resetQueries({ queryKey: ['github'] })
    }
    window.addEventListener(GITHUB_CONNECTION_CHANGED_EVENT, clearIdentityScopedData)
    return () =>
      window.removeEventListener(GITHUB_CONNECTION_CHANGED_EVENT, clearIdentityScopedData)
  }, [client])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
