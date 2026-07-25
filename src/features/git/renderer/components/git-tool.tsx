import { useEffect, useState } from 'react'

import type { GitChangeFilter, GitFileDiff, GitReviewState, GitUpstreamState } from '../../shared'

const CHANGE_FILTERS: Array<{ value: GitChangeFilter; label: string }> = [
  { value: 'uncommitted', label: 'Uncommitted' },
  { value: 'unstaged', label: 'Unstaged' },
  { value: 'staged', label: 'Staged' }
]

const UNCHANGED_CONTEXT_LINES = 3

type GitToolProps = {
  sessionId: string
}

export function GitTool({ sessionId }: GitToolProps): React.JSX.Element {
  const [filter, setFilter] = useState<GitChangeFilter>('uncommitted')
  const [state, setState] = useState<GitReviewState | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    let canceled = false
    void window.spacezero.git.getProjectSessionReview({ sessionId, filter }).then((result) => {
      if (canceled) return
      setState(result)
      if (result.status === 'ok') setExpandedPaths(new Set(result.files.map((file) => file.path)))
      else setExpandedPaths(new Set())
    })
    return () => {
      canceled = true
    }
  }, [sessionId, filter])

  if (!state) {
    return (
      <GitShell filter={filter} onFilterChange={setFilter}>
        <GitStateMessage title="Loading Git…" />
      </GitShell>
    )
  }
  if (state.status === 'missing-worktree') {
    return (
      <GitShell filter={filter} onFilterChange={setFilter}>
        <GitStateMessage title="Managed worktree missing" message={state.message} />
      </GitShell>
    )
  }
  if (state.status === 'inaccessible') {
    return (
      <GitShell filter={filter} onFilterChange={setFilter}>
        <GitStateMessage title="Git unavailable" message={state.message} />
      </GitShell>
    )
  }
  if (state.status === 'git-error') {
    return (
      <GitShell filter={filter} onFilterChange={setFilter}>
        <GitStateMessage title="Git query failed" message={state.message} />
      </GitShell>
    )
  }

  return (
    <GitShell
      filter={filter}
      onFilterChange={(nextFilter) => {
        setState(null)
        setFilter(nextFilter)
      }}
      state={state}
    >
      {state.status === 'clean' ? (
        <GitStateMessage title={`No ${getFilterLabel(filter).toLowerCase()} changes`} message="This managed worktree is clean for the selected filter." />
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
          {state.files.map((file) => (
            <GitDiffCard
              key={`${file.oldPath ?? ''}:${file.path}`}
              expanded={expandedPaths.has(file.path)}
              file={file}
              onToggle={() =>
                setExpandedPaths((current) => {
                  const next = new Set(current)
                  if (next.has(file.path)) next.delete(file.path)
                  else next.add(file.path)
                  return next
                })
              }
            />
          ))}
        </div>
      )}
    </GitShell>
  )
}

function GitShell({
  filter,
  onFilterChange,
  state,
  children
}: {
  filter: GitChangeFilter
  onFilterChange: (filter: GitChangeFilter) => void
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
          {state ? (
            <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">
              {state.files.length === 0 ? 'Clean' : `${state.files.length} changed`}
            </span>
          ) : null}
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

function GitStateMessage({ title, message }: { title: string; message?: string }): React.JSX.Element {
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
