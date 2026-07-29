import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentSessionProjectionEvent } from '../../../../shared/agent-session-projection.model'
import { openFilesLocation } from '../../../files/renderer/files-open-location'
import { useFilesStore } from '../../../files/renderer/files-store'
import type { GitObservationEvent, GitReviewState } from '../../shared'
import { GitTool, resetGitToolViewMemoryForTests } from './git-tool'

vi.mock('@pierre/diffs', () => ({
  parsePatchFiles: vi.fn((patch: string, cacheKeyPrefix = 'git-tool-test') => {
    const fileMatch = /diff --git a\/(.+?) b\/(.+?)(?:\n|$)/.exec(patch)
    const combinedDiffMatch = /diff --cc (.+?)(?:\n|$)/.exec(patch)
    return [
      {
        files: [
          {
            name: fileMatch?.[2] ?? combinedDiffMatch?.[1] ?? 'mock.diff',
            type: 'change',
            hunks: [],
            splitLineCount: patch.split('\n').length,
            unifiedLineCount: patch.split('\n').length,
            isPartial: true,
            deletionLines: [],
            additionLines: [patch],
            cacheKey: cacheKeyPrefix
          }
        ]
      }
    ]
  })
}))

vi.mock('@pierre/diffs/react', async () => {
  const React = await import('react')
  const CodeView = vi.fn(
    ({
      items,
      options,
      renderCustomHeader,
      renderHeaderPrefix,
      renderHeaderMetadata
    }: {
      items: Array<{
        id: string
        fileDiff: { name: string; additionLines: string[] }
        collapsed?: boolean
      }>
      options: { hunkSeparators?: string }
      renderCustomHeader?: (item: {
        id: string
        fileDiff: { name: string; additionLines: string[] }
        collapsed?: boolean
      }) => React.ReactNode
      renderHeaderPrefix?: (item: {
        id: string
        fileDiff: { name: string; additionLines: string[] }
        collapsed?: boolean
      }) => React.ReactNode
      renderHeaderMetadata?: (item: {
        id: string
        fileDiff: { name: string; additionLines: string[] }
        collapsed?: boolean
      }) => React.ReactNode
    }) =>
      React.createElement(
        'div',
        {
          'aria-label': 'Mock Pierre CodeView',
          'data-hunk-separators': options.hunkSeparators,
          'data-testid': 'pierre-code-view'
        },
        items.map((item) =>
          React.createElement('section', { key: item.id }, [
            React.createElement(
              'div',
              { 'data-testid': `pierre-header-${item.fileDiff.name}`, key: 'header' },
              [
                React.createElement(React.Fragment, { key: 'prefix' }, renderHeaderPrefix?.(item)),
                React.createElement('span', { key: 'default-name' }, item.fileDiff.name),
                React.createElement(React.Fragment, { key: 'custom' }, renderCustomHeader?.(item)),
                React.createElement(React.Fragment, { key: 'metadata' }, renderHeaderMetadata?.(item))
              ]
            ),
            item.collapsed
              ? null
              : React.createElement(
                  'pre',
                  { key: 'body' },
                  item.fileDiff.additionLines.flatMap((content) =>
                    content
                      .split('\n')
                      .map((line, index) =>
                        React.createElement(
                          'span',
                          { className: 'block', key: `${item.id}:${index}:${line}` },
                          line
                        )
                      )
                  )
                )
          ])
        )
      )
  )
  return { CodeView }
})

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('GitTool', () => {
  afterEach(() => {
    resetGitToolViewMemoryForTests()
    vi.useRealTimers()
  })
  it('defaults to Uncommitted, requests by Project Session id, and renders collapsible saved text diffs', async () => {
    const getReview = vi.fn(async () => ({
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
    window.spacezero.git.getReview = getReview

    render(<GitTool sessionId="session-1" />)

    expect(screen.getByRole('tab', { name: 'Uncommitted' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await screen.findByText('feature/test')
    expect(getReview).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-1' },
      filter: 'uncommitted'
    })
    expect(screen.getByText(/origin\/feature\/test/)).toHaveTextContent('2 ahead')
    expect(screen.getByText(/\+Changed/)).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument()
    const headerToggle = screen.getByRole('button', { name: 'Toggle diff' })
    expect(headerToggle).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(headerToggle)
    await waitFor(() => expect(screen.queryByText(/\+Changed/)).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Toggle diff' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('toggles diffs from the header while keeping filename navigation independent', async () => {
    const openFilesTool = vi.fn()
    const openLocation = vi.fn(async () => ({ status: 'opened' as const }))
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'src/app.ts',
          kind: 'untracked' as const,
          binary: false,
          large: false,
          diff: 'diff --git a/src/app.ts b/src/app.ts\n+Changed\n'
        }
      ]
    }))

    render(<GitTool filesHandoff={{ openFilesTool, openLocation }} sessionId="session-1" />)

    await screen.findByText(/\+Changed/)
    const pierreHeader = screen.getByTestId('pierre-header-src/app.ts')
    expect(pierreHeader).toContainElement(screen.getByRole('button', { name: 'src/app.ts' }))
    expect(pierreHeader).toHaveTextContent('untracked')
    expect(screen.getAllByText('src/app.ts')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'src/app.ts' }))
    expect(openLocation).toHaveBeenCalledWith({ relativePath: 'src/app.ts', line: undefined })
    expect(openFilesTool).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/\+Changed/)).toBeInTheDocument()
    const headerToggle = screen.getByRole('button', { name: 'Toggle diff' })
    expect(headerToggle).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(headerToggle)
    await waitFor(() => expect(screen.queryByText(/\+Changed/)).not.toBeInTheDocument())

    screen.getByRole('button', { name: 'Toggle diff' }).focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByText(/\+Changed/)
    expect(screen.getByRole('button', { name: 'Toggle diff' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('reviews Knowledge Base Git through the stable context key without Project Session composer actions', async () => {
    const openFilesTool = vi.fn()
    const openLocation = vi.fn(async () => ({ status: 'opened' as const }))
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'main',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'notes/kb.md',
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: 'diff --git a/notes/kb.md b/notes/kb.md\n@@ -1 +1 @@\n-old\n+new\n'
        }
      ]
    }))

    const { rerender } = render(
      <GitTool
        context={{ kind: 'knowledge-base', contextKey: 'knowledge-base' }}
        filesHandoff={{ openFilesTool, openLocation }}
      />
    )

    await screen.findByText('notes/kb.md')
    expect(window.spacezero.git.getReview).toHaveBeenCalledWith({
      context: { kind: 'knowledge-base', contextKey: 'knowledge-base' },
      filter: 'uncommitted'
    })
    expect(await screen.findByRole('button', { name: 'Commit & Push' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'notes/kb.md' }))
    expect(openLocation).toHaveBeenCalledWith({ relativePath: 'notes/kb.md', line: undefined })
    expect(openFilesTool).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('tab', { name: 'Staged' }))
    await screen.findByText('notes/kb.md')
    rerender(
      <GitTool
        context={{ kind: 'knowledge-base', contextKey: 'knowledge-base' }}
        filesHandoff={{ openFilesTool, openLocation }}
      />
    )
    expect(screen.getByRole('tab', { name: 'Staged' })).toHaveAttribute('aria-selected', 'true')
  })

  it('switches filters through renderer-local state and keeps file expansion local', async () => {
    const getReview = vi.fn(async ({ filter }: { filter: string }) => ({
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
    window.spacezero.git.getReview = getReview

    render(<GitTool sessionId="session-1" />)

    await screen.findByText(/\+uncommitted/)
    await userEvent.click(screen.getByRole('tab', { name: 'Staged' }))
    await screen.findByText(/\+staged/)
    expect(getReview).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-1' },
      filter: 'staged'
    })
    expect(screen.getByRole('tab', { name: 'Staged' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Toggle diff' }))
    await waitFor(() => expect(screen.queryByText(/\+staged/)).not.toBeInTheDocument())
    expect(getReview).toHaveBeenCalledTimes(3)
  })

  it('shows conflicts prominently, keeps conflicted files reviewable first, and replaces composer actions with Resolve with agent', async () => {
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'tracked' as const, name: 'origin/feature/test', ahead: 0, behind: 0 },
      files: [
        {
          path: 'conflicted.txt',
          kind: 'conflicted' as const,
          binary: false,
          large: false,
          diff: 'diff --cc conflicted.txt\n+<<<<<<< HEAD\n'
        },
        {
          path: 'normal.txt',
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: 'diff --git a/normal.txt b/normal.txt\n+normal\n'
        }
      ]
    }))

    render(<GitTool sessionId="session-1" />)

    expect(
      await screen.findByRole('status', { name: 'Unresolved Git conflicts' })
    ).toHaveTextContent('1 conflicted file needs resolution before commit or push.')
    expect(screen.getByText('conflicted.txt')).toBeInTheDocument()
    expect(screen.getByText('normal.txt')).toBeInTheDocument()
    expect(screen.getByText('+<<<<<<< HEAD')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve with agent' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Commit & Push' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Commit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose Git commit action' })).not.toBeInTheDocument()
  })

  it('sends a fresh-state same-session conflict prompt without rendered diffs or changing composer text', async () => {
    const prompt = vi.fn<(request: { sessionId: string; message: string }) => Promise<void>>(
      async () => undefined
    )
    window.spacezero.agent.prompt = prompt
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'conflicted.txt',
          kind: 'conflicted' as const,
          binary: false,
          large: false,
          diff: 'diff --cc conflicted.txt\n+<<<<<<< HEAD\n'
        }
      ]
    }))

    render(<GitTool sessionId="session-1" />)

    await userEvent.type(await screen.findByLabelText('Commit instructions'), 'keep this draft')
    await userEvent.click(screen.getByRole('button', { name: 'Resolve with agent' }))

    expect(prompt).toHaveBeenCalledWith({
      sessionId: 'session-1',
      message: expect.stringContaining('unresolved Git conflicts')
    })
    const message = prompt.mock.calls[0]?.[0].message ?? ''
    expect(message).toContain('managed worktree')
    expect(message).toContain('fresh Git status and diff')
    expect(message).toContain('complete conflict resolution workflow')
    expect(message).not.toContain('diff --cc')
    expect(message).not.toContain('<<<<<<< HEAD')
    expect(screen.getByLabelText('Commit instructions')).toHaveValue('keep this draft')
  })

  it('disables Resolve with agent while already running and does not send another prompt', async () => {
    const prompt = vi.fn(async () => undefined)
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
    window.spacezero.agent.prompt = prompt
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'conflicted.txt',
          kind: 'conflicted' as const,
          binary: false,
          large: false,
          diff: null
        }
      ]
    }))

    render(<GitTool sessionId="session-1" />)

    const resolve = await screen.findByRole('button', { name: 'Resolve with agent' })
    await waitFor(() => expect(resolve).toBeDisabled())
    await userEvent.click(resolve)

    expect(prompt).not.toHaveBeenCalled()
  })

  it('disables Resolve with agent while running, refreshes after completion, and returns to normal actions after resolution', async () => {
    const projectionListeners: Array<(event: AgentSessionProjectionEvent) => void> = []
    window.spacezero.agent.onSessionProjectionEvent = vi.fn((listener) => {
      projectionListeners.push(listener)
      return () => undefined
    })
    window.spacezero.agent.prompt = vi.fn(async () => undefined)
    window.spacezero.git.getReview = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'ok' as const,
        branch: 'feature/test',
        upstream: { kind: 'tracked' as const, name: 'origin/feature/test', ahead: 0, behind: 0 },
        files: [
          {
            path: 'conflicted.txt',
            kind: 'conflicted' as const,
            binary: false,
            large: false,
            diff: null
          }
        ]
      })
      .mockResolvedValue({
        status: 'ok' as const,
        branch: 'feature/test',
        upstream: { kind: 'tracked' as const, name: 'origin/feature/test', ahead: 0, behind: 0 },
        files: [
          {
            path: 'resolved.txt',
            kind: 'modified' as const,
            binary: false,
            large: false,
            diff: '+resolved\n'
          }
        ]
      })

    render(<GitTool sessionId="session-1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Resolve with agent' }))
    const projectionListener = projectionListeners[0]
    if (!projectionListener) throw new Error('Agent projection listener was not registered')

    act(() => {
      projectionListener({ type: 'agent_start', sessionId: 'session-1', seq: 1 })
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Resolve with agent' })).toBeDisabled()
    )

    act(() => {
      projectionListener({ type: 'agent_end', sessionId: 'session-1', seq: 2 })
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Commit & Push' })).toBeEnabled())
    expect(screen.queryByRole('button', { name: 'Resolve with agent' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('status', { name: 'Unresolved Git conflicts' })
    ).not.toBeInTheDocument()
    expect(window.spacezero.git.getReview).toHaveBeenCalledTimes(2)
  })

  it('loads the main-owned primary action preference and sends an empty Commit & Push prompt through the agent path', async () => {
    const prompt = vi.fn<(request: { sessionId: string; message: string }) => Promise<void>>(
      async () => undefined
    )
    window.spacezero.settings.getGitActionSettings = vi.fn(async () => ({
      primaryGitAction: 'commit-and-push' as const
    }))
    window.spacezero.agent.prompt = prompt
    window.spacezero.git.getReview = vi.fn(async () => ({
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
    expect(message).toContain('push the current branch with upstream tracking using `git push -u origin HEAD`')
    expect(message).toContain('ask me for the required remote or upstream information')
    expect(message).not.toContain('diff --git')
    expect(message).not.toContain('+change')
  })

  it('routes Knowledge Base commit prompts to the current managed chat session after New chat', async () => {
    const prompt = vi.fn<(request: { sessionId: string; message: string }) => Promise<void>>(
      async () => undefined
    )
    window.spacezero.agent.prompt = prompt
    window.spacezero.agent.getState = vi.fn(async ({ sessionId }: { sessionId: string }) => ({
      sessionId,
      kind: 'workspace' as const,
      projectId: null,
      cwd: '/tmp/spacezero-workspace-sessions',
      status: 'idle' as const,
      live: true,
      transcriptPath: undefined,
      modelProvider: undefined,
      modelId: undefined,
      transcriptSnapshot: []
    }))
    let currentSession = {
      id: 'knowledge-base-session-1',
      kind: 'workspace' as const,
      title: 'Knowledge Base Chat',
      status: 'idle' as const,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    }
    window.spacezero.knowledgeBase.getCurrentSession = vi.fn(async () => currentSession)
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'main',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'notes/kb.md',
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: 'diff --git a/notes/kb.md b/notes/kb.md\n+change\n'
        }
      ]
    }))

    render(<GitTool context={{ kind: 'knowledge-base', contextKey: 'knowledge-base' }} />)
    expect(await screen.findByRole('button', { name: 'Commit & Push' })).toBeInTheDocument()

    currentSession = { ...currentSession, id: 'knowledge-base-session-2' }
    act(() => {
      window.dispatchEvent(
        new CustomEvent('spacezero:knowledge-base-session-changed', { detail: currentSession })
      )
    })
    await waitFor(() =>
      expect(window.spacezero.agent.getState).toHaveBeenCalledWith({
        sessionId: 'knowledge-base-session-2'
      })
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Commit & Push' }))

    await waitFor(() => expect(prompt).toHaveBeenCalled())
    expect(prompt).toHaveBeenCalledWith({
      sessionId: 'knowledge-base-session-2',
      message: expect.stringContaining('verified Knowledge Base repository')
    })
    const message = prompt.mock.calls[0]?.[0].message ?? ''
    expect(message).not.toContain('diff --git')
    expect(message).not.toContain('+change')
  })

  it('does not let a stale Knowledge Base session lookup overwrite a newer session-change event', async () => {
    const prompt = vi.fn<(request: { sessionId: string; message: string }) => Promise<void>>(
      async () => undefined
    )
    const initialLookup =
      deferred<Awaited<ReturnType<typeof window.spacezero.knowledgeBase.getCurrentSession>>>()
    const session1 = {
      id: 'knowledge-base-session-1',
      kind: 'workspace' as const,
      title: 'Knowledge Base Chat',
      status: 'idle' as const,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    }
    const session2 = { ...session1, id: 'knowledge-base-session-2' }
    window.spacezero.knowledgeBase.getCurrentSession = vi.fn(() => initialLookup.promise)
    window.spacezero.agent.prompt = prompt
    window.spacezero.agent.getState = vi.fn(async ({ sessionId }: { sessionId: string }) => ({
      sessionId,
      kind: 'workspace' as const,
      projectId: null,
      cwd: '/tmp/spacezero-workspace-sessions',
      status: 'idle' as const,
      live: true,
      transcriptPath: undefined,
      modelProvider: undefined,
      modelId: undefined,
      transcriptSnapshot: []
    }))
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'main',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'notes/kb.md',
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: 'diff --git a/notes/kb.md b/notes/kb.md\n+change\n'
        }
      ]
    }))

    render(<GitTool context={{ kind: 'knowledge-base', contextKey: 'knowledge-base' }} />)
    await waitFor(() => expect(window.spacezero.knowledgeBase.getCurrentSession).toHaveBeenCalled())

    act(() => {
      window.dispatchEvent(
        new CustomEvent('spacezero:knowledge-base-session-changed', { detail: session2 })
      )
    })
    await waitFor(() =>
      expect(window.spacezero.agent.getState).toHaveBeenCalledWith({
        sessionId: 'knowledge-base-session-2'
      })
    )

    await act(async () => {
      initialLookup.resolve(session1)
      await initialLookup.promise
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Commit & Push' }))

    await waitFor(() => expect(prompt).toHaveBeenCalled())
    expect(prompt).toHaveBeenCalledWith({
      sessionId: 'knowledge-base-session-2',
      message: expect.stringContaining('verified Knowledge Base repository')
    })
    expect(prompt).not.toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'knowledge-base-session-1' })
    )
  })

  it('uses a split button that defaults to Commit & Push and only runs the selected action from the main segment', async () => {
    const prompt = vi.fn<(request: { sessionId: string; message: string }) => Promise<void>>(
      async () => undefined
    )
    window.spacezero.settings.getGitActionSettings = vi.fn(async () => ({
      primaryGitAction: 'commit' as const
    }))
    window.spacezero.agent.prompt = prompt
    window.spacezero.git.getReview = vi.fn(async () => ({
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

    expect(
      screen.queryByText(
        'Sends a normal prompt to this Project Session agent. The agent will inspect fresh Git state.'
      )
    ).not.toBeInTheDocument()
    await userEvent.type(
      await screen.findByLabelText('Commit instructions'),
      'Use message: polish docs'
    )
    expect(await screen.findByRole('button', { name: 'Commit & Push' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Choose Git commit action' }))
    expect(await screen.findByRole('menuitem', { name: 'Commit & Push' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Commit' }))
    expect(prompt).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Commit' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Commit' }))
    expect(prompt).toHaveBeenCalledWith({
      sessionId: 'session-1',
      message: expect.stringContaining(
        'Treat this as my preferred commit message or commit instructions'
      )
    })
    expect(prompt.mock.calls[0]?.[0].message ?? '').toContain('Use message: polish docs')
    expect(prompt.mock.calls[0]?.[0].message ?? '').not.toContain('and push the branch')

    await userEvent.click(screen.getByRole('button', { name: 'Choose Git commit action' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Commit & Push' }))
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Commit & Push' })).toBeEnabled()
  })

  it('supports keyboard traversal and restores focus to the split-button menu trigger on Escape', async () => {
    const user = userEvent.setup()
    window.spacezero.git.getReview = vi.fn(async () => ({
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

    const trigger = await screen.findByRole('button', { name: 'Choose Git commit action' })
    trigger.focus()
    expect(trigger).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    const commitAndPushItem = await screen.findByRole('menuitem', { name: 'Commit & Push' })
    const commitItem = screen.getByRole('menuitem', { name: 'Commit' })
    expect(commitAndPushItem).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(commitItem).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(commitAndPushItem).toHaveFocus()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Commit' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('keeps composer actions available when the Staged filter is clean but unstaged changes exist', async () => {
    const prompt = vi.fn<(request: { sessionId: string; message: string }) => Promise<void>>(
      async () => undefined
    )
    window.spacezero.agent.prompt = prompt
    window.spacezero.git.getReview = vi.fn(async ({ filter }: { filter: string }) =>
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
    await userEvent.click(screen.getByRole('button', { name: 'Choose Git commit action' }))
    const commitAction = await screen.findByRole('menuitem', { name: 'Commit' })
    expect(commitAction).not.toBeDisabled()
    await userEvent.click(commitAction)
    expect(prompt).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Commit' }))

    expect(prompt).toHaveBeenCalledTimes(2)
    expect(prompt.mock.calls[0]?.[0].message ?? '').toContain('and push the branch')
    expect(prompt.mock.calls[1]?.[0].message ?? '').toContain('create an appropriate commit')
    expect(prompt.mock.calls[1]?.[0].message ?? '').not.toContain('and push the branch')
  })

  it('enables Commit & Push for an ahead branch with no uncommitted changes', async () => {
    const prompt = vi.fn<(request: { sessionId: string; message: string }) => Promise<void>>(
      async () => undefined
    )
    window.spacezero.agent.prompt = prompt
    window.spacezero.git.getReview = vi.fn(async () => ({
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
    window.spacezero.git.getReview = vi.fn(async () => ({
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
    expect(screen.getByRole('button', { name: 'Choose Git commit action' })).toBeDisabled()
  })

  it('renders text diffs through the shared Diff Viewer with compact hunk separators', async () => {
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'README.md',
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: '@@ -1,2 +1,2 @@\n-old\n+changed\n'
        }
      ]
    }))

    render(<GitTool sessionId="session-1" />)

    await screen.findByText('+changed')
    expect(screen.getByLabelText('Diff for README.md')).toBeInTheDocument()
    expect(screen.getByTestId('pierre-code-view')).toHaveAttribute(
      'data-hunk-separators',
      'line-info-basic'
    )
  })

  it('renders binary and large diff summaries instead of inline content', async () => {
    window.spacezero.git.getReview = vi.fn(async () => ({
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

  it('keeps added, deleted, modified, and untracked labels in retained Pierre headers', async () => {
    const files = [
      { path: 'added.txt', kind: 'added' as const, line: '+added' },
      { path: 'deleted.txt', kind: 'deleted' as const, line: '-deleted' },
      { path: 'modified.txt', kind: 'modified' as const, line: '+modified' },
      { path: 'untracked.txt', kind: 'untracked' as const, line: '+untracked' }
    ]
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: files.map((file) => ({
        path: file.path,
        kind: file.kind,
        binary: false,
        large: false,
        diff: `diff --git a/${file.path} b/${file.path}\n${file.line}\n`
      }))
    }))

    render(<GitTool sessionId="session-1" />)

    await screen.findByText('+modified')
    expect(screen.getAllByTestId('pierre-code-view')).toHaveLength(files.length)
    for (const file of files) {
      const packageHeader = screen.getByTestId(`pierre-header-${file.path}`)
      expect(packageHeader).toHaveTextContent(file.kind)
      expect(packageHeader).toHaveTextContent(file.path)
      expect(screen.getAllByText(file.path)).toHaveLength(1)
    }
  })

  it('renders file header paths and renamed, deleted, added, untracked, and conflicted states', async () => {
    window.spacezero.git.getReview = vi.fn(async () => ({
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

  it('keeps diff body clicks inert while filename and header controls keep their existing behavior', async () => {
    const openLocation = vi.fn(async () => ({ status: 'opened' as const }))
    const openFilesTool = vi.fn()
    window.spacezero.git.getReview = vi.fn(async () => ({
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

    const filename = await screen.findByRole('button', { name: 'src/app.ts' })
    const hunkHeader = screen.getByText('@@ -9,2 +9,3 @@')
    const unchangedLine = screen.getByText((_, element) => element?.textContent === ' context')
    const changedLine = screen.getByText('+changed')
    const diffBody = changedLine.closest('pre')
    expect(diffBody).not.toBeNull()
    expect(changedLine.closest('button')).toBeNull()
    expect(screen.queryByRole('button', { name: '+changed' })).not.toBeInTheDocument()

    await userEvent.click(changedLine)
    await userEvent.click(unchangedLine)
    await userEvent.click(hunkHeader)
    fireEvent.click(diffBody!)
    expect(openLocation).not.toHaveBeenCalled()
    expect(openFilesTool).not.toHaveBeenCalled()
    expect(screen.getByText('+changed')).toBeInTheDocument()

    await userEvent.click(filename)
    expect(openLocation).toHaveBeenCalledWith({ relativePath: 'src/app.ts', line: undefined })
    expect(openFilesTool).toHaveBeenCalledTimes(1)

    const headerToggle = screen.getAllByRole('button', { name: 'Toggle diff' })[0]
    expect(headerToggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(headerToggle)
    await waitFor(() => expect(screen.queryByText('@@ -9,2 +9,3 @@')).not.toBeInTheDocument())
  })

  it('lets Files determine non-deleted handoff support while keeping actual unsupported files in Git', async () => {
    const openLocation = vi.fn(async ({ relativePath }: { relativePath: string }) =>
      relativePath === 'image.png'
        ? {
            status: 'failed' as const,
            message: 'This file is binary and cannot be edited in Files.'
          }
        : { status: 'opened' as const }
    )
    const openFilesTool = vi.fn()
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        { path: 'deleted.txt', kind: 'deleted' as const, binary: false, large: false, diff: null },
        { path: 'image.png', kind: 'modified' as const, binary: true, large: false, diff: null },
        {
          path: 'large-but-text.txt',
          kind: 'modified' as const,
          binary: false,
          large: true,
          diff: null
        }
      ]
    }))

    render(<GitTool sessionId="session-1" filesHandoff={{ openFilesTool, openLocation }} />)

    expect(await screen.findByRole('button', { name: 'deleted.txt' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'image.png' }))
    expect(
      await screen.findByText('This file is binary and cannot be edited in Files.')
    ).toBeInTheDocument()
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
    window.spacezero.git.getReview = vi.fn(async () => ({
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

  it('does not switch Files when an earlier successful handoff is superseded by a pending request that fails', async () => {
    const firstRead = deferred<Awaited<ReturnType<typeof window.spacezero.files.openDocument>>>()
    const secondRead = deferred<Awaited<ReturnType<typeof window.spacezero.files.openDocument>>>()
    window.spacezero.files.openDocument = vi
      .fn()
      .mockReturnValueOnce(firstRead.promise)
      .mockReturnValueOnce(secondRead.promise)
    const openFilesTool = vi.fn()
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'feature/test',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'stale-then-fails.txt',
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: '@@ -1 +1 @@\n+current\n'
        }
      ]
    }))

    render(
      <GitTool
        sessionId="session-1"
        filesHandoff={{
          openFilesTool,
          openLocation: (location) =>
            openFilesLocation({
              contextKey: 'session-1',
              ipcContext: { kind: 'project-session', sessionId: 'session-1' },
              relativePath: location.relativePath,
              line: location.line
            })
        }}
      />
    )

    const fileButton = await screen.findByRole('button', { name: 'stale-then-fails.txt' })
    await userEvent.click(fileButton)
    await waitFor(() => expect(window.spacezero.files.openDocument).toHaveBeenCalledTimes(1))
    await userEvent.click(fileButton)
    await waitFor(() => expect(window.spacezero.files.openDocument).toHaveBeenCalledTimes(2))

    await act(async () => {
      firstRead.resolve({
        name: 'stale-then-fails.txt',
        relativePath: 'stale-then-fails.txt',
        contentKind: 'text' as const,
        size: 7,
        modifiedAt: new Date(0).toISOString(),
        revision: 'stale-success',
        content: 'stale',
        hasBom: false,
        lineEnding: 'lf' as const
      })
      await firstRead.promise
    })

    expect(openFilesTool).not.toHaveBeenCalled()
    expect(useFilesStore.getState().contexts['session-1'].tabs[0]).toMatchObject({
      relativePath: 'stale-then-fails.txt',
      status: 'loading'
    })

    await act(async () => {
      secondRead.reject(new Error('files.notFound'))
      await secondRead.promise.catch(() => undefined)
    })

    expect(
      await screen.findByText('This file no longer exists. Refresh Git and Files, then try again.')
    ).toBeInTheDocument()
    expect(openFilesTool).not.toHaveBeenCalled()
    expect(useFilesStore.getState().contexts['session-1'].tabs[0]).toMatchObject({
      relativePath: 'stale-then-fails.txt',
      status: 'error',
      message: 'This file no longer exists. Refresh Git and Files, then try again.'
    })
  })

  it('renders missing-worktree failures without repository data', async () => {
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'missing-worktree' as const,
      message: 'This Project Session has no managed worktree.'
    }))

    render(<GitTool sessionId="session-1" />)

    await screen.findByText('Managed worktree missing')
    expect(screen.queryByText('Branch')).not.toBeInTheDocument()
  })

  it('opens with one lifecycle request and sends exactly one request per refresh click', async () => {
    window.spacezero.git.getReview = vi
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
    expect(window.spacezero.git.getReview).toHaveBeenCalledTimes(1)
    const refreshButton = screen.getByRole('button', { name: 'Refresh Git status' })
    expect(refreshButton).toHaveAttribute('title', 'Refresh Git status')
    expect(refreshButton).not.toHaveTextContent('Refresh')
    await userEvent.click(refreshButton)

    await screen.findByText('+fresh')
    expect(window.spacezero.git.getReview).toHaveBeenCalledTimes(2)
    expect(window.spacezero.git.getReview).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-1' },
      filter: 'uncommitted'
    })
    expect(window.spacezero.git).not.toHaveProperty('commit')
    expect(window.spacezero.git).not.toHaveProperty('push')
  })

  it('prevents duplicate manual refresh requests while showing refresh progress', async () => {
    let resolveRefresh: ((value: GitReviewState) => void) | undefined
    window.spacezero.git.getReview = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'clean' as const,
        branch: 'main',
        upstream: { kind: 'none' as const },
        files: [] as []
      })
      .mockImplementationOnce(
        () =>
          new Promise<GitReviewState>((resolve) => {
            resolveRefresh = resolve
          })
      )

    render(<GitTool sessionId="session-1" />)

    await screen.findByText('No uncommitted changes')
    const refreshButton = screen.getByRole('button', { name: 'Refresh Git status' })
    await userEvent.click(refreshButton)

    await waitFor(() => expect(refreshButton).toBeDisabled())
    expect(screen.getByRole('status', { name: 'Refreshing Git status' })).toBeInTheDocument()
    await userEvent.click(refreshButton)
    expect(window.spacezero.git.getReview).toHaveBeenCalledTimes(2)

    act(() => {
      resolveRefresh?.({
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
    })

    await screen.findByText('+fresh')
    expect(refreshButton).toBeEnabled()
  })

  it('runs the latest filter refresh queued while the current filter request is pending', async () => {
    const initialUncommitted = deferred<GitReviewState>()
    window.spacezero.git.getReview = vi.fn(({ filter }: { filter: string }) => {
      if (filter === 'uncommitted') return initialUncommitted.promise
      return Promise.resolve({
        status: 'ok' as const,
        branch: 'new-staged',
        upstream: { kind: 'none' as const },
        files: [
          {
            path: 'new-staged.txt',
            kind: 'modified' as const,
            binary: false,
            large: false,
            diff: 'diff --git a/new-staged.txt b/new-staged.txt\n+new-staged\n'
          }
        ]
      })
    })

    render(<GitTool sessionId="session-1" />)

    await waitFor(() => expect(window.spacezero.git.getReview).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('tab', { name: 'Staged' }))
    await waitFor(() => expect(screen.getByText('Loading Git…')).toBeInTheDocument())

    act(() => {
      initialUncommitted.resolve({
        status: 'ok' as const,
        branch: 'old-uncommitted',
        upstream: { kind: 'none' as const },
        files: [
          {
            path: 'old-uncommitted.txt',
            kind: 'modified' as const,
            binary: false,
            large: false,
            diff: 'diff --git a/old-uncommitted.txt b/old-uncommitted.txt\n+old-uncommitted\n'
          }
        ]
      })
    })

    await waitFor(() =>
      expect(window.spacezero.git.getReview).toHaveBeenCalledWith({
        context: { kind: 'project-session', sessionId: 'session-1' },
        filter: 'staged'
      })
    )
    await screen.findByText('new-staged')
    expect(screen.getByText('+new-staged')).toBeInTheDocument()
    expect(screen.queryByText('old-uncommitted')).not.toBeInTheDocument()
    expect(screen.queryByText('+old-uncommitted')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Staged' })).toHaveAttribute('aria-selected', 'true')
  })

  it('debounces repository observation and refreshes on app focus', async () => {
    const observationListeners: Array<(event: GitObservationEvent) => void> = []
    window.spacezero.git.observe = vi.fn(async () => ({ subscriptionId: 'sub-1' }))
    window.spacezero.git.unobserveProjectSession = vi.fn(async () => undefined)
    window.spacezero.git.onObservationEvent = vi.fn((listener) => {
      observationListeners.push(listener)
      return () => undefined
    })
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'clean' as const,
      branch: 'main',
      upstream: { kind: 'none' as const },
      files: [] as []
    }))

    const rendered = render(<GitTool sessionId="session-1" />)
    await screen.findByText('No uncommitted changes')

    const observationListener = observationListeners[0]
    if (!observationListener) throw new Error('Git observation listener was not registered')
    observationListener({
      subscriptionId: 'sub-1',
      contextKey: 'session:session-1',
      sessionId: 'session-1',
      kind: 'repository-changed'
    })
    observationListener({
      subscriptionId: 'sub-1',
      contextKey: 'session:session-1',
      sessionId: 'session-1',
      kind: 'repository-changed'
    })
    await new Promise((resolve) => setTimeout(resolve, 75))
    expect(window.spacezero.git.getReview).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(window.spacezero.git.getReview).toHaveBeenCalledTimes(2))

    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(window.spacezero.git.getReview).toHaveBeenCalledTimes(3))

    rendered.unmount()
    await waitFor(() =>
      expect(window.spacezero.git.unobserveProjectSession).toHaveBeenCalledWith({
        subscriptionId: 'sub-1'
      })
    )
  })

  it('ignores stale refresh responses and observation events for other Project Sessions', async () => {
    const observationListeners: Array<(event: GitObservationEvent) => void> = []
    window.spacezero.git.observe = vi.fn(async () => ({ subscriptionId: 'sub-1' }))
    window.spacezero.git.onObservationEvent = vi.fn((listener) => {
      observationListeners.push(listener)
      return () => undefined
    })
    const firstResolvers: Array<
      (value: Awaited<ReturnType<typeof window.spacezero.git.getReview>>) => void
    > = []
    const newSessionReview = {
      status: 'ok' as const,
      branch: 'new-session',
      upstream: { kind: 'none' as const },
      files: [
        { path: 'new.txt', kind: 'modified' as const, binary: false, large: false, diff: '+new\n' }
      ]
    }
    window.spacezero.git.getReview = vi
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
      files: [
        { path: 'old.txt', kind: 'modified' as const, binary: false, large: false, diff: '+old\n' }
      ]
    })

    await waitFor(() => expect(screen.queryByText('old-session')).not.toBeInTheDocument())
    const observationListener = observationListeners[0]
    if (!observationListener) throw new Error('Git observation listener was not registered')
    observationListener({
      subscriptionId: 'sub-1',
      contextKey: 'session:session-1',
      sessionId: 'session-1',
      kind: 'repository-changed'
    })
    expect(window.spacezero.git.getReview).toHaveBeenCalledTimes(2)
  })

  it('synchronously isolates and restores state across Project Session switches without prior data flash', async () => {
    const resolvers = new Map<string, (value: GitReviewState) => void>()
    window.spacezero.git.getReview = vi.fn(
      ({ context, filter }) =>
        new Promise<GitReviewState>((resolve) => {
          if (context.kind !== 'project-session') throw new Error('expected project session')
          resolvers.set(`${context.sessionId}:${filter}:${resolvers.size}`, resolve)
        })
    )

    const rendered = render(<GitTool sessionId="session-a" />)
    await waitFor(() => expect(resolvers.size).toBe(1))
    act(() => {
      resolvers.get('session-a:uncommitted:0')?.({
        status: 'ok' as const,
        branch: 'branch-a',
        upstream: { kind: 'none' as const },
        files: [
          { path: 'a.txt', kind: 'modified' as const, binary: false, large: false, diff: '+a\n' }
        ]
      })
    })
    await screen.findByText('branch-a')
    await userEvent.click(screen.getByRole('tab', { name: 'Staged' }))
    await waitFor(() =>
      expect(Array.from(resolvers.keys()).some((key) => key.startsWith('session-a:staged:'))).toBe(
        true
      )
    )
    await waitFor(() =>
      expect(
        Array.from(resolvers.keys()).some(
          (key) => key.startsWith('session-a:uncommitted:') && !key.endsWith(':0')
        )
      ).toBe(true)
    )
    act(() => {
      for (const [key, resolve] of resolvers) {
        if (key.startsWith('session-a:staged:')) {
          resolve({
            status: 'ok' as const,
            branch: 'branch-a-staged',
            upstream: { kind: 'none' as const },
            files: [
              {
                path: 'a-staged.txt',
                kind: 'modified' as const,
                binary: false,
                large: false,
                diff: '+a-staged\n'
              }
            ]
          })
        }
        if (key.startsWith('session-a:uncommitted:') && !key.endsWith(':0')) {
          resolve({
            status: 'ok' as const,
            branch: 'branch-a-actions',
            upstream: { kind: 'none' as const },
            files: [
              {
                path: 'a-actions.txt',
                kind: 'modified' as const,
                binary: false,
                large: false,
                diff: '+a-actions\n'
              }
            ]
          })
        }
      }
    })
    await screen.findByText('branch-a-staged')
    await userEvent.click(screen.getByRole('button', { name: 'Toggle diff' }))
    await waitFor(() => expect(screen.queryByText('+a-staged')).not.toBeInTheDocument())
    const sessionAScroller = screen.getByLabelText('Git changed files')
    fireEvent.scroll(sessionAScroller, { target: { scrollTop: 44 } })
    await userEvent.type(screen.getByLabelText('Commit instructions'), 'session a commit')

    rendered.rerender(<GitTool sessionId="session-b" />)

    expect(screen.getByText('Loading Git…')).toBeInTheDocument()
    expect(screen.queryByText('branch-a-staged')).not.toBeInTheDocument()
    expect(screen.queryByText('+a-staged')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Uncommitted' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.queryByDisplayValue('session a commit')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        Array.from(resolvers.keys()).some((key) => key.startsWith('session-b:uncommitted:'))
      ).toBe(true)
    )
    act(() => {
      for (const [key, resolve] of resolvers) {
        if (!key.startsWith('session-b:uncommitted:')) continue
        resolve({
          status: 'ok' as const,
          branch: 'branch-b',
          upstream: { kind: 'none' as const },
          files: [
            {
              path: 'a-staged.txt',
              kind: 'modified' as const,
              binary: false,
              large: false,
              diff: '+session-b\n'
            }
          ]
        })
      }
    })
    await screen.findByText('branch-b')
    expect(screen.queryByText('branch-a-staged')).not.toBeInTheDocument()
    expect(screen.queryByText('+a-staged')).not.toBeInTheDocument()
    expect(screen.getByText('+session-b')).toBeInTheDocument()
    expect(screen.getByLabelText('Git changed files')).toHaveProperty('scrollTop', 0)

    rendered.rerender(<GitTool sessionId="session-a" />)
    expect(screen.getByRole('tab', { name: 'Staged' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('branch-b')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        Array.from(resolvers.keys()).some(
          (key) => key.startsWith('session-a:staged:') && !key.endsWith(':1')
        )
      ).toBe(true)
    )
    act(() => {
      for (const [key, resolve] of resolvers) {
        if (!key.startsWith('session-a:')) continue
        resolve({
          status: 'ok' as const,
          branch: 'branch-a-restored',
          upstream: { kind: 'none' as const },
          files: [
            {
              path: 'a-staged.txt',
              kind: 'modified' as const,
              binary: false,
              large: false,
              diff: '+a-staged\n'
            }
          ]
        })
      }
    })
    await screen.findByText('branch-a-restored')
    expect(screen.getByLabelText('Commit instructions')).toHaveValue('session a commit')
    await waitFor(() =>
      expect(screen.getByLabelText('Git changed files')).toHaveProperty('scrollTop', 44)
    )
    expect(screen.queryByText('+a-staged')).not.toBeInTheDocument()
  })

  it('surfaces immediate setup and later watch errors while preserving manual refresh and context isolation', async () => {
    const observationListeners: Array<(event: GitObservationEvent) => void> = []
    window.spacezero.git.onObservationEvent = vi.fn((listener) => {
      observationListeners.push(listener)
      return () => undefined
    })
    let resolveInitialObserve: ((value: { subscriptionId: string }) => void) | undefined
    window.spacezero.git.observe = vi.fn(async ({ context }) => {
      if (context.kind !== 'project-session') throw new Error('expected project session')
      if (context.sessionId === 'session-a') {
        return new Promise<{ subscriptionId: string }>((resolve) => {
          resolveInitialObserve = resolve
        })
      }
      return { subscriptionId: 'sub-b' }
    })
    window.spacezero.git.getReview = vi.fn(async ({ context }) => {
      if (context.kind !== 'project-session') throw new Error('expected project session')
      return context.sessionId === 'session-a'
        ? {
            status: 'ok' as const,
            branch: 'branch-a',
            upstream: { kind: 'none' as const },
            files: [
              {
                path: 'a.txt',
                kind: 'modified' as const,
                binary: false,
                large: false,
                diff: '+a\n'
              }
            ]
          }
        : {
            status: 'clean' as const,
            branch: 'branch-b',
            upstream: { kind: 'none' as const },
            files: [] as []
          }
    })

    const rendered = render(<GitTool sessionId="session-a" />)
    await screen.findByText('branch-a')
    const initialListener = observationListeners[0]
    if (!initialListener) throw new Error('Git observation listener was not registered')
    act(() => {
      initialListener({
        subscriptionId: 'sub-a',
        contextKey: 'session:session-a',
        sessionId: 'session-a',
        kind: 'watch-error',
        message: 'missing managed worktree'
      })
      resolveInitialObserve?.({ subscriptionId: 'sub-a' })
    })
    await screen.findByText(/Git auto-refresh unavailable: missing managed worktree/)
    expect(screen.getByRole('button', { name: 'Refresh Git status' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh Git status' }))
    window.dispatchEvent(new Event('focus'))
    await waitFor(() =>
      expect(
        screen.getByText(/Git auto-refresh unavailable: missing managed worktree/)
      ).toBeInTheDocument()
    )

    rendered.rerender(<GitTool sessionId="session-b" />)
    await screen.findByText('branch-b')
    expect(screen.queryByText('branch-a')).not.toBeInTheDocument()
    const listener = observationListeners.at(-1)
    if (!listener) throw new Error('Git observation listener was not registered')
    act(() => {
      listener({
        subscriptionId: 'sub-b',
        contextKey: 'session:session-b',
        sessionId: 'session-b',
        kind: 'watch-error',
        message: 'native watcher stopped'
      })
    })

    await screen.findByText(/Git auto-refresh unavailable: native watcher stopped/)
    expect(screen.getByRole('button', { name: 'Refresh Git status' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh Git status' }))
    window.dispatchEvent(new Event('focus'))
    await waitFor(() =>
      expect(
        screen.getByText(/Git auto-refresh unavailable: native watcher stopped/)
      ).toBeInTheDocument()
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
    window.spacezero.git.getReview = vi.fn(async () => ({
      status: 'ok' as const,
      branch: 'main',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'change.txt',
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: '+change\n'
        }
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
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Commit & Push' })).toBeDisabled()
    )
    act(() => {
      projectionListener({ type: 'agent_end', sessionId: 'session-1', seq: 2 })
    })

    await waitFor(() => expect(window.spacezero.git.getReview).toHaveBeenCalledTimes(2))
  })

  it('preserves filter, expanded files, composer text, and actual scroll in memory for the current app run', async () => {
    window.spacezero.git.getReview = vi.fn(async ({ filter }: { filter: string }) => ({
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
    await userEvent.click(screen.getByRole('button', { name: 'Toggle diff' }))
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
    window.spacezero.git.getReview = vi.fn(async ({ filter }: { filter: string }) => ({
      status: 'ok' as const,
      branch: 'main',
      upstream: { kind: 'none' as const },
      files: [
        {
          path: 'shared.txt',
          kind: 'modified' as const,
          binary: false,
          large: false,
          diff: `diff --git a/shared.txt b/shared.txt\n+${filter}\n`
        }
      ]
    }))

    const rendered = render(<GitTool sessionId="session-restart" />)
    await screen.findByText('+uncommitted')
    await userEvent.click(screen.getByRole('tab', { name: 'Staged' }))
    await screen.findByText('+staged')
    await userEvent.click(screen.getByRole('button', { name: 'Toggle diff' }))
    await waitFor(() => expect(screen.queryByText('+staged')).not.toBeInTheDocument())
    fireEvent.scroll(screen.getByLabelText('Git changed files'), { target: { scrollTop: 91 } })
    await userEvent.type(screen.getByLabelText('Commit instructions'), 'not persisted')
    rendered.unmount()
    resetGitToolViewMemoryForTests()

    render(<GitTool sessionId="session-restart" />)

    await screen.findByText('+uncommitted')
    expect(screen.getByRole('tab', { name: 'Uncommitted' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByText('shared.txt')).toBeInTheDocument()
    expect(screen.getByText('+uncommitted')).toBeInTheDocument()
    expect(screen.getByLabelText('Commit instructions')).toHaveValue('')
    expect(screen.getByLabelText('Git changed files')).toHaveProperty('scrollTop', 0)
  })
})
