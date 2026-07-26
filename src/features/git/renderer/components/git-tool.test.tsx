import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentSessionProjectionEvent } from '../../../../shared/agent-session-projection.model'
import type { GitObservationEvent, GitReviewState } from '../../shared'
import { GitTool, resetGitToolViewMemoryForTests } from './git-tool'

describe('GitTool', () => {
  afterEach(() => {
    resetGitToolViewMemoryForTests()
    vi.useRealTimers()
  })
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
    expect(getProjectSessionReview).toHaveBeenCalledWith({ sessionId: 'session-1', filter: 'staged' })
    expect(screen.getByRole('tab', { name: 'Staged' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('button', { name: /staged.md/i }))
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
    window.spacezero.git.getProjectSessionReview = vi.fn(
      async ({ filter }: { filter: string }) =>
        filter === 'staged'
          ? {
              status: 'clean' as const,
              branch: 'feature/test',
              upstream: { kind: 'tracked' as const, name: 'origin/feature/test', ahead: 0, behind: 0 },
              files: [] as []
            }
          : {
              status: 'ok' as const,
              branch: 'feature/test',
              upstream: { kind: 'tracked' as const, name: 'origin/feature/test', ahead: 0, behind: 0 },
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

    await waitFor(() => expect(screen.getByRole('button', { name: 'Commit & Push' })).toBeDisabled())
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
        { path: 'conflict.txt', kind: 'conflicted' as const, binary: false, large: false, diff: null },
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

  it('offers manual refresh and re-queries without mutating Git state', async () => {
    window.spacezero.git.getProjectSessionReview = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'clean' as const,
        branch: 'main',
        upstream: { kind: 'none' as const },
        files: [] as []
      })
      .mockResolvedValueOnce({
        status: 'ok' as const,
        branch: 'main',
        upstream: { kind: 'none' as const },
        files: [
          {
            path: 'fresh.txt',
            kind: 'modified' as const,
            binary: false,
            large: false,
            diff: 'diff --git a/fresh.txt b/fresh.txt\n+fresh\n'
          }
        ]
      })

    render(<GitTool sessionId="session-1" />)

    await screen.findByText('No uncommitted changes')
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await screen.findByText('+fresh')
    expect(window.spacezero.git.getProjectSessionReview).toHaveBeenCalledWith({
      sessionId: 'session-1',
      filter: 'uncommitted'
    })
    expect(window.spacezero.git).not.toHaveProperty('commit')
    expect(window.spacezero.git).not.toHaveProperty('push')
  })

  it('debounces repository observation and refreshes on app focus', async () => {
    const observationListeners: Array<(event: GitObservationEvent) => void> = []
    window.spacezero.git.observeProjectSession = vi.fn(async () => ({ subscriptionId: 'sub-1' }))
    window.spacezero.git.unobserveProjectSession = vi.fn(async () => undefined)
    window.spacezero.git.onObservationEvent = vi.fn((listener) => {
      observationListeners.push(listener)
      return () => undefined
    })
    window.spacezero.git.getProjectSessionReview = vi.fn(async () => ({
      status: 'clean' as const,
      branch: 'main',
      upstream: { kind: 'none' as const },
      files: [] as []
    }))

    const rendered = render(<GitTool sessionId="session-1" />)
    await screen.findByText('No uncommitted changes')

    const observationListener = observationListeners[0]
    if (!observationListener) throw new Error('Git observation listener was not registered')
    observationListener({ subscriptionId: 'sub-1', sessionId: 'session-1', kind: 'repository-changed' })
    observationListener({ subscriptionId: 'sub-1', sessionId: 'session-1', kind: 'repository-changed' })
    await new Promise((resolve) => setTimeout(resolve, 75))
    expect(window.spacezero.git.getProjectSessionReview).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(window.spacezero.git.getProjectSessionReview).toHaveBeenCalledTimes(2))

    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(window.spacezero.git.getProjectSessionReview).toHaveBeenCalledTimes(3))

    rendered.unmount()
    await waitFor(() =>
      expect(window.spacezero.git.unobserveProjectSession).toHaveBeenCalledWith({ subscriptionId: 'sub-1' })
    )
  })

  it('ignores stale refresh responses and observation events for other Project Sessions', async () => {
    const observationListeners: Array<(event: GitObservationEvent) => void> = []
    window.spacezero.git.observeProjectSession = vi.fn(async () => ({ subscriptionId: 'sub-1' }))
    window.spacezero.git.onObservationEvent = vi.fn((listener) => {
      observationListeners.push(listener)
      return () => undefined
    })
    const firstResolvers: Array<(
      value: Awaited<ReturnType<typeof window.spacezero.git.getProjectSessionReview>>
    ) => void> = []
    const newSessionReview = {
      status: 'ok' as const,
      branch: 'new-session',
      upstream: { kind: 'none' as const },
      files: [
        { path: 'new.txt', kind: 'modified' as const, binary: false, large: false, diff: '+new\n' }
      ]
    }
    window.spacezero.git.getProjectSessionReview = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            firstResolvers.push(resolve)
          })
      )
      .mockResolvedValue(newSessionReview)

    const { rerender } = render(<GitTool sessionId="session-1" />)
    await waitFor(() => expect(firstResolvers).toHaveLength(1))
    rerender(<GitTool sessionId="session-2" />)
    await screen.findByText('new-session')
    const firstResolver = firstResolvers[0]
    if (!firstResolver) throw new Error('First Git review request was not started')
    firstResolver({
      status: 'ok' as const,
      branch: 'old-session',
      upstream: { kind: 'none' as const },
      files: [{ path: 'old.txt', kind: 'modified' as const, binary: false, large: false, diff: '+old\n' }]
    })

    await waitFor(() => expect(screen.queryByText('old-session')).not.toBeInTheDocument())
    const observationListener = observationListeners[0]
    if (!observationListener) throw new Error('Git observation listener was not registered')
    observationListener({ subscriptionId: 'sub-1', sessionId: 'session-1', kind: 'repository-changed' })
    expect(window.spacezero.git.getProjectSessionReview).toHaveBeenCalledTimes(2)
  })

  it('synchronously isolates and restores state across Project Session switches without prior data flash', async () => {
    const resolvers = new Map<string, (value: GitReviewState) => void>()
    window.spacezero.git.getProjectSessionReview = vi.fn(
      ({ sessionId, filter }: { sessionId: string; filter: string }) =>
        new Promise<GitReviewState>((resolve) => {
          resolvers.set(`${sessionId}:${filter}:${resolvers.size}`, resolve)
        })
    )

    const rendered = render(<GitTool sessionId="session-a" />)
    await waitFor(() => expect(resolvers.size).toBe(1))
    act(() => {
      resolvers.get('session-a:uncommitted:0')?.({
        status: 'ok' as const,
        branch: 'branch-a',
        upstream: { kind: 'none' as const },
        files: [{ path: 'a.txt', kind: 'modified' as const, binary: false, large: false, diff: '+a\n' }]
      })
    })
    await screen.findByText('branch-a')
    await userEvent.click(screen.getByRole('tab', { name: 'Staged' }))
    await waitFor(() => expect(resolvers.size).toBe(3))
    act(() => {
      resolvers.get('session-a:staged:1')?.({
        status: 'ok' as const,
        branch: 'branch-a-staged',
        upstream: { kind: 'none' as const },
        files: [
          { path: 'a-staged.txt', kind: 'modified' as const, binary: false, large: false, diff: '+a-staged\n' }
        ]
      })
      resolvers.get('session-a:uncommitted:2')?.({
        status: 'ok' as const,
        branch: 'branch-a-actions',
        upstream: { kind: 'none' as const },
        files: [
          { path: 'a-actions.txt', kind: 'modified' as const, binary: false, large: false, diff: '+a-actions\n' }
        ]
      })
    })
    await screen.findByText('branch-a-staged')
    await userEvent.click(screen.getByRole('button', { name: /a-staged.txt/i }))
    await waitFor(() => expect(screen.queryByText('+a-staged')).not.toBeInTheDocument())
    const sessionAScroller = screen.getByLabelText('Git changed files')
    fireEvent.scroll(sessionAScroller, { target: { scrollTop: 44 } })
    await userEvent.type(screen.getByLabelText('Commit instructions'), 'session a commit')

    rendered.rerender(<GitTool sessionId="session-b" />)

    expect(screen.getByText('Loading Git…')).toBeInTheDocument()
    expect(screen.queryByText('branch-a-staged')).not.toBeInTheDocument()
    expect(screen.queryByText('+a-staged')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Uncommitted' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByDisplayValue('session a commit')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(Array.from(resolvers.keys()).some((key) => key.startsWith('session-b:uncommitted:'))).toBe(true)
    )
    act(() => {
      for (const [key, resolve] of resolvers) {
        if (!key.startsWith('session-b:uncommitted:')) continue
        resolve({
          status: 'ok' as const,
          branch: 'branch-b',
          upstream: { kind: 'none' as const },
          files: [{ path: 'b.txt', kind: 'modified' as const, binary: false, large: false, diff: '+b\n' }]
        })
      }
    })
    await screen.findByText('branch-b')
    expect(screen.queryByText('branch-a-staged')).not.toBeInTheDocument()
    expect(screen.queryByText('+a-staged')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Git changed files')).toHaveProperty('scrollTop', 0)

    rendered.rerender(<GitTool sessionId="session-a" />)
    expect(screen.getByRole('tab', { name: 'Staged' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('branch-b')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(Array.from(resolvers.keys()).some((key) => key.startsWith('session-a:staged:') && !key.endsWith(':1'))).toBe(true)
    )
    act(() => {
      for (const [key, resolve] of resolvers) {
        if (!key.startsWith('session-a:')) continue
        resolve({
          status: 'ok' as const,
          branch: 'branch-a-restored',
          upstream: { kind: 'none' as const },
          files: [
            { path: 'a-staged.txt', kind: 'modified' as const, binary: false, large: false, diff: '+a-staged\n' }
          ]
        })
      }
    })
    await screen.findByText('branch-a-restored')
    expect(screen.getByLabelText('Commit instructions')).toHaveValue('session a commit')
    expect(screen.getByLabelText('Git changed files')).toHaveProperty('scrollTop', 44)
    expect(screen.queryByText('+a-staged')).not.toBeInTheDocument()
  })

  it('surfaces immediate setup and later watch errors while preserving Refresh and context isolation', async () => {
    const observationListeners: Array<(event: GitObservationEvent) => void> = []
    window.spacezero.git.onObservationEvent = vi.fn((listener) => {
      observationListeners.push(listener)
      return () => undefined
    })
    let resolveInitialObserve: ((value: { subscriptionId: string }) => void) | undefined
    window.spacezero.git.observeProjectSession = vi.fn(async ({ sessionId }: { sessionId: string }) => {
      if (sessionId === 'session-a') {
        return new Promise<{ subscriptionId: string }>((resolve) => {
          resolveInitialObserve = resolve
        })
      }
      return { subscriptionId: 'sub-b' }
    })
    window.spacezero.git.getProjectSessionReview = vi.fn(async ({ sessionId }: { sessionId: string }) =>
      sessionId === 'session-a'
        ? {
            status: 'ok' as const,
            branch: 'branch-a',
            upstream: { kind: 'none' as const },
            files: [
              { path: 'a.txt', kind: 'modified' as const, binary: false, large: false, diff: '+a\n' }
            ]
          }
        : {
            status: 'clean' as const,
            branch: 'branch-b',
            upstream: { kind: 'none' as const },
            files: [] as []
          }
    )

    const rendered = render(<GitTool sessionId="session-a" />)
    await screen.findByText('branch-a')
    const initialListener = observationListeners[0]
    if (!initialListener) throw new Error('Git observation listener was not registered')
    act(() => {
      initialListener({
        subscriptionId: 'sub-a',
        sessionId: 'session-a',
        kind: 'watch-error',
        message: 'missing managed worktree'
      })
      resolveInitialObserve?.({ subscriptionId: 'sub-a' })
    })
    await screen.findByText(/Git auto-refresh unavailable: missing managed worktree/)
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    window.dispatchEvent(new Event('focus'))
    await waitFor(() =>
      expect(screen.getByText(/Git auto-refresh unavailable: missing managed worktree/)).toBeInTheDocument()
    )

    rendered.rerender(<GitTool sessionId="session-b" />)
    await screen.findByText('branch-b')
    expect(screen.queryByText('branch-a')).not.toBeInTheDocument()
    const listener = observationListeners.at(-1)
    if (!listener) throw new Error('Git observation listener was not registered')
    act(() => {
      listener({
        subscriptionId: 'sub-b',
        sessionId: 'session-b',
        kind: 'watch-error',
        message: 'native watcher stopped'
      })
    })

    await screen.findByText(/Git auto-refresh unavailable: native watcher stopped/)
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    window.dispatchEvent(new Event('focus'))
    await waitFor(() =>
      expect(screen.getByText(/Git auto-refresh unavailable: native watcher stopped/)).toBeInTheDocument()
    )
    expect(screen.queryByText('branch-a')).not.toBeInTheDocument()
  })

  it('refreshes after a Git-originated agent run completes', async () => {
    const projectionListeners: Array<(event: AgentSessionProjectionEvent) => void> = []
    window.spacezero.agent.onSessionProjectionEvent = vi.fn((listener) => {
      projectionListeners.push(listener)
      return () => undefined
    })
    window.spacezero.agent.prompt = vi.fn(async () => undefined)
    window.spacezero.git.getProjectSessionReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'main',
      upstream: { kind: 'none' as const },
      files: [
        { path: 'change.txt', kind: 'modified' as const, binary: false, large: false, diff: '+change\n' }
      ]
    }))

    render(<GitTool sessionId="session-1" />)
    await screen.findByText('+change')
    await userEvent.click(screen.getByRole('button', { name: 'Commit & Push' }))
    const projectionListener = projectionListeners[0]
    if (!projectionListener) throw new Error('Agent projection listener was not registered')

    act(() => {
      projectionListener({ type: 'agent_start', sessionId: 'session-1', seq: 1 })
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Commit & Push' })).toBeDisabled())
    act(() => {
      projectionListener({ type: 'agent_end', sessionId: 'session-1', seq: 2 })
    })

    await waitFor(() => expect(window.spacezero.git.getProjectSessionReview).toHaveBeenCalledTimes(2))
  })

  it('preserves filter, expanded files, composer text, and actual scroll in memory for the current app run', async () => {
    window.spacezero.git.getProjectSessionReview = vi.fn(async ({ filter }: { filter: string }) => ({
      status: 'ok' as const,
      branch: 'main',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: `${filter}.txt`,
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: `diff --git a/${filter}.txt b/${filter}.txt\n+${filter}\n`
        }
      ]
    }))

    const rendered = render(<GitTool sessionId="session-memory" />)
    await screen.findByText('+uncommitted')
    await userEvent.click(screen.getByRole('tab', { name: 'Staged' }))
    await screen.findByText('+staged')
    await userEvent.click(screen.getByRole('button', { name: /staged.txt/i }))
    const scroller = screen.getByLabelText('Git changed files')
    fireEvent.scroll(scroller, { target: { scrollTop: 72 } })
    await userEvent.type(screen.getByLabelText('Commit instructions'), 'ship it')
    rendered.unmount()

    render(<GitTool sessionId="session-memory" />)

    await screen.findByText('staged.txt')
    expect(screen.getByRole('tab', { name: 'Staged' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Commit instructions')).toHaveValue('ship it')
    expect(screen.getByLabelText('Git changed files')).toHaveProperty('scrollTop', 72)
    expect(screen.queryByText('+staged')).not.toBeInTheDocument()
  })

  it('resets to default Git view memory after restart', async () => {
    window.spacezero.git.getProjectSessionReview = vi.fn(async ({ filter }: { filter: string }) => ({
      status: 'ok' as const,
      branch: 'main',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: `${filter}.txt`,
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: `diff --git a/${filter}.txt b/${filter}.txt\n+${filter}\n`
        }
      ]
    }))

    const rendered = render(<GitTool sessionId="session-restart" />)
    await screen.findByText('+uncommitted')
    await userEvent.click(screen.getByRole('tab', { name: 'Staged' }))
    await screen.findByText('+staged')
    await userEvent.click(screen.getByRole('button', { name: /staged.txt/i }))
    await waitFor(() => expect(screen.queryByText('+staged')).not.toBeInTheDocument())
    fireEvent.scroll(screen.getByLabelText('Git changed files'), { target: { scrollTop: 91 } })
    await userEvent.type(screen.getByLabelText('Commit instructions'), 'not persisted')
    rendered.unmount()
    resetGitToolViewMemoryForTests()

    render(<GitTool sessionId="session-restart" />)

    await screen.findByText('+uncommitted')
    expect(screen.getByRole('tab', { name: 'Uncommitted' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Commit instructions')).toHaveValue('')
    expect(screen.getByLabelText('Git changed files')).toHaveProperty('scrollTop', 0)
  })
})
