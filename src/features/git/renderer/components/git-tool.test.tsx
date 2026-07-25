import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { GitTool } from './git-tool'

describe('GitTool', () => {
  it('requests by Project Session id and renders collapsible saved text diffs', async () => {
    const getProjectSessionReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'tracked' as const, name: 'origin/feature/test', ahead: 2, behind: 1 },
      files: [
        {
          path: 'README.md',
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: 'diff --git a/README.md b/README.md\n+Changed\n'
        }
      ]
    }))
    window.spacezero.git.getProjectSessionReview = getProjectSessionReview

    render(<GitTool sessionId="session-1" />)

    await screen.findByText('feature/test')
    expect(getProjectSessionReview).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(screen.getByText(/origin\/feature\/test/)).toHaveTextContent('2 ahead')
    expect(screen.getByText(/\+Changed/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /README.md/i }))
    await waitFor(() => expect(screen.queryByText(/\+Changed/)).not.toBeInTheDocument())
  })

  it('renders missing-worktree failures without repository data', async () => {
    window.spacezero.git.getProjectSessionReview = vi.fn(async () => ({
      status: 'missing-worktree' as const,
      message: 'This Project Session has no managed worktree.'
    }))

    render(<GitTool sessionId="session-1" />)

    await screen.findByText('Managed worktree missing')
    expect(screen.queryByText('Branch')).not.toBeInTheDocument()
  })
})
