import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useOptionalAppearance } from '@renderer/appearance-provider'
import { DiffViewer } from '@renderer/components/diff-viewer'
import { Button } from '@renderer/components/ui/button'
import type { KnowledgeBaseChatContext } from '../../../knowledge-base/shared'
import type { ProjectSessionChatContext } from '../../../sessions/shared'

import { useAgentSession } from '../../../agent-workspace/renderer'
import {
  FilesDiffsEditor,
  type FilesSourceEditorState
} from '../../../files/renderer/components/files-diffs-editor'
import { createFilesDocumentCacheKey } from '../../../files/renderer/lib/files-document-identity'
import { useFilesStore, type FilesWorkingDocumentState } from '../../../files/renderer/files-store'
import { KNOWLEDGE_BASE_FILES_CONTEXT_KEY, type FilesContext } from '../../../files/shared'
import type { GitComposerAction } from '../../../../shared/git-action-settings'
import type {
  GitChangeFilter,
  GitContext,
  GitFileDiff,
  GitReviewState,
  GitUpstreamState
} from '../../shared'
import { GitToolView, type GitToolViewProps } from './git-tool-view'

const OBSERVATION_REFRESH_DELAY_MS = 150
const MAX_OBSERVATION_DIAGNOSTIC_LENGTH = 512
const KNOWLEDGE_BASE_CHAT_CONTEXT_CHANGED_EVENT = 'spacezero:knowledge-base-chat-context-changed'
const PROJECT_SESSION_CHAT_CONTEXT_CHANGED_EVENT = 'spacezero:project-session-chat-context-changed'

type GitViewMemory = {
  filter: GitChangeFilter
  expandedPaths: Set<string>
  collapsedPaths: Set<string>
  instructions: string
  scrollTop: number
  diffViewStates: Map<string, FilesSourceEditorState>
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
    scrollTop: 0,
    diffViewStates: new Map()
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
  if (gitContext.kind === 'project-home') {
    return <GitToolSession context={gitContext} filesHandoff={filesHandoff} />
  }
  if (gitContext.kind === 'project-session') {
    return (
      <ProjectGitTool key={gitContext.sessionId} context={gitContext} filesHandoff={filesHandoff} />
    )
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
      const chatContext = await window.spacezero.knowledgeBase.getCurrentChatContext()
      if (!canceled && requestId === sessionLookupSequence.current) {
        setSessionId(chatContext.agentSession.id)
      }
    }
    const onFocus = (): void => {
      void loadCurrentSession()
    }
    const onSessionChanged = (event: Event): void => {
      const detail = (event as CustomEvent<KnowledgeBaseChatContext>).detail
      if (detail?.agentSession.id) {
        sessionLookupSequence.current += 1
        setSessionId(detail.agentSession.id)
      } else void loadCurrentSession()
    }
    void loadCurrentSession()
    window.addEventListener(KNOWLEDGE_BASE_CHAT_CONTEXT_CHANGED_EVENT, onSessionChanged)
    window.addEventListener('focus', onFocus)
    return () => {
      canceled = true
      window.removeEventListener(KNOWLEDGE_BASE_CHAT_CONTEXT_CHANGED_EVENT, onSessionChanged)
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
  const [resolvedAgentSession, setResolvedAgentSession] = useState<{
    workspaceContextSessionId: string
    agentSessionId: string
  }>()
  const sessionLookupSequence = useRef(0)
  const agentSessionId =
    resolvedAgentSession?.workspaceContextSessionId === context.sessionId
      ? resolvedAgentSession.agentSessionId
      : undefined

  useEffect(() => {
    let canceled = false
    const loadCurrentSession = async (): Promise<void> => {
      const requestId = (sessionLookupSequence.current += 1)
      const chatContext = await window.spacezero.sessions.getCurrentProjectChatContext({
        sessionId: context.sessionId
      })
      if (!canceled && requestId === sessionLookupSequence.current) {
        setResolvedAgentSession({
          workspaceContextSessionId: context.sessionId,
          agentSessionId: chatContext.agentSessionId
        })
      }
    }
    const onFocus = (): void => {
      void loadCurrentSession()
    }
    const onSessionChanged = (event: Event): void => {
      const detail = (event as CustomEvent<ProjectSessionChatContext>).detail
      if (
        detail?.workspaceContext.projectSessionId === context.sessionId &&
        detail.agentSessionId
      ) {
        sessionLookupSequence.current += 1
        setResolvedAgentSession({
          workspaceContextSessionId: context.sessionId,
          agentSessionId: detail.agentSessionId
        })
      } else void loadCurrentSession()
    }
    void loadCurrentSession()
    window.addEventListener(PROJECT_SESSION_CHAT_CONTEXT_CHANGED_EVENT, onSessionChanged)
    window.addEventListener('focus', onFocus)
    return () => {
      canceled = true
      window.removeEventListener(PROJECT_SESSION_CHAT_CONTEXT_CHANGED_EVENT, onSessionChanged)
      window.removeEventListener('focus', onFocus)
    }
  }, [context.sessionId])

  if (!agentSessionId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Restoring Project Session chat…
      </div>
    )
  }

  return (
    <ProjectGitToolSession
      key={`session:${context.sessionId}:${agentSessionId}`}
      agentSessionId={agentSessionId}
      context={context}
      filesHandoff={filesHandoff}
    />
  )
}

