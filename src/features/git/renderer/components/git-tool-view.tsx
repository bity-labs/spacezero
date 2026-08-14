import { ArrowClockwise, DotsThree } from '@phosphor-icons/react'

import { DiffViewer } from '@renderer/components/diff-viewer'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Textarea } from '@renderer/components/ui/textarea'

import type { GitComposerAction } from '../../../../shared/git-action-settings'
import type { GitChangeFilter, GitFileDiff, GitReviewState, GitUpstreamState } from '../../shared'

const CHANGE_FILTERS: Array<{ value: GitChangeFilter; label: string }> = [
  { value: 'uncommitted', label: 'Uncommitted' },
  { value: 'unstaged', label: 'Unstaged' },
  { value: 'staged', label: 'Staged' }
]

export type GitCommitFooterView = {
  kind: 'commit'
  actionAvailability: Record<GitComposerAction, boolean>
  actions: readonly GitComposerAction[]
  actionsReady: boolean
  busy: boolean
  instructions: string
  menuOpen: boolean
  primaryAction: GitComposerAction
  primaryDisabled: boolean
  onInstructionsChange: (instructions: string) => void
  onMenuOpenChange: (open: boolean) => void
  onPrimaryActionChange: (action: GitComposerAction) => void
  onSubmit: (action: GitComposerAction) => void
}

export type GitConflictFooterView = {
  kind: 'conflict'
  disabled: boolean
  instructions: string
  onInstructionsChange: (instructions: string) => void
  onResolve: () => void
}

export type GitToolViewProps = {
  filter: GitChangeFilter
  state: GitReviewState | null
  isRefreshing: boolean
  watchDiagnostic?: string | null
  expandedPaths?: ReadonlySet<string>
  conflictCount?: number
  handoffError?: string | null
  pendingEdits?: React.ReactNode
  changedFilesContainerRef?: React.RefObject<HTMLDivElement | null>
  footer?: GitCommitFooterView | GitConflictFooterView | null
  renderFile?: (file: GitFileDiff, expanded: boolean) => React.ReactNode
  onChangedFilesScroll?: (scrollTop: number) => void
  onFilterChange: (filter: GitChangeFilter) => void
  onRefresh: () => void
  onToggleFile: (file: GitFileDiff) => void
}

export function GitToolView({
  filter,
  state,
  isRefreshing,
  watchDiagnostic,
  expandedPaths,
  conflictCount: suppliedConflictCount,
  handoffError,
  pendingEdits,
  changedFilesContainerRef,
  footer,
  renderFile,
  onChangedFilesScroll,
  onFilterChange,
  onRefresh,
  onToggleFile
}: GitToolViewProps): React.JSX.Element {
  const shellProps = {
    filter,
    isRefreshing,
    onFilterChange,
    onRefresh,
    watchDiagnostic
  }

  if (!state) {
    return (
      <GitShellView {...shellProps}>
        <GitStateMessage title="Loading Git…" />
      </GitShellView>
    )
  }
  if (state.status === 'missing-worktree') {
    return (
      <GitShellView {...shellProps}>
        <GitStateMessage title="Managed worktree missing" message={state.message} />
      </GitShellView>
    )
  }
  if (state.status === 'inaccessible') {
    return (
      <GitShellView {...shellProps}>
        <GitStateMessage title="Git unavailable" message={state.message} />
      </GitShellView>
    )
  }
  if (state.status === 'git-error') {
    return (
      <GitShellView {...shellProps}>
        <GitStateMessage title="Git query failed" message={state.message} />
      </GitShellView>
    )
  }

  const conflictCount =
    suppliedConflictCount ?? state.files.filter((file) => file.kind === 'conflicted').length
  const hasPendingEdits = pendingEdits !== undefined && pendingEdits !== null

  return (
    <GitShellView {...shellProps} state={state}>
      {state.files.length === 0 && !hasPendingEdits ? (
        <GitStateMessage
          title={`No ${getFilterLabel(filter).toLowerCase()} changes`}
          message="This managed worktree is clean for the selected filter."
        />
      ) : (
        <div
          ref={changedFilesContainerRef}
          aria-label="Git changed files"
          className="min-h-0 flex-1 space-y-3 overflow-auto p-4"
          onScroll={(event) => onChangedFilesScroll?.(event.currentTarget.scrollTop)}
        >
          {conflictCount > 0 ? <GitConflictBanner conflictCount={conflictCount} /> : null}
          {handoffError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {handoffError}
            </div>
          ) : null}
          {pendingEdits}
          {state.files.map((file) => {
            const expanded = expandedPaths ? expandedPaths.has(file.path) : true
            return renderFile ? (
              renderFile(file, expanded)
            ) : (
              <GitDiffCardView
                key={`${file.oldPath ?? ''}:${file.path}`}
                expanded={expanded}
                file={file}
                onToggle={() => onToggleFile(file)}
              />
            )
          })}
        </div>
      )}
      {footer?.kind === 'conflict' ? <GitConflictResolverView {...footer} /> : null}
      {footer?.kind === 'commit' ? <GitCommitComposerView {...footer} /> : null}
    </GitShellView>
  )
}

