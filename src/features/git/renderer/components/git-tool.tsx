import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@renderer/components/ui/button'
import type { WorkspaceSession } from '../../../sessions/shared'
import { Textarea } from '@renderer/components/ui/textarea'

import { useAgentSession } from '../../../agent-workspace/renderer'
import type { GitComposerAction } from '../../../../shared/git-action-settings'
import type {
  GitChangeFilter,
  GitContext,
  GitFileDiff,
  GitReviewState,
  GitUpstreamState
} from '../../shared'

const CHANGE_FILTERS: Array<{ value: GitChangeFilter; label: string }> = [
  { value: 'uncommitted', label: 'Uncommitted' },
  { value: 'unstaged', label: 'Unstaged' },
  { value: 'staged', label: 'Staged' }
]

const UNCHANGED_CONTEXT_LINES = 3
const OBSERVATION_REFRESH_DELAY_MS = 150
const MAX_OBSERVATION_DIAGNOSTIC_LENGTH = 512
const KNOWLEDGE_BASE_SESSION_CHANGED_EVENT = 'spacezero:knowledge-base-session-changed'

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

function getGitViewMemory(memoryKey: string): GitViewMemory {
  const existing = gitViewMemoryBySession.get(memoryKey)
  if (existing) return existing
  const created = {
    filter: 'uncommitted' as GitChangeFilter,
    expandedPaths: new Set<string>(),
    collapsedPaths: new Set<string>(),
    instructions: '',
    scrollTop: 0
  }
  gitViewMemoryBySession.set(memoryKey, created)
  return created
}

type GitFilesHandoff = {
  openFilesTool: () => void
  openLocation: (location: {
    relativePath: string
    line?: number
  }) => Promise<
    { status: 'opened' } | { status: 'ignored' } | { status: 'failed'; message: string }
  >
}

type GitAgentSession = ReturnType<typeof useAgentSession>

type GitToolProps = {
  context?: GitContext
  sessionId?: string
  filesHandoff?: GitFilesHandoff
}

export function GitTool({ context, sessionId, filesHandoff }: GitToolProps): React.JSX.Element {
  const gitContext = context ?? (sessionId ? { kind: 'project-session' as const, sessionId } : null)
  if (!gitContext) throw new Error('GitTool requires a Git context.')
  if (gitContext.kind === 'project-session') {
    return <ProjectGitTool context={gitContext} filesHandoff={filesHandoff} />
  }
  return <KnowledgeBaseGitTool context={gitContext} filesHandoff={filesHandoff} />
}

