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

  it('loads the main-owned primary action preference and sends an empty Commit & Push prompt through the agent path', async () => {
    const prompt = vi.fn<(request: { sessionId: string; message: string }) => Promise<void>>(
      async () => undefined
    )
    window.spacezero.settings.getGitActionSettings = vi.fn(async () => ({
      primaryGitAction: 'commit-and-push' as const
    }))
    window.spacezero.agent.prompt = prompt
    window.spacezero.git.getProjectSessionReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'src/app.ts',
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: 'diff --git a/src/app.ts b/src/app.ts\n+change\n'
        }
      ]
    }))

    render(<GitTool sessionId="session-1" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Commit & Push' }))

    expect(prompt).toHaveBeenCalledWith({
      sessionId: 'session-1',
      message: expect.stringContaining('inspect the current Git state')
    })
    const message = prompt.mock.calls[0]?.[0].message ?? ''
    expect(message).toContain('choose an appropriate commit message')
    expect(message).toContain('No upstream is currently configured')
    expect(message).not.toContain('diff --git')
    expect(message).not.toContain('+change')
  })

  it('passes composer text as preferred commit instructions without changing the saved primary action', async () => {
    const prompt = vi.fn<(request: { sessionId: string; message: string }) => Promise<void>>(
      async () => undefined
    )
    const updateGitActionSettings = vi.fn(async () => ({
      primaryGitAction: 'commit-and-push' as const
    }))
    window.spacezero.settings.getGitActionSettings = vi.fn(async () => ({
      primaryGitAction: 'commit-and-push' as const
    }))
    window.spacezero.settings.updateGitActionSettings = updateGitActionSettings
    window.spacezero.agent.prompt = prompt
    window.spacezero.git.getProjectSessionReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'tracked' as const, name: 'origin/feature/test', ahead: 0, behind: 0 },
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

    render(<GitTool sessionId="session-1" />)

    await userEvent.type(
      await screen.findByLabelText('Commit instructions'),
      'Use message: polish docs'
    )
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Commit' }))

    expect(updateGitActionSettings).not.toHaveBeenCalled()
    expect(prompt).toHaveBeenCalledWith({
      sessionId: 'session-1',
      message: expect.stringContaining(
        'Treat this as my preferred commit message or commit instructions'
      )
    })
    expect(prompt.mock.calls[0]?.[0].message ?? '').toContain('Use message: polish docs')
  })

  it('enables Commit & Push for an ahead branch with no uncommitted changes', async () => {
    const prompt = vi.fn<(request: { sessionId: string; message: string }) => Promise<void>>(
      async () => undefined
    )
    window.spacezero.agent.prompt = prompt
    window.spacezero.git.getProjectSessionReview = vi.fn(async () => ({
      status: 'clean' as const,
      branch: 'feature/test',
      upstream: { kind: 'tracked' as const, name: 'origin/feature/test', ahead: 1, behind: 0 },
      files: [] as []
    }))

    render(<GitTool sessionId="session-1" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Commit & Push' }))

    expect(prompt).toHaveBeenCalledWith({
      sessionId: 'session-1',
      message: expect.stringContaining('and push the branch')
    })
  })

  it('disables Git composer actions while the Project Session agent is running', async () => {
    window.spacezero.agent.getState = vi.fn(async () => ({
      sessionId: 'session-1',
      projectId: 'project-1',
      cwd: '/tmp/project-1',
      status: 'running' as const,
      live: true,
      transcriptPath: '/tmp/transcript.jsonl',
      modelProvider: 'faux',
      modelId: 'faux-1',
      thinkingLevel: 'medium' as const
    }))
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
          diff: 'diff --git a/README.md b/README.md\n+Changed\n'
        }
      ]
    }))

    render(<GitTool sessionId="session-1" />)

    expect(await screen.findByRole('button', { name: 'Commit & Push' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'More' })).toBeDisabled()
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
