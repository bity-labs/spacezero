import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
