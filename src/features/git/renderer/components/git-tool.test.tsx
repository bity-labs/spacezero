import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { GitTool } from './git-tool'

describe('GitTool', () => {
  it('defaults to Uncommitted, requests by Project Session id, and renders collapsible saved text diffs', async () => {
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

    expect(screen.getByRole('tab', { name: 'Uncommitted' })).toHaveAttribute('aria-selected', 'true')
    await screen.findByText('feature/test')
    expect(getProjectSessionReview).toHaveBeenCalledWith({ sessionId: 'session-1', filter: 'uncommitted' })
    expect(screen.getByText(/origin\/feature\/test/)).toHaveTextContent('2 ahead')
    expect(screen.getByText(/\+Changed/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /README.md/i }))
    await waitFor(() => expect(screen.queryByText(/\+Changed/)).not.toBeInTheDocument())
  })

  it('switches filters through renderer-local state and keeps file expansion local', async () => {
    const getProjectSessionReview = vi.fn(async ({ filter }: { filter: string }) => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: `${filter}.md`,
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: `diff --git a/${filter}.md b/${filter}.md\n+${filter}\n`
        }
      ]
    }))
    window.spacezero.git.getProjectSessionReview = getProjectSessionReview

    render(<GitTool sessionId="session-1" />)

    await screen.findByText(/\+uncommitted/)
    await userEvent.click(screen.getByRole('tab', { name: 'Staged' }))
    await screen.findByText(/\+staged/)
    expect(getProjectSessionReview).toHaveBeenLastCalledWith({ sessionId: 'session-1', filter: 'staged' })
    expect(screen.getByRole('tab', { name: 'Staged' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('button', { name: /staged.md/i }))
    await waitFor(() => expect(screen.queryByText(/\+staged/)).not.toBeInTheDocument())
    expect(getProjectSessionReview).toHaveBeenCalledTimes(2)
  })

  it('folds long unchanged regions without hiding changed lines', async () => {
    const unchanged = Array.from({ length: 8 }, (_, index) => ` line ${index + 1}`).join('\n')
    window.spacezero.git.getProjectSessionReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'README.md',
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: `@@ -1,9 +1,9 @@\n+changed before\n${unchanged}\n-changed after\n`
        }
      ]
    }))

    render(<GitTool sessionId="session-1" />)

    await screen.findByText('+changed before')
    expect(screen.getByText('-changed after')).toBeInTheDocument()
    expect(screen.getByText('… 2 unchanged lines folded')).toBeInTheDocument()
    expect(screen.queryByText(' line 4')).not.toBeInTheDocument()
  })

  it('renders binary and large diff summaries instead of inline content', async () => {
    window.spacezero.git.getProjectSessionReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        { path: 'image.bin', kind: 'modified' as const, binary: true, large: false, diff: null },
        { path: 'large.txt', kind: 'modified' as const, binary: false, large: true, diff: null }
      ]
    }))

    render(<GitTool sessionId="session-1" />)

    await screen.findByText('Binary change summary only. No text diff is available.')
    expect(screen.getByText('Diff is too large to render inline.')).toBeInTheDocument()
  })

  it('renders file header paths and renamed, deleted, added, untracked, and conflicted states', async () => {
    window.spacezero.git.getProjectSessionReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        { path: 'conflict.txt', kind: 'conflicted' as const, binary: false, large: false, diff: null },
        { path: 'added.txt', kind: 'added' as const, binary: false, large: false, diff: null },
        { path: 'deleted.txt', kind: 'deleted' as const, binary: false, large: false, diff: null },
        { path: 'renamed.txt', oldPath: 'old.txt', kind: 'renamed' as const, binary: false, large: false, diff: null },
        { path: 'untracked.txt', kind: 'untracked' as const, binary: false, large: false, diff: null }
      ]
    }))

    render(<GitTool sessionId="session-1" />)

    const renamed = await screen.findByRole('button', { name: /renamed.txt/i })
    expect(within(renamed).getByText('renamed')).toBeInTheDocument()
    expect(screen.getByText('renamed from old.txt')).toBeInTheDocument()
    for (const kind of ['conflicted', 'added', 'deleted', 'untracked']) {
      expect(screen.getByText(kind)).toBeInTheDocument()
    }
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
