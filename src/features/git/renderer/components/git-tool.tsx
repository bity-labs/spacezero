import { useEffect, useState } from 'react'

import type { GitFileDiff, GitReviewState, GitUpstreamState } from '../../shared'

type GitToolProps = {
  sessionId: string
}

export function GitTool({ sessionId }: GitToolProps): React.JSX.Element {
  const [state, setState] = useState<GitReviewState | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    let canceled = false
    void window.spacezero.git.getProjectSessionReview({ sessionId }).then((result) => {
      if (canceled) return
      setState(result)
      if (result.status === 'ok') setExpandedPaths(new Set(result.files.map((file) => file.path)))
      else setExpandedPaths(new Set())
    })
    return () => {
      canceled = true
    }
  }, [sessionId])

  if (!state) return <GitStateMessage title="Loading Git…" />
  if (state.status === 'missing-worktree') {
    return <GitStateMessage title="Managed worktree missing" message={state.message} />
  }
  if (state.status === 'inaccessible') {
    return <GitStateMessage title="Git unavailable" message={state.message} />
  }
  if (state.status === 'git-error') {
    return <GitStateMessage title="Git query failed" message={state.message} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Git</h2>
            <p className="text-xs text-muted-foreground">
              Branch <span className="font-medium text-foreground">{state.branch}</span>
              {' · '}
              {formatUpstream(state.upstream)}
            </p>
          </div>
          <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">
            {state.files.length === 0 ? 'Clean' : `${state.files.length} changed`}
          </span>
        </div>
      </header>
      {state.status === 'clean' ? (
        <GitStateMessage title="No saved changes" message="This managed worktree is clean." />
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
            <code>{file.diff}</code>
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

function formatUpstream(upstream: GitUpstreamState): string {
  if (upstream.kind === 'none') return 'No upstream'
  const parts: string[] = [upstream.name]
  if (upstream.ahead > 0) parts.push(`${upstream.ahead} ahead`)
  if (upstream.behind > 0) parts.push(`${upstream.behind} behind`)
  if (parts.length === 1) parts.push('up to date')
  return parts.join(' · ')
}