export function GitDiffCardView({
  file,
  expanded,
  onToggle
}: {
  file: GitFileDiff
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  if (file.diff && !file.binary && !file.large) {
    return (
      <DiffViewer
        ariaLabel={`Diff for ${file.path}`}
        items={[
          {
            id: `${file.oldPath ?? ''}:${file.path}`,
            path: file.path,
            oldPath: file.oldPath,
            patch: file.diff,
            collapsed: !expanded,
            headerActions: {
              status: file.kind,
              onToggle
            }
          }
        ]}
      />
    )
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="relative flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent/60">
        <button
          aria-expanded={expanded}
          aria-label="Toggle diff"
          className="absolute inset-0 z-0 cursor-pointer rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          type="button"
          onClick={onToggle}
        />
        <div className="pointer-events-none relative z-10 min-w-0">
          <span className="block truncate text-sm font-medium">{file.path}</span>
          {file.oldPath ? (
            <div className="truncate text-xs text-muted-foreground">
              renamed from {file.oldPath}
            </div>
          ) : null}
        </div>
        <div className="pointer-events-none relative z-10 flex shrink-0 items-center gap-2">
          <span className="rounded border px-2 py-0.5 text-xs capitalize text-muted-foreground">
            {file.kind}
          </span>
        </div>
      </div>
      {expanded ? (
        <div className="border-t p-3 text-sm text-muted-foreground">
          {file.binary
            ? 'Binary change summary only. No text diff is available.'
            : file.large
              ? 'Diff is too large to render inline.'
              : 'No text diff is available for this change.'}
        </div>
      ) : null}
    </section>
  )
}

function GitConflictBanner({ conflictCount }: { conflictCount: number }): React.JSX.Element {
  return (
    <div
      aria-label="Unresolved Git conflicts"
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
      role="status"
    >
      <p className="font-semibold">Unresolved Git conflicts</p>
      <p className="mt-1">
        {conflictCount === 1
          ? '1 conflicted file needs resolution before commit or push.'
          : `${conflictCount} conflicted files need resolution before commit or push.`}
      </p>
    </div>
  )
}

function GitConflictResolverView({
  disabled,
  instructions,
  onInstructionsChange,
  onResolve
}: GitConflictFooterView): React.JSX.Element {
  return (
    <footer className="shrink-0 space-y-3 border-t bg-background p-4">
      <Textarea
        aria-label="Commit instructions"
        className="min-h-20 resize-none"
        placeholder="Optional notes to keep for the next commit request…"
        value={instructions}
        onChange={(event) => onInstructionsChange(event.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Sends a normal prompt to this Project Session agent to inspect fresh managed-worktree
          state and resolve the conflict workflow.
        </p>
        <Button disabled={disabled} type="button" onClick={onResolve}>
          Resolve with agent
        </Button>
      </div>
    </footer>
  )
}

function GitShellView({
  filter,
  isRefreshing,
  onFilterChange,
  onRefresh,
  state,
  watchDiagnostic,
  children
}: {
  filter: GitChangeFilter
  isRefreshing: boolean
  onFilterChange: (filter: GitChangeFilter) => void
  onRefresh: () => void
  state?: Extract<GitReviewState, { status: 'ok' | 'clean' }>
  watchDiagnostic?: string | null
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
            <Button
              aria-label="Refresh Git status"
              disabled={isRefreshing}
              size="icon-sm"
              title="Refresh Git status"
              type="button"
              variant="outline"
              onClick={onRefresh}
            >
              <ArrowClockwise
                aria-hidden="true"
                className={isRefreshing ? 'size-4 animate-spin' : 'size-4'}
              />
              {isRefreshing ? (
                <span aria-label="Refreshing Git status" className="sr-only" role="status" />
              ) : null}
            </Button>
          </div>
        </div>
        {watchDiagnostic ? (
          <div
            className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            role="status"
          >
            Git auto-refresh unavailable: {watchDiagnostic} You can still refresh manually.
          </div>
        ) : null}
        <div className="mt-3 flex gap-2" role="tablist" aria-label="Changes filter">
          {CHANGE_FILTERS.map((option) => (
            <button
              key={option.value}
              aria-selected={filter === option.value}
              className={`rounded-md border px-3 py-1 text-xs ${
                filter === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground'
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

function GitCommitComposerView({
  actionAvailability,
  actions,
  actionsReady,
  busy,
  instructions,
  menuOpen,
  primaryAction,
  primaryDisabled,
  onInstructionsChange,
  onMenuOpenChange,
  onPrimaryActionChange,
  onSubmit
}: GitCommitFooterView): React.JSX.Element {
  return (
    <footer className="shrink-0 space-y-3 border-t bg-background p-4">
      <Textarea
        aria-label="Commit instructions"
        className="min-h-20 resize-none"
        placeholder="Optional commit message or instructions for the Project Session agent…"
        value={instructions}
        onChange={(event) => onInstructionsChange(event.target.value)}
      />
      <div className="flex items-center justify-end gap-3">
        <div className="flex shrink-0 items-center" role="group" aria-label="Git commit action">
          <Button
            className="rounded-r-none"
            disabled={primaryDisabled}
            type="button"
            onClick={() => onSubmit(primaryAction)}
          >
            {formatActionLabel(primaryAction)}
          </Button>
          <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label="Choose Git commit action"
                  className="-ml-px rounded-l-none border-l-primary-foreground/30 px-2"
                  disabled={busy || !actionsReady}
                  size="icon"
                  title="Choose Git commit action"
                  type="button"
                  variant="default"
                />
              }
            >
              <DotsThree aria-hidden="true" className="size-5" weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40" side="top">
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action}
                  aria-current={primaryAction === action ? 'true' : undefined}
                  disabled={busy || !actionAvailability[action]}
                  onClick={() => onPrimaryActionChange(action)}
                >
                  {formatActionLabel(action)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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

function formatActionLabel(action: GitComposerAction): string {
  if (action === 'commit') return 'Commit'
  if (action === 'commit-and-create-pr') return 'Commit and create a PR'
  return 'Commit & Push'
}
