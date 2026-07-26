import { render, screen, waitFor } from '@testing-library/react'
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

    expect(screen.getByRole('tab', { name: 'Uncommitted' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await screen.findByText('feature/test')
    expect(getProjectSessionReview).toHaveBeenCalledWith({
      sessionId: 'session-1',
      filter: 'uncommitted'
    })
    expect(screen.getByText(/origin\/feature\/test/)).toHaveTextContent('2 ahead')
    expect(screen.getByText(/\+Changed/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Collapse' }))
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
    expect(getProjectSessionReview).toHaveBeenCalledWith({
      sessionId: 'session-1',
      filter: 'staged'
    })
    expect(screen.getByRole('tab', { name: 'Staged' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Collapse' }))
    await waitFor(() => expect(screen.queryByText(/\+staged/)).not.toBeInTheDocument())
    expect(getProjectSessionReview).toHaveBeenCalledTimes(3)
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

  it('keeps composer actions available when the Staged filter is clean but unstaged changes exist', async () => {
    const prompt = vi.fn<(request: { sessionId: string; message: string }) => Promise<void>>(
      async () => undefined
    )
    window.spacezero.agent.prompt = prompt
    window.spacezero.git.getProjectSessionReview = vi.fn(async ({ filter }: { filter: string }) =>
      filter === 'staged'
        ? {
            status: 'clean' as const,
            branch: 'feature/test',
            upstream: {
              kind: 'tracked' as const,
              name: 'origin/feature/test',
              ahead: 0,
              behind: 0
            },
            files: [] as []
          }
        : {
            status: 'ok' as const,
            branch: 'feature/test',
            upstream: {
              kind: 'tracked' as const,
              name: 'origin/feature/test',
              ahead: 0,
              behind: 0
            },
            files: [
              {
                path: 'unstaged.txt',
                kind: 'modified' as const,
                binary: false,
                large: false,
                diff: 'diff --git a/unstaged.txt b/unstaged.txt\n+unstaged\n'
              }
            ]
          }
    )

    render(<GitTool sessionId="session-1" />)

    await screen.findByText(/\+unstaged/)
    await userEvent.click(screen.getByRole('tab', { name: 'Staged' }))
    await screen.findByText('No staged changes')

    await userEvent.click(screen.getByRole('button', { name: 'Commit & Push' }))
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    const commitAction = await screen.findByRole('menuitem', { name: 'Commit' })
    expect(commitAction).not.toBeDisabled()
    await userEvent.click(commitAction)

    expect(prompt).toHaveBeenCalledTimes(2)
    expect(prompt.mock.calls[0]?.[0].message ?? '').toContain('and push the branch')
    expect(prompt.mock.calls[1]?.[0].message ?? '').toContain('create an appropriate commit')
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

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Commit & Push' })).toBeDisabled()
    )
    expect(screen.getByRole('button', { name: 'More' })).toBeDisabled()
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
        {
          path: 'conflict.txt',
          kind: 'conflicted' as const,
          binary: false,
          large: false,
          diff: null
        },
        { path: 'added.txt', kind: 'added' as const, binary: false, large: false, diff: null },
        { path: 'deleted.txt', kind: 'deleted' as const, binary: false, large: false, diff: null },
        {
          path: 'renamed.txt',
          oldPath: 'old.txt',
          kind: 'renamed' as const,
          binary: false,
          large: false,
          diff: null
        },
        {
          path: 'untracked.txt',
          kind: 'untracked' as const,
          binary: false,
          large: false,
          diff: null
        }
      ]
    }))

    render(<GitTool sessionId="session-1" />)

    await screen.findByRole('button', { name: /renamed.txt/i })
    expect(screen.getByText('renamed')).toBeInTheDocument()
    expect(screen.getByText('renamed from old.txt')).toBeInTheDocument()
    for (const kind of ['conflicted', 'added', 'deleted', 'untracked']) {
      expect(screen.getByText(kind)).toBeInTheDocument()
    }
  })

  it('hands editable changed filenames and diff lines to Files before switching the shared Tool Pane', async () => {
    const openLocation = vi.fn(async () => ({ status: 'opened' as const }))
    const openFilesTool = vi.fn()
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
          diff: '@@ -9,2 +9,3 @@\n context\n+changed\n'
        },
        {
          path: 'new-note.md',
          kind: 'untracked' as const,
          binary: false,
          large: false,
          diff: 'diff --git a/new-note.md b/new-note.md\nnew file mode 100644\n--- /dev/null\n+++ b/new-note.md\n+first\n+second\n'
        }
      ]
    }))

    render(<GitTool sessionId="session-1" filesHandoff={{ openFilesTool, openLocation }} />)

    await userEvent.click(await screen.findByRole('button', { name: 'src/app.ts' }))
    expect(openLocation).toHaveBeenCalledWith({ relativePath: 'src/app.ts', line: undefined })
    expect(openFilesTool).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: '+changed' }))
    expect(openLocation).toHaveBeenLastCalledWith({ relativePath: 'src/app.ts', line: 10 })
    expect(openFilesTool).toHaveBeenCalledTimes(2)

    await userEvent.click(screen.getByRole('button', { name: '+second' }))
    expect(openLocation).toHaveBeenLastCalledWith({ relativePath: 'new-note.md', line: 2 })
    expect(openFilesTool).toHaveBeenCalledTimes(3)
  })

  it('lets Files determine non-deleted handoff support while keeping actual unsupported files in Git', async () => {
    const openLocation = vi.fn(async ({ relativePath }: { relativePath: string }) =>
      relativePath === 'image.png'
        ? { status: 'failed' as const, message: 'This file is binary and cannot be edited in Files.' }
        : { status: 'opened' as const }
    )
    const openFilesTool = vi.fn()
    window.spacezero.git.getProjectSessionReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        { path: 'deleted.txt', kind: 'deleted' as const, binary: false, large: false, diff: null },
        { path: 'image.png', kind: 'modified' as const, binary: true, large: false, diff: null },
        { path: 'large-but-text.txt', kind: 'modified' as const, binary: false, large: true, diff: null }
      ]
    }))

    render(<GitTool sessionId="session-1" filesHandoff={{ openFilesTool, openLocation }} />)

    expect(await screen.findByRole('button', { name: 'deleted.txt' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'image.png' }))
    expect(await screen.findByText('This file is binary and cannot be edited in Files.')).toBeInTheDocument()
    expect(openFilesTool).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'large-but-text.txt' }))
    expect(openLocation).toHaveBeenLastCalledWith({
      relativePath: 'large-but-text.txt',
      line: undefined
    })
    expect(openFilesTool).toHaveBeenCalledTimes(1)
  })

  it('reports stale path handoff failures without switching to Files', async () => {
    const openLocation = vi.fn(async () => ({
      status: 'failed' as const,
      message: 'This file no longer exists. Refresh Git and Files, then try again.'
    }))
    const openFilesTool = vi.fn()
    window.spacezero.git.getProjectSessionReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'stale.txt',
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: '@@ -1 +1 @@\n+stale\n'
        }
      ]
    }))

    render(<GitTool sessionId="session-1" filesHandoff={{ openFilesTool, openLocation }} />)

    await userEvent.click(await screen.findByRole('button', { name: 'stale.txt' }))

    expect(
      await screen.findByText('This file no longer exists. Refresh Git and Files, then try again.')
    ).toBeInTheDocument()
    expect(openFilesTool).not.toHaveBeenCalled()
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
