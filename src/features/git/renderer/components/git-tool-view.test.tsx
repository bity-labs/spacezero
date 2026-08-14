import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { GitToolView, type GitToolViewProps } from './git-tool-view'

const baseProps = {
  filter: 'uncommitted',
  state: null,
  isRefreshing: false,
  onFilterChange: vi.fn(),
  onRefresh: vi.fn(),
  onToggleFile: vi.fn()
} satisfies GitToolViewProps

describe('GitToolView', () => {
  it('renders loading and emits refresh intent without using the Git runtime', async () => {
    const onRefresh = vi.fn()

    render(<GitToolView {...baseProps} onRefresh={onRefresh} />)

    expect(screen.getByRole('heading', { name: 'Loading Git…' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh Git status' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('renders clean and unavailable repository states from props', () => {
    const { rerender } = render(
      <GitToolView
        {...baseProps}
        state={{
          status: 'clean',
          branch: 'main',
          upstream: { kind: 'tracked', name: 'origin/main', ahead: 0, behind: 0 },
          files: []
        }}
      />
    )

    expect(screen.getByText('No uncommitted changes')).toBeInTheDocument()
    expect(screen.getByText('Clean')).toBeInTheDocument()

    rerender(
      <GitToolView
        {...baseProps}
        state={{ status: 'missing-worktree', message: 'No Git repository is available.' }}
      />
    )
    expect(screen.getByRole('heading', { name: 'Managed worktree missing' })).toBeInTheDocument()
    expect(screen.getByText('No Git repository is available.')).toBeInTheDocument()
  })

  it('renders commit actions ready or disabled from the supplied visual state', () => {
    const state = {
      status: 'ok' as const,
      branch: 'feature/storybook',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'assets/logo.png',
          kind: 'modified' as const,
          binary: true,
          large: false,
          diff: null
        }
      ]
    }
    const footer = {
      kind: 'commit' as const,
      actionAvailability: {
        commit: true,
        'commit-and-push': true,
        'commit-and-create-pr': true
      },
      actions: ['commit-and-push', 'commit-and-create-pr', 'commit'] as const,
      actionsReady: true,
      busy: false,
      instructions: '',
      menuOpen: false,
      primaryAction: 'commit-and-push' as const,
      primaryDisabled: false,
      onInstructionsChange: vi.fn(),
      onMenuOpenChange: vi.fn(),
      onPrimaryActionChange: vi.fn(),
      onSubmit: vi.fn()
    }

    const { rerender } = render(<GitToolView {...baseProps} footer={footer} state={state} />)
    expect(screen.getByText('Binary change summary only. No text diff is available.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Commit & Push' })).toBeEnabled()

    rerender(
      <GitToolView
        {...baseProps}
        footer={{ ...footer, actionsReady: false, primaryDisabled: true }}
        state={state}
      />
    )
    expect(screen.getByRole('button', { name: 'Commit & Push' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Choose Git commit action' })).toBeDisabled()
  })
})
