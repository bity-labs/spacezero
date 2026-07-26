import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'

import { useAgentSession } from '../../../agent-workspace/renderer'
import type { GitComposerAction } from '../../../../shared/git-action-settings'
import type { GitChangeFilter, GitFileDiff, GitReviewState, GitUpstreamState } from '../../shared'

const CHANGE_FILTERS: Array<{ value: GitChangeFilter; label: string }> = [
  { value: 'uncommitted', label: 'Uncommitted' },
  { value: 'unstaged', label: 'Unstaged' },
  { value: 'staged', label: 'Staged' }
]

const UNCHANGED_CONTEXT_LINES = 3
const OBSERVATION_REFRESH_DELAY_MS = 150

type GitViewMemory = {
  filter: GitChangeFilter
  expandedPaths: Set<string>
  collapsedPaths: Set<string>
  instructions: string
  scrollTop: number
}

const gitViewMemoryBySession = new Map<string, GitViewMemory>()

export function resetGitToolViewMemoryForTests(): void {
  gitViewMemoryBySession.clear()
}

function getGitViewMemory(sessionId: string): GitViewMemory {
  const existing = gitViewMemoryBySession.get(sessionId)
  if (existing) return existing
  const created = {
    filter: 'uncommitted' as GitChangeFilter,
    expandedPaths: new Set<string>(),
    collapsedPaths: new Set<string>(),
    instructions: '',
    scrollTop: 0
  }
  gitViewMemoryBySession.set(sessionId, created)
  return created
}

type GitToolProps = {
  sessionId: string
}