function ProjectGitToolSession({
  agentSessionId,
  context,
  filesHandoff
}: {
  agentSessionId: string
  context: Extract<GitContext, { kind: 'project-session' }>
  filesHandoff?: GitFilesHandoff
}): React.JSX.Element {
  const agentSession = useAgentSession(agentSessionId)
  return (
    <GitToolSession agentSession={agentSession} context={context} filesHandoff={filesHandoff} />
  )
}

function getGitContextMemoryKey(context: GitContext): string {
  if (context.kind === 'knowledge-base') return context.contextKey
  if (context.kind === 'project-home') return `project:${context.projectId}`
  return `session:${context.sessionId}`
}

function getGitFilesContext(context: GitContext): {
  contextKey: string
  ipcContext: FilesContext
} {
  if (context.kind === 'project-home') {
    return {
      contextKey: `project:${context.projectId}`,
      ipcContext: { kind: 'project-home', projectId: context.projectId }
    }
  }
  if (context.kind === 'project-session') {
    return {
      contextKey: context.sessionId,
      ipcContext: { kind: 'project-session', sessionId: context.sessionId }
    }
  }
  return {
    contextKey: context.contextKey,
    ipcContext: {
      kind: 'knowledge-base',
      contextKey: KNOWLEDGE_BASE_FILES_CONTEXT_KEY
    }
  }
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
  const filesContext = useMemo(() => getGitFilesContext(context), [context])
  const filesState = useFilesStore((store) => store.contexts[filesContext.contextKey])
  const initialMemory = useMemo(() => getGitViewMemory(gitMemoryKey), [gitMemoryKey])
  const [filter, setFilterState] = useState<GitChangeFilter>(initialMemory.filter)
  const [state, setState] = useState<GitReviewState | null>(null)
  const [actionState, setActionState] = useState<GitReviewState | null>(null)
  const [expandedPaths, setExpandedPathsState] = useState<Set<string>>(
    () => new Set(initialMemory.expandedPaths)
  )
  const [primaryActionState, setPrimaryActionState] = useState<
    { status: 'loading' } | { status: 'ready'; action: GitComposerAction }
  >({ status: 'loading' })
  const [instructions, setInstructionsState] = useState(initialMemory.instructions)
  const [watchDiagnostic, setWatchDiagnostic] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [handoffError, setHandoffError] = useState<string | null>(null)
  const refreshSequence = useRef(0)
  const refreshInFlight = useRef(false)
  const queuedRefresh = useRef<{ showLoading: boolean } | null>(null)
  const refreshRef = useRef<
    (({ showLoading }?: { showLoading?: boolean }) => Promise<void>) | null
  >(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const gitPromptRunPending = useRef(false)
  const hasAgentSession = Boolean(agentSession)
  const currentAgentStatus = agentSession?.status ?? 'idle'
  const previousAgentStatus = useRef(currentAgentStatus)

  useEffect(() => {
    let active = true
    void window.spacezero.settings
      .getGitActionSettings()
      .then((settings) => {
        if (!active) return
        setPrimaryActionState({
          status: 'ready',
          action: isComposerActionSupported(context.kind, settings.primaryGitAction)
            ? settings.primaryGitAction
            : 'commit-and-push'
        })
      })
      .catch(() => {
        if (active) {
          setPrimaryActionState({ status: 'ready', action: 'commit-and-push' })
        }
      })
    return () => {
      active = false
    }
  }, [context.kind])

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
      if (refreshInFlight.current) {
        refreshSequence.current += 1
        queuedRefresh.current = {
          showLoading: queuedRefresh.current?.showLoading === true || showLoading
        }
        if (showLoading) {
          setState(null)
          setActionState(null)
        }
        return
      }

      refreshInFlight.current = true
      setIsRefreshing(true)
      const requestId = (refreshSequence.current += 1)
      try {
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
      } finally {
        refreshInFlight.current = false
        const nextRefresh = queuedRefresh.current
        queuedRefresh.current = null
        if (nextRefresh) {
          void refreshRef.current?.(nextRefresh)
        } else {
          setIsRefreshing(false)
        }
      }
    },
    [context, filter, gitMemoryKey, hasAgentSession, setExpandedPaths]
  )

  useLayoutEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh({ showLoading: true })
    }, 0)
    return () => clearTimeout(timer)
  }, [refresh])

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

  const composerActions = useMemo(() => getComposerActions(context.kind), [context.kind])
  const actions = useMemo(
    () => getActionAvailability(actionState, context.kind),
    [actionState, context.kind]
  )
  const conflictFiles = useMemo(() => getConflictFiles(actionState), [actionState])
  const reviewFiles = useMemo(() => (state?.status === 'ok' ? state.files : []), [state])
  const workingDocuments = useMemo(() => {
    const documents = new Map<string, FilesWorkingDocumentState>()
    for (const tab of filesState?.tabs ?? []) {
      if (tab.status === 'ready') documents.set(tab.relativePath, tab)
    }
    for (const document of Object.values(filesState?.detachedDocuments ?? {})) {
      documents.set(document.relativePath, document)
    }
    return documents
  }, [filesState])
  const ordinaryEditablePaths = useMemo(
    () =>
      new Set(
        reviewFiles.filter((file) => isGitFileEditable(file, filter)).map((file) => file.path)
      ),
    [filter, reviewFiles]
  )
  const pendingDocuments = useMemo(
    () =>
      Object.values(filesState?.detachedDocuments ?? {}).filter(
        (document) =>
          document.dirty &&
          (!ordinaryEditablePaths.has(document.relativePath) || Boolean(document.externalStatus))
      ),
    [filesState?.detachedDocuments, ordinaryEditablePaths]
  )
  const hasConflicts = conflictFiles.length > 0
  const busy = currentAgentStatus === 'running'
  const primaryAction =
    primaryActionState.status === 'ready' ? primaryActionState.action : 'commit-and-push'
  const actionsReady = primaryActionState.status === 'ready'
  const primaryDisabled = !actionsReady || busy || !actions[primaryAction]
  const resolveDisabled = busy || !hasConflicts

  const footer: GitToolViewProps['footer'] =
    agentSession && state && (state.status === 'ok' || state.status === 'clean')
      ? hasConflicts
        ? {
            kind: 'conflict',
            disabled: resolveDisabled,
            instructions,
            onInstructionsChange: setInstructions,
            onResolve: () => {
              gitPromptRunPending.current = true
              void agentSession.prompt(buildResolveConflictsPrompt(context))
            }
          }
        : {
            kind: 'commit',
            actionAvailability: actions,
            actions: composerActions,
            actionsReady,
            busy,
            instructions,
            menuOpen,
            primaryAction,
            primaryDisabled,
            onInstructionsChange: setInstructions,
            onMenuOpenChange: setMenuOpen,
            onPrimaryActionChange: (action) => {
              setMenuOpen(false)
              if (actionsReady && actions[action]) {
                setPrimaryActionState({ status: 'ready', action })
              }
            },
            onSubmit: (action) => {
              setMenuOpen(false)
              if (!actionsReady || !actions[action]) return
              gitPromptRunPending.current = true
              void agentSession.prompt(
                buildGitActionPrompt(action, instructions, state.upstream, context)
              )
            }
          }
      : null

  const pendingEdits =
    pendingDocuments.length > 0 ? (
      <section className="space-y-2" aria-label="Pending edits">
        <h3 className="text-sm font-semibold">Pending edits</h3>
        <p className="text-xs text-muted-foreground">
          Unsaved diff edits remain recoverable even though the selected Git view no longer shows
          their ordinary diff.
        </p>
        {pendingDocuments.map((document) => (
          <PendingGitEdit
            key={document.relativePath}
            contextKey={filesContext.contextKey}
            document={document}
            initialState={
              initialMemory.diffViewStates.get(`${filter}:${document.relativePath}`) ?? {
                view: { scrollLeft: 0, scrollTop: 0 }
              }
            }
            onStateChange={(viewState) =>
              initialMemory.diffViewStates.set(`${filter}:${document.relativePath}`, viewState)
            }
          />
        ))}
      </section>
    ) : undefined

  const toggleFile = (file: GitFileDiff): void => {
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

  return (
    <GitToolView
      changedFilesContainerRef={scrollContainerRef}
      conflictCount={conflictFiles.length}
      expandedPaths={expandedPaths}
      filter={filter}
      footer={footer}
      handoffError={handoffError}
      isRefreshing={isRefreshing}
      pendingEdits={pendingEdits}
      renderFile={(file, expanded) => (
        <GitDiffCard
          key={`${file.oldPath ?? ''}:${file.path}`}
          expanded={expanded}
          file={file}
          filesContext={filesContext}
          filesHandoff={filesHandoff}
          filter={filter}
          initialState={
            initialMemory.diffViewStates.get(`${filter}:${file.path}`) ?? {
              view: { scrollLeft: 0, scrollTop: 0 }
            }
          }
          workingDocument={workingDocuments.get(file.path)}
          onHandoffError={setHandoffError}
          onStateChange={(viewState) =>
            initialMemory.diffViewStates.set(`${filter}:${file.path}`, viewState)
          }
          onToggle={() => toggleFile(file)}
        />
      )}
      state={state}
      watchDiagnostic={watchDiagnostic}
      onChangedFilesScroll={(scrollTop) => {
        getGitViewMemory(gitMemoryKey).scrollTop = scrollTop
      }}
      onFilterChange={setFilter}
      onRefresh={() => void refresh()}
      onToggleFile={toggleFile}
    />
  )
}