function KnowledgeBaseGitTool({
  context,
  filesHandoff
}: {
  context: Extract<GitContext, { kind: 'knowledge-base' }>
  filesHandoff?: GitFilesHandoff
}): React.JSX.Element {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const sessionLookupSequence = useRef(0)

  useEffect(() => {
    let canceled = false
    const loadCurrentSession = async (): Promise<void> => {
      const requestId = (sessionLookupSequence.current += 1)
      const session = await window.spacezero.knowledgeBase.getCurrentSession()
      if (!canceled && requestId === sessionLookupSequence.current) setSessionId(session.id)
    }
    const onFocus = (): void => {
      void loadCurrentSession()
    }
    const onSessionChanged = (event: Event): void => {
      const detail = (event as CustomEvent<WorkspaceSession>).detail
      if (detail?.id) {
        sessionLookupSequence.current += 1
        setSessionId(detail.id)
      } else void loadCurrentSession()
    }
    void loadCurrentSession()
    window.addEventListener(KNOWLEDGE_BASE_SESSION_CHANGED_EVENT, onSessionChanged)
    window.addEventListener('focus', onFocus)
    return () => {
      canceled = true
      window.removeEventListener(KNOWLEDGE_BASE_SESSION_CHANGED_EVENT, onSessionChanged)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  if (!sessionId) {
    return <GitToolSession key={context.contextKey} context={context} filesHandoff={filesHandoff} />
  }

  return (
    <KnowledgeBaseGitToolSession
      key={`${context.contextKey}:${sessionId}`}
      context={context}
      filesHandoff={filesHandoff}
      sessionId={sessionId}
    />
  )
}

function KnowledgeBaseGitToolSession({
  context,
  filesHandoff,
  sessionId
}: {
  context: Extract<GitContext, { kind: 'knowledge-base' }>
  filesHandoff?: GitFilesHandoff
  sessionId: string
}): React.JSX.Element {
  const agentSession = useAgentSession(sessionId)
  return (
    <GitToolSession agentSession={agentSession} context={context} filesHandoff={filesHandoff} />
  )
}

function ProjectGitTool({
  context,
  filesHandoff
}: {
  context: Extract<GitContext, { kind: 'project-session' }>
  filesHandoff?: GitFilesHandoff
}): React.JSX.Element {
  const agentSession = useAgentSession(context.sessionId)
  return (
    <GitToolSession
      key={`session:${context.sessionId}`}
      agentSession={agentSession}
      context={context}
      filesHandoff={filesHandoff}
    />
  )
}

function getGitContextMemoryKey(context: GitContext): string {
  return context.kind === 'knowledge-base' ? context.contextKey : `session:${context.sessionId}`
}

function GitToolSession({
  context,
  filesHandoff,
  agentSession = null
}: {
  context: GitContext
  filesHandoff?: GitFilesHandoff
  agentSession?: GitAgentSession | null
}): React.JSX.Element {
  const gitMemoryKey = getGitContextMemoryKey(context)
  const initialMemory = useMemo(() => getGitViewMemory(gitMemoryKey), [gitMemoryKey])
  const [filter, setFilterState] = useState<GitChangeFilter>(initialMemory.filter)
  const [state, setState] = useState<GitReviewState | null>(null)
  const [actionState, setActionState] = useState<GitReviewState | null>(null)
  const [expandedPaths, setExpandedPathsState] = useState<Set<string>>(
    () => new Set(initialMemory.expandedPaths)
  )
  const [primaryAction, setPrimaryAction] = useState<GitComposerAction>('commit-and-push')
  const [instructions, setInstructionsState] = useState(initialMemory.instructions)
  const [watchDiagnostic, setWatchDiagnostic] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [handoffError, setHandoffError] = useState<string | null>(null)
  const refreshSequence = useRef(0)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const gitPromptRunPending = useRef(false)
  const hasAgentSession = Boolean(agentSession)
  const currentAgentStatus = agentSession?.status ?? 'idle'
  const previousAgentStatus = useRef(currentAgentStatus)

  const setFilter = useCallback(
    (nextFilter: GitChangeFilter) => {
      getGitViewMemory(gitMemoryKey).filter = nextFilter
      setFilterState(nextFilter)
    },
    [gitMemoryKey]
  )
  const setInstructions = useCallback(
    (nextInstructions: string) => {
      getGitViewMemory(gitMemoryKey).instructions = nextInstructions
      setInstructionsState(nextInstructions)
    },
    [gitMemoryKey]
  )
  const setExpandedPaths = useCallback(
    (next: Set<string> | ((current: Set<string>) => Set<string>)) => {
      setExpandedPathsState((current) => {
        const resolved = typeof next === 'function' ? next(current) : next
        getGitViewMemory(gitMemoryKey).expandedPaths = new Set(resolved)
        return resolved
      })
    },
    [gitMemoryKey]
  )

  const refresh = useCallback(
    async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
      const requestId = (refreshSequence.current += 1)
      if (showLoading) {
        setState(null)
        setActionState(null)
      }
      const selectedReviewPromise = window.spacezero.git.getReview({
        context,
        filter
      })
      const actionReviewPromise =
        !hasAgentSession || filter === 'uncommitted'
          ? selectedReviewPromise
          : window.spacezero.git.getReview({ context, filter: 'uncommitted' })
      const [selectedReview, actionReview] = await Promise.all([
        selectedReviewPromise,
        actionReviewPromise
      ])
      if (requestId !== refreshSequence.current) return
      setState(selectedReview)
      setActionState(actionReview)
      if (selectedReview.status === 'ok') {
        const memory = getGitViewMemory(gitMemoryKey)
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
    [context, filter, gitMemoryKey, hasAgentSession, setExpandedPaths]
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh({ showLoading: true })
    }, 0)
    return () => clearTimeout(timer)
  }, [refresh])

  useEffect(() => {
    if (!hasAgentSession) return
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
  }, [hasAgentSession])

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let observationSubscriptionId: string | null = null
    let observedWatchError = false
    const unsubscribeEvents = window.spacezero.git.onObservationEvent((event) => {
      if (event.contextKey !== gitMemoryKey) return
      if (event.subscriptionId !== observationSubscriptionId && observationSubscriptionId !== null)
        return
      if (event.kind === 'watch-error') {
        observedWatchError = true
        setWatchDiagnostic(getObservationErrorMessage(event.message))
        return
      }
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        void refresh()
      }, OBSERVATION_REFRESH_DELAY_MS)
    })

    void window.spacezero.git
      .observe({ context })
      .then(({ subscriptionId }) => {
        if (disposed) {
          void window.spacezero.git.unobserveProjectSession({ subscriptionId })
          return
        }
        observationSubscriptionId = subscriptionId
        if (!observedWatchError) setWatchDiagnostic(null)
      })
      .catch((error) => {
        if (!disposed) setWatchDiagnostic(getObservationErrorMessage(error))
      })

    return () => {
      disposed = true
      unsubscribeEvents()
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (observationSubscriptionId) {
        void window.spacezero.git.unobserveProjectSession({
          subscriptionId: observationSubscriptionId
        })
      }
    }
  }, [context, gitMemoryKey, refresh])

  useEffect(() => {
    const onFocus = (): void => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  useEffect(() => {
    const memory = getGitViewMemory(gitMemoryKey)
    const container = scrollContainerRef.current
    if (!container) return
    container.scrollTop = memory.scrollTop
  }, [gitMemoryKey, state])

  useEffect(() => {
    if (
      gitPromptRunPending.current &&
      previousAgentStatus.current === 'running' &&
      currentAgentStatus === 'idle'
    ) {
      gitPromptRunPending.current = false
      void refresh()
    }
    previousAgentStatus.current = currentAgentStatus
  }, [currentAgentStatus, refresh])

  const actions = useMemo(() => getActionAvailability(actionState), [actionState])
  const conflictFiles = useMemo(() => getConflictFiles(actionState), [actionState])
  const hasConflicts = conflictFiles.length > 0
  const alternateAction = primaryAction === 'commit' ? 'commit-and-push' : 'commit'
  const busy = currentAgentStatus === 'running'
  const primaryDisabled = busy || !actions[primaryAction]
  const alternateDisabled = busy || !actions[alternateAction]
  const resolveDisabled = busy || !hasConflicts

  if (!state) {
    return (
      <GitShell
        filter={filter}
        onFilterChange={setFilter}
        onRefresh={() => void refresh()}
        watchDiagnostic={watchDiagnostic}
      >
        <GitStateMessage title="Loading Git…" />
      </GitShell>
    )
  }
  if (state.status === 'missing-worktree') {
    return (
      <GitShell
        filter={filter}
        onFilterChange={setFilter}
        onRefresh={() => void refresh()}
        watchDiagnostic={watchDiagnostic}
      >
        <GitStateMessage title="Managed worktree missing" message={state.message} />
      </GitShell>
    )
  }
  if (state.status === 'inaccessible') {
    return (
      <GitShell
        filter={filter}
        onFilterChange={setFilter}
        onRefresh={() => void refresh()}
        watchDiagnostic={watchDiagnostic}
      >
        <GitStateMessage title="Git unavailable" message={state.message} />
      </GitShell>
    )
  }
  if (state.status === 'git-error') {
    return (
      <GitShell
        filter={filter}
        onFilterChange={setFilter}
        onRefresh={() => void refresh()}
        watchDiagnostic={watchDiagnostic}
      >
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
      watchDiagnostic={watchDiagnostic}
    >
      {state.status === 'clean' ? (
        <GitStateMessage
          title={`No ${getFilterLabel(filter).toLowerCase()} changes`}
          message="This managed worktree is clean for the selected filter."
        />
      ) : (
        <div
          ref={scrollContainerRef}
          aria-label="Git changed files"
          className="min-h-0 flex-1 space-y-3 overflow-auto p-4"
          onScroll={(event) => {
            getGitViewMemory(gitMemoryKey).scrollTop = event.currentTarget.scrollTop
          }}
        >
          {hasConflicts ? <GitConflictBanner conflictCount={conflictFiles.length} /> : null}
          {handoffError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {handoffError}
            </div>
          ) : null}
          {state.files.map((file) => (
            <GitDiffCard
              key={`${file.oldPath ?? ''}:${file.path}`}
              expanded={expandedPaths.has(file.path)}
              file={file}
              filesHandoff={filesHandoff}
              onHandoffError={setHandoffError}
              onToggle={() =>
                setExpandedPaths((current) => {
                  const memory = getGitViewMemory(gitMemoryKey)
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
      {agentSession ? (
        hasConflicts ? (
          <GitConflictResolver
            disabled={resolveDisabled}
            instructions={instructions}
            onInstructionsChange={setInstructions}
            onResolve={() => {
              gitPromptRunPending.current = true
              void agentSession.prompt(buildResolveConflictsPrompt(context))
            }}
          />
        ) : (
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
              void agentSession.prompt(
                buildGitActionPrompt(action, instructions, state.upstream, context)
              )
            }}
          />
        )
      ) : null}
    </GitShell>
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

function GitConflictResolver({
  disabled,
  instructions,
  onInstructionsChange,
  onResolve
}: {
  disabled: boolean
  instructions: string
  onInstructionsChange: (instructions: string) => void
  onResolve: () => void
}): React.JSX.Element {
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

function GitShell({
  filter,
  onFilterChange,
  onRefresh,
  state,
  watchDiagnostic,
  children
}: {
  filter: GitChangeFilter
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
            <Button size="sm" type="button" variant="outline" onClick={onRefresh}>
              Refresh
            </Button>
          </div>
        </div>
        {watchDiagnostic ? (
          <div
            className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            role="status"
          >
            Git auto-refresh unavailable: {watchDiagnostic} You can still use Refresh.
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

function GitDiffCard({
  file,
  expanded,
  filesHandoff,
  onHandoffError,
  onToggle
}: {
  file: GitFileDiff
  expanded: boolean
  filesHandoff?: GitFilesHandoff
  onHandoffError: (message: string | null) => void
  onToggle: () => void
}): React.JSX.Element {
  const canOpenInFiles = isFilesHandoffSupported(file, filesHandoff)
  const openInFiles = async (line?: number): Promise<void> => {
    if (!filesHandoff || !canOpenInFiles) return
    const result = await filesHandoff.openLocation({ relativePath: file.path, line })
    if (result.status === 'failed') {
      onHandoffError(result.message)
      return
    }
    if (result.status === 'opened') {
      onHandoffError(null)
      filesHandoff.openFilesTool()
    }
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
          <button
            className={`pointer-events-auto block truncate text-sm font-medium ${canOpenInFiles ? 'underline-offset-2 hover:underline' : ''}`}
            disabled={!canOpenInFiles}
            title={filesHandoffUnavailableMessage(file, filesHandoff)}
            type="button"
            onClick={() => void openInFiles()}
          >
            {file.path}
          </button>
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
        file.diff && !file.binary && !file.large ? (
          <pre className="max-h-[480px] overflow-auto border-t bg-muted/30 p-3 text-xs leading-5">
            <code>
              {getFoldedDiffLines(file.diff).map((line, index) => (
                <span key={`${index}:${line.text}`} className="block">
                  {line.text}
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

type FoldedDiffLine = { text: string }

function getFoldedDiffLines(diff: string): FoldedDiffLine[] {
  const lines = diff.split('\n')
  const folded: FoldedDiffLine[] = []
  let newLineNumber: number | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const hunkStart = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunkStart) {
      newLineNumber = Number(hunkStart[1])
      folded.push({ text: line })
      continue
    }

    if (line.startsWith(' ') && newLineNumber !== null) {
      const start = index
      while (index < lines.length && lines[index].startsWith(' ')) {
        newLineNumber += 1
        index += 1
      }
      const unchanged = lines.slice(start, index)
      index -= 1
      if (unchanged.length <= UNCHANGED_CONTEXT_LINES * 2) {
        folded.push(...unchanged.map((text) => ({ text })))
        continue
      }
      folded.push(...unchanged.slice(0, UNCHANGED_CONTEXT_LINES).map((text) => ({ text })))
      folded.push({
        text: `… ${unchanged.length - UNCHANGED_CONTEXT_LINES * 2} unchanged lines folded`
      })
      folded.push(...unchanged.slice(-UNCHANGED_CONTEXT_LINES).map((text) => ({ text })))
      continue
    }

    folded.push({ text: line })
    if (
      newLineNumber !== null &&
      !line.startsWith('-') &&
      !line.startsWith('+++') &&
      !line.startsWith('\\')
    ) {
      newLineNumber += 1
    }
  }
  return folded
}

function getObservationErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error || 'Git auto-refresh setup failed.')
  const trimmed = message.trim() || 'Git auto-refresh setup failed.'
  return trimmed.length > MAX_OBSERVATION_DIAGNOSTIC_LENGTH
    ? `${trimmed.slice(0, MAX_OBSERVATION_DIAGNOSTIC_LENGTH - 1)}…`
    : trimmed
}

function isFilesHandoffSupported(file: GitFileDiff, filesHandoff?: GitFilesHandoff): boolean {
  return Boolean(filesHandoff) && file.kind !== 'deleted'
}

function filesHandoffUnavailableMessage(
  file: GitFileDiff,
  filesHandoff?: GitFilesHandoff
): string | undefined {
  if (!filesHandoff) return 'Files is unavailable for this Git context.'
  if (file.kind === 'deleted')
    return 'Deleted files stay reviewable in Git and cannot be opened in Files.'
  return undefined
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

  if (getConflictFiles(state).length > 0) return { commit: false, 'commit-and-push': false }

  const hasChanges = state.files.length > 0
  const branchAhead = state.upstream.kind === 'tracked' && state.upstream.ahead > 0
  return {
    commit: state.status === 'ok' && hasChanges,
    'commit-and-push': hasChanges || branchAhead
  }
}

function getConflictFiles(state: GitReviewState | null): GitFileDiff[] {
  if (!state || state.status !== 'ok') return []
  return state.files.filter((file) => file.kind === 'conflicted')
}

function buildResolveConflictsPrompt(context: GitContext): string {
  const repositoryLabel = getRepositoryPromptLabel(context)
  const capabilityLabel =
    context.kind === 'knowledge-base'
      ? 'the approved Knowledge Base Git Workspace Tools'
      : 'your existing managed-worktree project capabilities'
  return [
    `Please inspect the fresh Git state in ${repositoryLabel} and resolve the unresolved Git conflicts.`,
    `Do not rely on the rendered diff in Space Zero and do not use any diff payload from this request; inspect fresh Git status and diff information in ${repositoryLabel} before acting.`,
    `Handle the complete conflict resolution workflow using ${capabilityLabel}: inspect conflicted files, edit resolutions, run appropriate validation, and report the final Git status in the normal Session transcript.`,
    'Do not commit or push unless I explicitly ask for that after the conflicts are resolved.'
  ].join('\n\n')
}

function buildGitActionPrompt(
  action: GitComposerAction,
  instructions: string,
  upstream: GitUpstreamState,
  context: GitContext
): string {
  const trimmedInstructions = instructions.trim()
  const repositoryLabel = getRepositoryPromptLabel(context)
  const lines = [
    action === 'commit'
      ? `Please inspect the current Git state in ${repositoryLabel} and create an appropriate commit for the saved repository changes.`
      : `Please inspect the current Git state in ${repositoryLabel}, create an appropriate commit for saved repository changes if needed, and push the branch.`,
    `Do not rely on the rendered diff in Space Zero and do not use any diff payload from this request; inspect fresh Git status and diff information in ${repositoryLabel} before acting.`
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

function getRepositoryPromptLabel(context: GitContext): string {
  return context.kind === 'knowledge-base'
    ? 'the verified Knowledge Base repository'
    : 'this Project Session managed worktree'
}

function formatActionLabel(action: GitComposerAction): string {
  return action === 'commit' ? 'Commit' : 'Commit & Push'
}