export function GitTool({ sessionId }: GitToolProps): React.JSX.Element {
  const agentSession = useAgentSession(sessionId)
  const initialMemory = useMemo(() => getGitViewMemory(sessionId), [sessionId])
  const [filter, setFilterState] = useState<GitChangeFilter>(initialMemory.filter)
  const [state, setState] = useState<GitReviewState | null>(null)
  const [actionState, setActionState] = useState<GitReviewState | null>(null)
  const [expandedPaths, setExpandedPathsState] = useState<Set<string>>(
    () => new Set(initialMemory.expandedPaths)
  )
  const [primaryAction, setPrimaryAction] = useState<GitComposerAction>('commit-and-push')
  const [instructions, setInstructionsState] = useState(initialMemory.instructions)
  const [menuOpen, setMenuOpen] = useState(false)
  const refreshSequence = useRef(0)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const gitPromptRunPending = useRef(false)
  const previousAgentStatus = useRef(agentSession.status)

  const setFilter = useCallback(
    (nextFilter: GitChangeFilter) => {
      getGitViewMemory(sessionId).filter = nextFilter
      setFilterState(nextFilter)
    },
    [sessionId]
  )
  const setInstructions = useCallback(
    (nextInstructions: string) => {
      getGitViewMemory(sessionId).instructions = nextInstructions
      setInstructionsState(nextInstructions)
    },
    [sessionId]
  )
  const setExpandedPaths = useCallback(
    (next: Set<string> | ((current: Set<string>) => Set<string>)) => {
      setExpandedPathsState((current) => {
        const resolved = typeof next === 'function' ? next(current) : next
        getGitViewMemory(sessionId).expandedPaths = new Set(resolved)
        return resolved
      })
    },
    [sessionId]
  )

  const refresh = useCallback(
    async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
      const requestId = (refreshSequence.current += 1)
      if (showLoading) {
        setState(null)
        setActionState(null)
      }
      const selectedReviewPromise = window.spacezero.git.getProjectSessionReview({ sessionId, filter })
      const actionReviewPromise =
        filter === 'uncommitted'
          ? selectedReviewPromise
          : window.spacezero.git.getProjectSessionReview({ sessionId, filter: 'uncommitted' })
      const [selectedReview, actionReview] = await Promise.all([selectedReviewPromise, actionReviewPromise])
      if (requestId !== refreshSequence.current) return
      setState(selectedReview)
      setActionState(actionReview)
      if (selectedReview.status === 'ok') {
        const memory = getGitViewMemory(sessionId)
        setExpandedPaths(
          new Set(
            selectedReview.files
              .map((file) => file.path)
              .filter((filePath) => !memory.collapsedPaths.has(filePath))
          )
        )
      } else if (selectedReview.status === 'clean') {
        setExpandedPaths(new Set())
      }
    },
    [filter, sessionId, setExpandedPaths]
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh({ showLoading: true })
    }, 0)
    return () => clearTimeout(timer)
  }, [refresh])

  useEffect(() => {
    let canceled = false
    void window.spacezero.settings
      .getGitActionSettings()
      .then((settings) => {
        if (!canceled) setPrimaryAction(settings.primaryGitAction)
      })
      .catch(() => {
        // Keep the product default when the preference cannot be loaded.
      })
    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let observationSubscriptionId: string | null = null
    const unsubscribeEvents = window.spacezero.git.onObservationEvent((event) => {
      if (event.subscriptionId !== observationSubscriptionId || event.sessionId !== sessionId) return
      if (event.kind === 'watch-error') return
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        void refresh()
      }, OBSERVATION_REFRESH_DELAY_MS)
    })

    void window.spacezero.git
      .observeProjectSession({ sessionId })
      .then(({ subscriptionId }) => {
        if (disposed) {
          void window.spacezero.git.unobserveProjectSession({ subscriptionId })
          return
        }
        observationSubscriptionId = subscriptionId
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unsubscribeEvents()
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (observationSubscriptionId) {
        void window.spacezero.git.unobserveProjectSession({ subscriptionId: observationSubscriptionId })
      }
    }
  }, [refresh, sessionId])

  useEffect(() => {
    const onFocus = (): void => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  useEffect(() => {
    const memory = getGitViewMemory(sessionId)
    const container = scrollContainerRef.current
    if (!container) return
    container.scrollTop = memory.scrollTop
  }, [sessionId, state])

  useEffect(() => {
    if (
      gitPromptRunPending.current &&
      previousAgentStatus.current === 'running' &&
      agentSession.status === 'idle'
    ) {
      gitPromptRunPending.current = false
      void refresh()
    }
    previousAgentStatus.current = agentSession.status
  }, [agentSession.status, refresh])

  const actions = useMemo(() => getActionAvailability(actionState), [actionState])
  const alternateAction = primaryAction === 'commit' ? 'commit-and-push' : 'commit'
  const busy = agentSession.status === 'running'
  const primaryDisabled = busy || !actions[primaryAction]
  const alternateDisabled = busy || !actions[alternateAction]

  if (!state) {
    return (
      <GitShell filter={filter} onFilterChange={setFilter} onRefresh={() => void refresh()}>
        <GitStateMessage title="Loading Git…" />
      </GitShell>
    )
  }
  if (state.status === 'missing-worktree') {
    return (
      <GitShell filter={filter} onFilterChange={setFilter} onRefresh={() => void refresh()}>
        <GitStateMessage title="Managed worktree missing" message={state.message} />
      </GitShell>
    )
  }
  if (state.status === 'inaccessible') {
    return (
      <GitShell filter={filter} onFilterChange={setFilter} onRefresh={() => void refresh()}>
        <GitStateMessage title="Git unavailable" message={state.message} />
      </GitShell>
    )
  }
  if (state.status === 'git-error') {
    return (
      <GitShell filter={filter} onFilterChange={setFilter} onRefresh={() => void refresh()}>
        <GitStateMessage title="Git query failed" message={state.message} />
      </GitShell>
    )
  }

  return (
    <GitShell
      filter={filter}
      onFilterChange={(nextFilter) => {
        setFilter(nextFilter)
      }}
      onRefresh={() => void refresh()}
      state={state}
    >
      {state.status === 'clean' ? (
        <GitStateMessage
          title={`No ${getFilterLabel(filter).toLowerCase()} changes`}
          message="This managed worktree is clean for the selected filter."
        />
      ) : (
        <div
          ref={scrollContainerRef}
          className="min-h-0 flex-1 space-y-3 overflow-auto p-4"
          onScroll={(event) => {
            getGitViewMemory(sessionId).scrollTop = event.currentTarget.scrollTop
          }}
        >
          {state.files.map((file) => (
            <GitDiffCard
              key={`${file.oldPath ?? ''}:${file.path}`}
              expanded={expandedPaths.has(file.path)}
              file={file}
              onToggle={() =>
                setExpandedPaths((current) => {
                  const memory = getGitViewMemory(sessionId)
                  const next = new Set(current)
                  if (next.has(file.path)) {
                    next.delete(file.path)
                    memory.collapsedPaths.add(file.path)
                  } else {
                    next.add(file.path)
                    memory.collapsedPaths.delete(file.path)
                  }
                  return next
                })
              }
            />
          ))}
        </div>
      )}
      <GitCommitComposer
        alternateAction={alternateAction}
        alternateDisabled={alternateDisabled}
        busy={busy}
        instructions={instructions}
        menuOpen={menuOpen}
        primaryAction={primaryAction}
        primaryDisabled={primaryDisabled}
        onInstructionsChange={setInstructions}
        onMenuOpenChange={setMenuOpen}
        onSubmit={(action) => {
          setMenuOpen(false)
          gitPromptRunPending.current = true
          void agentSession.prompt(buildGitActionPrompt(action, instructions, state.upstream))
        }}
      />
    </GitShell>
  )
}

function GitShell({
  filter,
  onFilterChange,
  onRefresh,
  state,
  children
}: {
  filter: GitChangeFilter
  onFilterChange: (filter: GitChangeFilter) => void
  onRefresh: () => void
  state?: Extract<GitReviewState, { status: 'ok' | 'clean' }>
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Git</h2>
            {state ? (
              <p className="text-xs text-muted-foreground">
                Branch <span className="font-medium text-foreground">{state.branch}</span>
                {' · '}
                {formatUpstream(state.upstream)}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {state ? (
              <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">
                {state.files.length === 0 ? 'Clean' : `${state.files.length} changed`}
              </span>
            ) : null}
            <Button size="sm" type="button" variant="outline" onClick={onRefresh}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="mt-3 flex gap-2" role="tablist" aria-label="Changes filter">
          {CHANGE_FILTERS.map((option) => (
            <button
              key={option.value}
              aria-selected={filter === option.value}
              className={`rounded-md border px-3 py-1 text-xs ${
                filter === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
              role="tab"
              type="button"
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>
      {children}
    </div>
  )
}

function GitDiffCard({
  file,
  expanded,
  onToggle
}: {
  file: GitFileDiff
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <button
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent/60"
        type="button"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{file.path}</div>
          {file.oldPath ? (
            <div className="truncate text-xs text-muted-foreground">renamed from {file.oldPath}</div>
          ) : null}
        </div>
        <span className="shrink-0 rounded border px-2 py-0.5 text-xs capitalize text-muted-foreground">
          {file.kind}
        </span>
      </button>
      {expanded ? (
        file.diff && !file.binary && !file.large ? (
          <pre className="max-h-[480px] overflow-auto border-t bg-muted/30 p-3 text-xs leading-5">
            <code>
              {foldDiff(file.diff).map((line, index) => (
                <span key={`${index}:${line}`} className="block">
                  {line}
                </span>
              ))}
            </code>
          </pre>
        ) : (
          <div className="border-t p-3 text-sm text-muted-foreground">
            {file.binary
              ? 'Binary change summary only. No text diff is available.'
              : file.large
                ? 'Diff is too large to render inline.'
                : 'No text diff is available for this change.'}
          </div>
        )
      ) : null}
    </section>
  )
}

function GitCommitComposer({
  alternateAction,
  alternateDisabled,
  busy,
  instructions,
  menuOpen,
  primaryAction,
  primaryDisabled,
  onInstructionsChange,
  onMenuOpenChange,
  onSubmit
}: {
  alternateAction: GitComposerAction
  alternateDisabled: boolean
  busy: boolean
  instructions: string
  menuOpen: boolean
  primaryAction: GitComposerAction
  primaryDisabled: boolean
  onInstructionsChange: (instructions: string) => void
  onMenuOpenChange: (open: boolean) => void
  onSubmit: (action: GitComposerAction) => void
}): React.JSX.Element {
  return (
    <footer className="shrink-0 space-y-3 border-t bg-background p-4">
      <Textarea
        aria-label="Commit instructions"
        className="min-h-20 resize-none"
        placeholder="Optional commit message or instructions for the Project Session agent…"
        value={instructions}
        onChange={(event) => onInstructionsChange(event.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Sends a normal prompt to this Project Session agent. The agent will inspect fresh Git
          state.
        </p>
        <div className="relative flex shrink-0 items-center gap-2">
          <Button disabled={primaryDisabled} type="button" onClick={() => onSubmit(primaryAction)}>
            {formatActionLabel(primaryAction)}
          </Button>
          <Button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            disabled={busy}
            type="button"
            variant="outline"
            onClick={() => onMenuOpenChange(!menuOpen)}
          >
            More
          </Button>
          {menuOpen ? (
            <div
              className="absolute bottom-11 right-0 z-10 min-w-40 rounded-md border bg-popover p-1 shadow-md"
              role="menu"
            >
              <button
                className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={alternateDisabled}
                role="menuitem"
                type="button"
                onClick={() => onSubmit(alternateAction)}
              >
                {formatActionLabel(alternateAction)}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  )
}

function GitStateMessage({
  title,
  message
}: {
  title: string
  message?: string
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 p-6 text-center">
      <h2 className="text-sm font-semibold">{title}</h2>
      {message ? <p className="max-w-sm text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}

function foldDiff(diff: string): string[] {
  const lines = diff.split('\n')
  const folded: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith(' ')) {
      folded.push(lines[index])
      continue
    }

    const start = index
    while (index < lines.length && lines[index].startsWith(' ')) index += 1
    const unchanged = lines.slice(start, index)
    index -= 1
    if (unchanged.length <= UNCHANGED_CONTEXT_LINES * 2) {
      folded.push(...unchanged)
      continue
    }
    folded.push(...unchanged.slice(0, UNCHANGED_CONTEXT_LINES))
    folded.push(`… ${unchanged.length - UNCHANGED_CONTEXT_LINES * 2} unchanged lines folded`)
    folded.push(...unchanged.slice(-UNCHANGED_CONTEXT_LINES))
  }
  return folded
}

function getFilterLabel(filter: GitChangeFilter): string {
  return CHANGE_FILTERS.find((option) => option.value === filter)?.label ?? 'Uncommitted'
}

function formatUpstream(upstream: GitUpstreamState): string {
  if (upstream.kind === 'none') return 'No upstream'
  const parts: string[] = [upstream.name]
  if (upstream.ahead > 0) parts.push(`${upstream.ahead} ahead`)
  if (upstream.behind > 0) parts.push(`${upstream.behind} behind`)
  if (parts.length === 1) parts.push('up to date')
  return parts.join(' · ')
}

function getActionAvailability(state: GitReviewState | null): Record<GitComposerAction, boolean> {
  if (
    !state ||
    state.status === 'missing-worktree' ||
    state.status === 'inaccessible' ||
    state.status === 'git-error'
  ) {
    return { commit: false, 'commit-and-push': false }
  }

  const hasChanges = state.files.length > 0
  const branchAhead = state.upstream.kind === 'tracked' && state.upstream.ahead > 0
  return {
    commit: state.status === 'ok' && hasChanges,
    'commit-and-push': hasChanges || branchAhead
  }
}

function buildGitActionPrompt(
  action: GitComposerAction,
  instructions: string,
  upstream: GitUpstreamState
): string {
  const trimmedInstructions = instructions.trim()
  const lines = [
    action === 'commit'
      ? 'Please inspect the current Git state in this Project Session managed worktree and create an appropriate commit for the saved repository changes.'
      : 'Please inspect the current Git state in this Project Session managed worktree, create an appropriate commit for saved repository changes if needed, and push the branch.',
    'Do not rely on the rendered diff in Space Zero and do not use any diff payload from this request; run fresh Git status and diff commands in the managed worktree before acting.'
  ]

  if (trimmedInstructions) {
    lines.push('Treat this as my preferred commit message or commit instructions:')
    lines.push(trimmedInstructions)
  } else {
    lines.push(
      'If I did not provide a commit message, choose an appropriate commit message from the fresh repository state you inspect.'
    )
  }

  if (action === 'commit-and-push') {
    lines.push(
      upstream.kind === 'none'
        ? 'No upstream is currently configured in Space Zero Git status; commit locally if appropriate, explain why pushing cannot proceed, and ask me for the required remote or upstream information.'
        : 'If pushing cannot proceed, explain the blocker in the normal Session transcript and ask me for the required information.'
    )
  }

  return lines.join('\n\n')
}

function formatActionLabel(action: GitComposerAction): string {
  return action === 'commit' ? 'Commit' : 'Commit & Push'
}