function GitDiffCard({
  file,
  expanded,
  filesContext,
  filesHandoff,
  filter,
  initialState,
  workingDocument,
  onHandoffError,
  onStateChange,
  onToggle
}: {
  file: GitFileDiff
  expanded: boolean
  filesContext: { contextKey: string; ipcContext: FilesContext }
  filesHandoff?: GitFilesHandoff
  filter: GitChangeFilter
  initialState: FilesSourceEditorState
  workingDocument?: FilesWorkingDocumentState
  onHandoffError: (message: string | null) => void
  onStateChange: (state: FilesSourceEditorState) => void
  onToggle: () => void
}): React.JSX.Element {
  const documentLoadAttempted = useRef<string | null>(null)
  const [documentUnavailable, setDocumentUnavailable] = useState(false)
  const editable = isGitFileEditable(file, filter)
  const documentLoadKey = `${filter}:${file.diff ?? ''}`
  const richModeBlocked =
    Boolean(workingDocument?.editorMode === 'rich') && isMarkdownDocumentPath(file.path)
  const externalConflict = Boolean(workingDocument?.externalStatus)

  useEffect(() => {
    if (!editable || documentLoadAttempted.current === documentLoadKey) return
    let canceled = false
    documentLoadAttempted.current = documentLoadKey
    void window.spacezero.files
      .openDocument({ context: filesContext.ipcContext, relativePath: file.path })
      .then((document) => {
        if (canceled) return
        if (document.contentKind !== 'text') {
          setDocumentUnavailable(true)
          return
        }
        useFilesStore.getState().ensureWorkingDocument(filesContext.contextKey, document)
        setDocumentUnavailable(false)
      })
      .catch(() => {
        if (!canceled) setDocumentUnavailable(true)
      })
    return () => {
      canceled = true
    }
  }, [
    documentLoadKey,
    editable,
    file.path,
    filesContext.contextKey,
    filesContext.ipcContext,
    workingDocument
  ])
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
  const hasRenderableTextDiff = Boolean(file.diff && !file.binary && !file.large)

  if (hasRenderableTextDiff) {
    const diffViewer = (
      <DiffViewer
        ariaLabel={`Diff for ${file.path}`}
        items={[
          {
            id: `${file.oldPath ?? ''}:${file.path}`,
            path: file.path,
            oldPath: file.oldPath,
            patch: file.diff!,
            collapsed: !expanded,
            headerActions: {
              status: file.kind,
              fileNameTitle: filesHandoffUnavailableMessage(file, filesHandoff),
              onFileNameClick: canOpenInFiles ? () => void openInFiles() : undefined,
              onToggle
            },
            editable:
              editable && workingDocument && !richModeBlocked && !externalConflict
                ? {
                    cacheKey: createFilesDocumentCacheKey(
                      filesContext.contextKey,
                      file.path,
                      workingDocument.editorStateKey
                    ),
                    contextKey: filesContext.contextKey,
                    value: workingDocument.draft,
                    baselineValue: workingDocument.content,
                    initialState,
                    onChange: (draft) =>
                      useFilesStore
                        .getState()
                        .updateWorkingDocumentDraft(filesContext.contextKey, file.path, draft),
                    onStateChange
                  }
                : undefined
          }
        ]}
      />
    )
    if (editable && documentUnavailable) {
      return (
        <section className="space-y-2">
          {diffViewer}
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            This working document could not be opened for safe diff editing.
          </p>
        </section>
      )
    }
    if (!richModeBlocked) return diffViewer
    return (
      <section className="space-y-2">
        {diffViewer}
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800">
          <span>
            Diff editing is unavailable while this Markdown file uses Rich mode. Save and switch the
            Files tab to Source first.
          </span>
          <Button
            disabled={!canOpenInFiles}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void openInFiles()}
          >
            Focus {file.path} in Files
          </Button>
        </div>
      </section>
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

function PendingGitEdit({
  contextKey,
  document,
  initialState,
  onStateChange
}: {
  contextKey: string
  document: FilesWorkingDocumentState
  initialState: FilesSourceEditorState
  onStateChange: (state: FilesSourceEditorState) => void
}): React.JSX.Element {
  const appearance = useOptionalAppearance()
  return (
    <article
      aria-label={`Pending edit ${document.relativePath}`}
      className="overflow-hidden rounded-lg border bg-card"
    >
      <header className="border-b px-3 py-2 text-sm font-medium">{document.relativePath}</header>
      {document.error ? (
        <p className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {document.error}
        </p>
      ) : null}
      <div className="h-56 min-h-0">
        <FilesDiffsEditor
          cacheKey={createFilesDocumentCacheKey(
            contextKey,
            document.relativePath,
            document.editorStateKey
          )}
          contextKey={contextKey}
          fileName={document.relativePath}
          initialState={initialState}
          theme={appearance?.resolvedTheme ?? (getDocumentTheme() === 'light' ? 'light' : 'dark')}
          value={document.draft}
          onChange={(draft) =>
            useFilesStore
              .getState()
              .updateWorkingDocumentDraft(contextKey, document.relativePath, draft)
          }
          onSave={() => undefined}
          onStateChange={onStateChange}
        />
      </div>
    </article>
  )
}

function isGitFileEditable(file: GitFileDiff, filter: GitChangeFilter): boolean {
  return (
    filter !== 'staged' &&
    file.kind !== 'deleted' &&
    file.kind !== 'conflicted' &&
    Boolean(file.diff) &&
    !file.binary &&
    !file.large
  )
}

function isMarkdownDocumentPath(relativePath: string): boolean {
  const lowerPath = relativePath.toLowerCase()
  return lowerPath.endsWith('.md') || lowerPath.endsWith('.mdx')
}

function getDocumentTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

const PROJECT_COMPOSER_ACTIONS: GitComposerAction[] = [
  'commit-and-push',
  'commit-and-create-pr',
  'commit'
]
const KNOWLEDGE_BASE_COMPOSER_ACTIONS: GitComposerAction[] = ['commit-and-push', 'commit']

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

function getComposerActions(contextKind: GitContext['kind']): GitComposerAction[] {
  return contextKind === 'project-session'
    ? PROJECT_COMPOSER_ACTIONS
    : KNOWLEDGE_BASE_COMPOSER_ACTIONS
}

function isComposerActionSupported(
  contextKind: GitContext['kind'],
  action: GitComposerAction
): boolean {
  return getComposerActions(contextKind).includes(action)
}

function getActionAvailability(
  state: GitReviewState | null,
  contextKind: GitContext['kind']
): Record<GitComposerAction, boolean> {
  if (
    !state ||
    state.status === 'missing-worktree' ||
    state.status === 'inaccessible' ||
    state.status === 'git-error'
  ) {
    return { commit: false, 'commit-and-push': false, 'commit-and-create-pr': false }
  }

  if (getConflictFiles(state).length > 0) {
    return { commit: false, 'commit-and-push': false, 'commit-and-create-pr': false }
  }

  const hasChanges = state.files.length > 0
  const branchAhead = state.upstream.kind === 'tracked' && state.upstream.ahead > 0
  return {
    commit: state.status === 'ok' && hasChanges,
    'commit-and-push': hasChanges || branchAhead,
    'commit-and-create-pr': contextKind === 'project-session' && (hasChanges || branchAhead)
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
      : action === 'commit-and-create-pr'
        ? `Please inspect the current Git state in ${repositoryLabel}, create an appropriate commit for saved repository changes if needed, push the branch, and create a pull request.`
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

  if (action !== 'commit') {
    lines.push(
      upstream.kind === 'none'
        ? 'No upstream is currently configured in Space Zero Git status; if a remote named origin exists, commit locally if appropriate, then push the current branch with upstream tracking using `git push -u origin HEAD`. If no origin remote exists or pushing fails because the destination is ambiguous or unauthorized, explain the issue and ask me for the required remote or upstream information.'
        : 'If pushing cannot proceed, explain the blocker in the normal Session transcript and ask me for the required information.'
    )
  }

  if (action === 'commit-and-create-pr') {
    lines.push(
      'After the push succeeds, resolve the pushed commit with `git rev-parse HEAD`, then call the `github.createOrReusePullRequest` Space Zero Workspace Tool. That narrow main-owned capability revalidates GitHub App repository access and creates or reuses the pull request without exposing credentials to this Session. Do not use `gh`, a GitHub token, or another GitHub API path.'
    )
    lines.push(
      'Your final response must include the usable pull request URL. If the push succeeds but pull request creation fails, state clearly that the branch was pushed, report the pull request creation failure and its actionable cause, and do not claim the workflow completed.'
    )
  }

  return lines.join('\n\n')
}

function getRepositoryPromptLabel(context: GitContext): string {
  return context.kind === 'knowledge-base'
    ? 'the verified Knowledge Base repository'
    : 'this Project Session managed worktree'
}
