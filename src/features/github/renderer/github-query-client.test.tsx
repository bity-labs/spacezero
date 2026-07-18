import { render, screen, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { GitHubQueryProvider } from './github-query-client'
import { notifyGitHubConnectionChanged } from './hooks/use-github-connection'

function PrivateGitHubData({ load }: { load: () => Promise<string> }): React.JSX.Element {
  const query = useQuery({ queryKey: ['github', 'private-data'], queryFn: load })
  return <p>{query.data ?? 'No GitHub data'}</p>
}

describe('GitHub query cache', () => {
  it('clears identity-scoped GitHub data when the connection changes', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('private repository data')
      .mockImplementation(() => new Promise<string>(() => undefined))

    render(
      <GitHubQueryProvider>
        <PrivateGitHubData load={load} />
      </GitHubQueryProvider>
    )

    expect(await screen.findByText('private repository data')).toBeInTheDocument()
    notifyGitHubConnectionChanged()

    await waitFor(() => {
      expect(screen.queryByText('private repository data')).not.toBeInTheDocument()
      expect(screen.getByText('No GitHub data')).toBeInTheDocument()
    })
  })
})
