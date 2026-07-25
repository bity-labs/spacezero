import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { isAbsolute as isPosixAbsolute } from 'node:path/posix'
import { isAbsolute as isWin32Absolute } from 'node:path/win32'

import type {
  TerminalCloseRequest,
  TerminalCreateRequest,
  TerminalCreateResult,
  TerminalDiagnostic,
  TerminalEvent,
  TerminalListTabsRequest,
  TerminalResizeRequest,
  TerminalReorderTabsRequest,
  TerminalSelectTabRequest,
  TerminalSubscribeRequest,
  TerminalSubscribeResult,
  TerminalTabsSnapshot,
  TerminalUnsubscribeRequest,
  TerminalWriteInputRequest
} from '../shared'

export type TerminalRepository = {
  findSessionById: (sessionId: string) => Promise<
    | {
        id: string
        kind?: 'project' | 'workspace'
        projectId: string | null
        worktreePath?: string | null
        worktreeBranch?: string | null
        worktreeBaseRevision?: string | null
        archivedAt?: Date | null
        managedContext?: 'knowledge-base' | null
      }
    | undefined
  >
  findProjectById: (
    projectId: string
  ) => Promise<{ id: string; path: string; archivedAt?: Date | null } | undefined>
}

export type TerminalTabsRepository = {
  listByContext: (context: TerminalCreateRequest['context']) => Promise<PersistedTerminalTab[]>
  upsert: (tab: PersistedTerminalTab) => Promise<void>
  replaceContext: (
    context: TerminalCreateRequest['context'],
    tabs: PersistedTerminalTab[]
  ) => Promise<void>
  updateOrderAndActive: (
    context: TerminalCreateRequest['context'],
    orderedTabIds: string[],
    activeTabId: string | null
  ) => Promise<void>
  updateCwdAndTitle: (
    context: TerminalCreateRequest['context'],
    tabId: string,
    cwd: string,
    title: string
  ) => Promise<void>
  deleteTab: (context: TerminalCreateRequest['context'], tabId: string) => Promise<void>
  deleteContext: (context: TerminalCreateRequest['context']) => Promise<void>
}

export type PersistedTerminalTab = {
  tabId: string
  context: TerminalCreateRequest['context']
  order: number
  title: string
  active: boolean
  cwd: string
}

export type TerminalStorageSettingsProvider = {
  getSpaceZeroHome: () => Promise<string>
}

export type TerminalKnowledgeBaseRootProvider = {
  getVerifiedRoot: () => Promise<string>
}

export type TerminalWorktreeValidator = {
  validate: (request: {
    projectPath: string
    projectId: string
    sessionId: string
    worktree: { path: string; branch: string; baseRevision: string }
  }) => Promise<boolean>
}

export type PtyProcess = {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => Promise<void>
  onData: (listener: (data: string) => void) => () => void
  onExit: (
    listener: (event: { exitCode: number | null; signal?: number | string | null }) => void
  ) => () => void
}

export type TerminalPtyAdapter = {
  spawn: (request: {
    shell: string
    args: string[]
    cwd: string
    cols: number
    rows: number
    env: NodeJS.ProcessEnv
  }) => Promise<PtyProcess>
}

export type TerminalShell = {
  executable: string
  args: string[]
  env?: NodeJS.ProcessEnv
  integrationDir?: string
}

const OSC7_PREFIX = `${String.fromCharCode(27)}]7;`
const BEL = String.fromCharCode(7)
const ST = `${String.fromCharCode(27)}\\`
const MAX_PARTIAL_CWD_REPORT_BYTES = 4096

type ShellIntegrationFileWriter = (
  file: string,
  data: string,
  encoding: BufferEncoding
) => Promise<void>

type TerminalRecord = {
  id: string
  ownerWindowId: number
  context: TerminalCreateRequest['context']
  pty: PtyProcess
  shellTitle: string
  title: string
  restorationTabId: string
  currentWorkingDirectory: string | null
  latestCwdReportOrdinal: number
  cwdReportBuffer: string
  output: RetainedOutput
  subscribed: boolean
  subscriptionGeneration: number
  operationQueue: Promise<void>
  dispose: Array<() => void>
  integrationDir?: string
  serviceShutdown?: { markEmpty: boolean }
}

type TerminalContextState = {
  terminalIds: string[]
  activeTerminalId: string | null
}

type InFlightCreate = {
  context: TerminalCreateRequest['context']
  promise: Promise<TerminalCreateResult>
}

type RetainedOutputChunk = {
  sequence: number
  data: string
  bytes: number
  lines: number
}

type RetainedOutput = {
  chunks: RetainedOutputChunk[]
  nextSequence: number
  totalBytes: number
  totalLines: number
}

type TrackedShutdown = {
  run: () => Promise<void>
  promise?: Promise<void>
}

const DEFAULT_MAX_RETAINED_LINES = 10_000
const DEFAULT_MAX_RETAINED_BYTES = 5 * 1024 * 1024

export function createTerminalService({
  repository,
  worktrees,
  storageSettings,
  knowledgeBaseRoot,
  pty,
  tabsRepository = createMemoryTerminalTabsRepository(),
  createId = randomUUID,
  resolveShell = resolveDefaultShell,
  emitToWindow,
  maxRetainedLines = DEFAULT_MAX_RETAINED_LINES,
  maxRetainedBytes = DEFAULT_MAX_RETAINED_BYTES,
  enableShellIntegration = false,
  writeShellIntegrationFile = writeFile
}: {
  repository: TerminalRepository
  worktrees: TerminalWorktreeValidator
  storageSettings: TerminalStorageSettingsProvider
  knowledgeBaseRoot: TerminalKnowledgeBaseRootProvider
  pty: TerminalPtyAdapter
  tabsRepository?: TerminalTabsRepository
  createId?: () => string
  resolveShell?: () => TerminalShell
  emitToWindow: (windowId: number, event: TerminalEvent) => void
  maxRetainedLines?: number
  maxRetainedBytes?: number
  enableShellIntegration?: boolean
  writeShellIntegrationFile?: ShellIntegrationFileWriter
}) {
  const terminals = new Map<string, TerminalRecord>()
  const contexts = new Map<string, TerminalContextState>()
  const emptyContexts = new Set<string>()
  const deletingContexts = new Set<string>()
  const inFlightCreates = new Map<string, InFlightCreate>()
  const createPromisesByContext = new Map<string, Set<Promise<TerminalCreateResult>>>()
  const shutdownsByContext = new Map<string, Set<TrackedShutdown>>()
  const terminalShutdownsById = new Map<string, { key: string; shutdown: TrackedShutdown }>()
  const persistenceQueueByContext = new Map<string, Promise<void>>()
  const isContextDeleting = (context: TerminalCreateRequest['context']) =>
    deletingContexts.has(deletionContextKey(context))

  async function create({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalCreateRequest
  }): Promise<TerminalCreateResult> {
    if (isContextDeleting(request.context)) throw new Error('terminal.contextDeleting')

    const key = contextKey(ownerWindowId, request.context)
    const existing = getActiveTerminal(ownerWindowId, request.context)
    if (existing && !request.forceNew) {
      await assertContextOwnerActive(request.context)
      if (isContextDeleting(request.context)) throw new Error('terminal.contextDeleting')
      return {
        status: 'running',
        terminalId: existing.id,
        ...snapshot(ownerWindowId, request.context)
      }
    }

    if (!request.forceNew && emptyContexts.has(key)) {
      await assertContextOwnerActive(request.context)
      return { status: 'empty', terminalId: null, ...snapshot(ownerWindowId, request.context) }
    }

    if (request.forceNew) {
      return trackCreate(request.context, createFreshTerminal({ ownerWindowId, request }))
    }

    const inFlight = inFlightCreates.get(key)
    if (inFlight) return inFlight.promise

    const createPromise = trackCreate(
      request.context,
      restoreOrCreateFreshTerminal({ ownerWindowId, request })
    ).finally(() => {
      inFlightCreates.delete(key)
    })
    inFlightCreates.set(key, { context: request.context, promise: createPromise })
    return createPromise
  }

  async function restoreOrCreateFreshTerminal({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalCreateRequest
  }): Promise<TerminalCreateResult> {
    return (
      (await restorePersistedTerminals({ ownerWindowId, request })) ??
      createFreshTerminal({ ownerWindowId, request })
    )
  }

  async function createFreshTerminal({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalCreateRequest
  }): Promise<TerminalCreateResult> {
    const cwd = await resolveInitialCwd(request.context)
    if (isContextDeleting(request.context)) throw new Error('terminal.contextDeleting')

    const shell = enableShellIntegration
      ? await withCwdShellIntegration(resolveShell(), writeShellIntegrationFile)
      : resolveShell()
    const id = createId()
    let process: PtyProcess
    try {
      process = await pty.spawn({
        shell: shell.executable,
        args: shell.args,
        cwd,
        cols: request.cols ?? 80,
        rows: request.rows ?? 24,
        env: { ...processEnv(), ...shell.env }
      })
    } catch (error) {
      await cleanupShellIntegration(shell.integrationDir)
      throw new Error(
        `terminal.shellLaunchFailed: ${error instanceof Error ? error.message : 'unknown error'}`,
        { cause: error }
      )
    }

    if (isContextDeleting(request.context)) {
      await trackContextShutdown(request.context, async () => {
        try {
          await process.kill()
        } finally {
          await cleanupShellIntegration(shell.integrationDir)
        }
      })
      throw new Error('terminal.contextDeleting')
    }

    const shellTitle = shellName(shell.executable)
    const record: TerminalRecord = {
      id,
      ownerWindowId,
      context: request.context,
      pty: process,
      shellTitle,
      title: cwdTitle(cwd, shellTitle),
      restorationTabId: createId(),
      currentWorkingDirectory: cwd,
      latestCwdReportOrdinal: 0,
      cwdReportBuffer: '',
      output: { chunks: [], nextSequence: 1, totalBytes: 0, totalLines: 0 },
      subscribed: false,
      subscriptionGeneration: 0,
      operationQueue: Promise.resolve(),
      dispose: [],
      integrationDir: shell.integrationDir
    }
    record.dispose.push(
      process.onData((data) => retainAndEmit(record, data)),
      process.onExit((event) => removeExitedTerminal(record, event))
    )
    terminals.set(id, record)
    setActiveTerminal(ownerWindowId, request.context, id)
    emptyContexts.delete(contextKey(ownerWindowId, request.context))
    await persistContext(ownerWindowId, request.context)
    return { status: 'running', terminalId: id, ...snapshot(ownerWindowId, request.context) }
  }

  async function restorePersistedTerminals({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalCreateRequest
  }): Promise<TerminalCreateResult | null> {
    const persistedTabs = await tabsRepository.listByContext(request.context)
    if (persistedTabs.length === 0) return null
    await assertContextOwnerActive(request.context)
    if (isContextDeleting(request.context)) throw new Error('terminal.contextDeleting')

    const restoredRecords: TerminalRecord[] = []
    const diagnostics: TerminalDiagnostic[] = []
    const key = contextKey(ownerWindowId, request.context)
    try {
      for (const persisted of persistedTabs.sort((left, right) => left.order - right.order)) {
        const fallbackCwd = await resolveInitialCwd(request.context)
        const restoredCwd = await resolveRestoredCwd(persisted.cwd, fallbackCwd)
        const shell = enableShellIntegration
          ? await withCwdShellIntegration(resolveShell(), writeShellIntegrationFile)
          : resolveShell()
        const id = createId()
        let process: PtyProcess
        try {
          process = await pty.spawn({
            shell: shell.executable,
            args: shell.args,
            cwd: restoredCwd.cwd,
            cols: request.cols ?? 80,
            rows: request.rows ?? 24,
            env: { ...processEnv(), ...shell.env }
          })
        } catch (error) {
          await cleanupShellIntegration(shell.integrationDir)
          throw error
        }
        const shellTitle = shellName(shell.executable)
        const record: TerminalRecord = {
          id,
          ownerWindowId,
          context: request.context,
          pty: process,
          shellTitle,
          title: cwdTitle(restoredCwd.cwd, shellTitle),
          restorationTabId: persisted.tabId,
          currentWorkingDirectory: restoredCwd.cwd,
          latestCwdReportOrdinal: 0,
          cwdReportBuffer: '',
          output: { chunks: [], nextSequence: 1, totalBytes: 0, totalLines: 0 },
          subscribed: false,
          subscriptionGeneration: 0,
          operationQueue: Promise.resolve(),
          dispose: [],
          integrationDir: shell.integrationDir
        }
        if (restoredCwd.fellBack) {
          diagnostics.push({
            type: 'cwd-fallback',
            terminalId: id,
            savedCwd: persisted.cwd,
            cwd: restoredCwd.cwd,
            message: `Restored terminal cwd was unavailable; using ${restoredCwd.cwd}.`
          })
        }
        record.dispose.push(
          process.onData((data) => retainAndEmit(record, data)),
          process.onExit((event) => removeExitedTerminal(record, event))
        )
        terminals.set(id, record)
        restoredRecords.push(record)
        const state = contexts.get(key) ?? { terminalIds: [], activeTerminalId: null }
        state.terminalIds.push(id)
        if (persisted.active) state.activeTerminalId = id
        contexts.set(key, state)
      }
      const state = contexts.get(key)
      if (state && !state.activeTerminalId) state.activeTerminalId = state.terminalIds[0] ?? null
      emptyContexts.delete(key)
      await persistContext(ownerWindowId, request.context)
      const restoredSnapshot = snapshot(ownerWindowId, request.context)
      const activeTerminalId = restoredSnapshot.activeTerminalId
      return {
        status: 'running',
        terminalId: activeTerminalId ?? '',
        ...restoredSnapshot,
        diagnostics
      }
    } catch (error) {
      try {
        await rollbackRestoredTerminals({
          key,
          context: request.context,
          restoredRecords
        })
      } catch {
        // Rollback cleanup is best-effort; surface the original restoration failure.
      }
      throw error
    }
  }

  async function listTabs({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalListTabsRequest
  }): Promise<TerminalTabsSnapshot> {
    await assertContextOwnerActive(request.context)
    return snapshot(ownerWindowId, request.context)
  }

  async function selectTab({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalSelectTabRequest
  }): Promise<TerminalTabsSnapshot> {
    const terminal = requireLiveTerminal(ownerWindowId, request.terminalId, request.context)
    setActiveTerminal(ownerWindowId, request.context, terminal.id)
    await persistContext(ownerWindowId, request.context)
    return snapshot(ownerWindowId, request.context)
  }

  async function reorderTabs({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalReorderTabsRequest
  }): Promise<TerminalTabsSnapshot> {
    const key = contextKey(ownerWindowId, request.context)
    const state = contexts.get(key)
    if (!state || state.terminalIds.length === 0) throw new Error('terminal.notFound')
    const currentIds = new Set(state.terminalIds)
    if (
      request.terminalIds.length !== state.terminalIds.length ||
      new Set(request.terminalIds).size !== state.terminalIds.length ||
      request.terminalIds.some((id) => !currentIds.has(id))
    ) {
      throw new Error('terminal.notFound')
    }
    state.terminalIds = [...request.terminalIds]
    if (!state.activeTerminalId || !currentIds.has(state.activeTerminalId)) {
      state.activeTerminalId = state.terminalIds[0] ?? null
    }
    await persistContext(ownerWindowId, request.context)
    return snapshot(ownerWindowId, request.context)
  }

  async function subscribe({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalSubscribeRequest
  }): Promise<TerminalSubscribeResult> {
    const terminal = requireLiveTerminal(ownerWindowId, request.terminalId, request.context)
    terminal.subscriptionGeneration += 1
    return enqueueTerminalOperation(terminal, () => {
      terminal.subscribed = true
      const afterSequence = request.afterSequence ?? 0
      const events: TerminalEvent[] = terminal.output.chunks
        .filter((chunk) => chunk.sequence > afterSequence)
        .map((chunk) => ({
          type: 'output' as const,
          terminalId: terminal.id,
          sequence: chunk.sequence,
          data: chunk.data
        }))
      return {
        terminalId: terminal.id,
        events,
        oldestSequence: terminal.output.chunks[0]?.sequence ?? terminal.output.nextSequence,
        nextSequence: terminal.output.nextSequence
      }
    })
  }

  async function unsubscribe({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalUnsubscribeRequest
  }): Promise<void> {
    const terminal = requireLiveTerminal(ownerWindowId, request.terminalId, request.context)
    const generationAtInvocation = terminal.subscriptionGeneration
    return enqueueTerminalOperation(terminal, () => {
      if (terminal.subscriptionGeneration === generationAtInvocation) terminal.subscribed = false
    })
  }

  async function writeInput({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalWriteInputRequest
  }): Promise<void> {
    const terminal = requireLiveTerminal(ownerWindowId, request.terminalId, request.context)
    return enqueueTerminalOperation(terminal, () => terminal.pty.write(request.data))
  }

  async function resize({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalResizeRequest
  }): Promise<void> {
    const terminal = requireLiveTerminal(ownerWindowId, request.terminalId, request.context)
    return enqueueTerminalOperation(terminal, () => terminal.pty.resize(request.cols, request.rows))
  }

  async function close({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalCloseRequest
  }): Promise<void> {
    const terminal = requireTerminal(ownerWindowId, request.terminalId, request.context)
    await closeTerminalRecord(terminal, { markEmpty: true })
  }

  async function closeAllForWindow(ownerWindowId: number): Promise<void> {
    const kills = [...terminals.values()]
      .filter((terminal) => terminal.ownerWindowId === ownerWindowId)
      .map((terminal) => closeTerminalRecord(terminal, { markEmpty: false }))
    await Promise.all(kills)
  }

  async function closeAll(): Promise<void> {
    const kills = [...terminals.values()].map((terminal) =>
      closeTerminalRecord(terminal, { markEmpty: false })
    )
    await Promise.all(kills)
  }

  function countLiveTerminals(): number {
    return terminals.size
  }

  function countLiveTerminalsForContext(context: TerminalCreateRequest['context']): number {
    return [...terminals.values()].filter((terminal) => sameContext(terminal.context, context)).length
  }

  async function closeAllForContext(context: TerminalCreateRequest['context']): Promise<void> {
    deletingContexts.add(deletionContextKey(context))

    while (true) {
      const inFlight = [...(createPromisesByContext.get(deletionContextKey(context)) ?? [])].map(
        (promise) => swallowContextDeleting(promise)
      )
      const kills = [...terminals.values()]
        .filter((terminal) => sameContext(terminal.context, context))
        .map((terminal) => closeTerminalRecord(terminal, { markEmpty: true }))
      const shutdowns = [...(shutdownsByContext.get(deletionContextKey(context)) ?? [])].map(
        (shutdown) => runTrackedShutdown(deletionContextKey(context), shutdown)
      )

      if (inFlight.length === 0 && kills.length === 0 && shutdowns.length === 0) {
        await enqueuePersistence(context, () => tabsRepository.deleteContext(context))
        return
      }
      await Promise.all([...inFlight, ...kills, ...shutdowns])
    }
  }

  async function resolveProjectSessionWorktree(sessionId: string): Promise<string> {
    const session = await repository.findSessionById(sessionId)
    if (!session?.projectId || session.archivedAt)
      throw new Error('terminal.projectSessionNotFound')
    if (!session.worktreePath || !session.worktreeBranch || !session.worktreeBaseRevision) {
      throw new Error('terminal.worktreeMissing')
    }
    const project = await repository.findProjectById(session.projectId)
    if (!project || project.archivedAt) throw new Error('terminal.projectNotFound')
    const worktree = {
      path: session.worktreePath,
      branch: session.worktreeBranch,
      baseRevision: session.worktreeBaseRevision
    }
    const valid = await worktrees.validate({
      projectPath: project.path,
      projectId: session.projectId,
      sessionId: session.id,
      worktree
    })
    if (!valid) throw new Error('terminal.worktreeInvalid')
    return worktree.path
  }

  function getActiveTerminal(
    ownerWindowId: number,
    context: TerminalCreateRequest['context']
  ): TerminalRecord | undefined {
    const state = contexts.get(contextKey(ownerWindowId, context))
    const activeId = state?.activeTerminalId ?? state?.terminalIds[0]
    if (!activeId) return undefined
    const terminal = terminals.get(activeId)
    if (
      !terminal ||
      terminal.ownerWindowId !== ownerWindowId ||
      !sameContext(terminal.context, context)
    ) {
      return undefined
    }
    return terminal
  }

  function setActiveTerminal(
    ownerWindowId: number,
    context: TerminalCreateRequest['context'],
    terminalId: string
  ): void {
    const key = contextKey(ownerWindowId, context)
    const state = contexts.get(key) ?? { terminalIds: [], activeTerminalId: null }
    if (!state.terminalIds.includes(terminalId)) state.terminalIds.push(terminalId)
    state.activeTerminalId = terminalId
    contexts.set(key, state)
  }

  function snapshot(
    ownerWindowId: number,
    context: TerminalCreateRequest['context']
  ): TerminalTabsSnapshot {
    const state = contexts.get(contextKey(ownerWindowId, context))
    const terminalIds = state?.terminalIds.filter((id) => terminals.has(id)) ?? []
    return {
      tabs: terminalIds.map((id) => {
        const terminal = terminals.get(id)
        if (!terminal) throw new Error('terminal.notFound')
        return { terminalId: id, title: terminal.title }
      }),
      activeTerminalId: terminalIds.includes(state?.activeTerminalId ?? '')
        ? (state?.activeTerminalId ?? null)
        : (terminalIds[0] ?? null)
    }
  }

  function requireTerminal(
    ownerWindowId: number,
    terminalId: string,
    context: TerminalCreateRequest['context']
  ): TerminalRecord {
    const terminal = terminals.get(terminalId)
    if (
      !terminal ||
      terminal.ownerWindowId !== ownerWindowId ||
      !sameContext(terminal.context, context)
    ) {
      throw new Error('terminal.notFound')
    }
    return terminal
  }

  function requireLiveTerminal(
    ownerWindowId: number,
    terminalId: string,
    context: TerminalCreateRequest['context']
  ): TerminalRecord {
    const terminal = requireTerminal(ownerWindowId, terminalId, context)
    if (isContextDeleting(terminal.context)) throw new Error('terminal.contextDeleting')
    return terminal
  }

  async function resolveInitialCwd(context: TerminalCreateRequest['context']): Promise<string> {
    if (context.kind === 'project-session') return resolveProjectSessionWorktree(context.sessionId)
    if (context.kind === 'workspace-session') return resolveWorkspaceSessionRoot(context.sessionId)
    return knowledgeBaseRoot.getVerifiedRoot()
  }

  async function resolveWorkspaceSessionRoot(sessionId: string): Promise<string> {
    const session = await repository.findSessionById(sessionId)
    if (!session || session.archivedAt) throw new Error('terminal.workspaceSessionNotFound')
    if (session.kind && session.kind !== 'workspace')
      throw new Error('terminal.workspaceSessionNotFound')
    if (session.projectId !== null || session.managedContext) {
      throw new Error('terminal.workspaceSessionNotFound')
    }
    return storageSettings.getSpaceZeroHome()
  }

  async function assertContextOwnerActive(
    context: TerminalCreateRequest['context']
  ): Promise<void> {
    await resolveInitialCwd(context)
  }

  function retainAndEmit(terminal: TerminalRecord, data: string): void {
    for (const cwd of parseCwdReports(terminal, data)) {
      void applyCwdReport(terminal, cwd)
    }

    const chunk = {
      sequence: terminal.output.nextSequence++,
      data,
      bytes: Buffer.byteLength(data, 'utf8'),
      lines: countLines(data)
    }
    terminal.output.chunks.push(chunk)
    terminal.output.totalBytes += chunk.bytes
    terminal.output.totalLines += chunk.lines
    evictOldestOutput(terminal.output)

    if (terminal.subscribed) {
      emitToWindow(terminal.ownerWindowId, {
        type: 'output',
        terminalId: terminal.id,
        sequence: chunk.sequence,
        data
      })
    }
  }

  async function applyCwdReport(terminal: TerminalRecord, reportedCwd: string): Promise<void> {
    const reportOrdinal = terminal.latestCwdReportOrdinal + 1
    terminal.latestCwdReportOrdinal = reportOrdinal
    if (!isUsableCwdPath(reportedCwd)) return

    let pathStat
    try {
      pathStat = await stat(reportedCwd)
    } catch {
      return
    }
    if (
      !pathStat.isDirectory() ||
      terminal.latestCwdReportOrdinal !== reportOrdinal ||
      !terminals.has(terminal.id)
    )
      return

    terminal.currentWorkingDirectory = reportedCwd
    const nextTitle = cwdTitle(reportedCwd, terminal.shellTitle)
    const previousTitle = terminal.title
    terminal.title = nextTitle
    void enqueuePersistence(terminal.context, () =>
      tabsRepository.updateCwdAndTitle(
        terminal.context,
        terminal.restorationTabId,
        reportedCwd,
        nextTitle
      )
    )
    if (nextTitle === previousTitle) return
    if (terminal.subscribed) {
      emitToWindow(terminal.ownerWindowId, {
        type: 'tab-updated',
        terminalId: terminal.id,
        title: nextTitle
      })
    }
  }

  function evictOldestOutput(output: RetainedOutput): void {
    while (
      output.chunks.length > 1 &&
      (output.totalLines > maxRetainedLines || output.totalBytes > maxRetainedBytes)
    ) {
      const [removed] = output.chunks.splice(0, 1)
      if (!removed) break
      output.totalBytes -= removed.bytes
      output.totalLines -= removed.lines
    }

    const oldest = output.chunks[0]
    if (!oldest) return
    if (output.totalLines <= maxRetainedLines && output.totalBytes <= maxRetainedBytes) return

    const trimmedData = trimOldestDataToLimits(oldest.data, {
      maxBytes: maxRetainedBytes,
      maxLines: maxRetainedLines
    })
    oldest.data = trimmedData
    oldest.bytes = Buffer.byteLength(trimmedData, 'utf8')
    oldest.lines = countLines(trimmedData)
    output.totalBytes = oldest.bytes
    output.totalLines = oldest.lines
  }

  function removeExitedTerminal(
    terminal: TerminalRecord,
    event: { exitCode: number | null; signal?: number | string | null }
  ): void {
    if (!terminals.has(terminal.id)) return
    const shutdown = terminal.serviceShutdown
    const markEmpty = shutdown?.markEmpty ?? true
    deleteTerminal(terminal, { markEmpty })
    void cleanupShellIntegration(terminal.integrationDir)
    void persistAfterTerminalRemoval(terminal, { deleteRestorationTab: markEmpty })
    emitToWindow(terminal.ownerWindowId, {
      type: 'exit',
      terminalId: terminal.id,
      exitCode: event.exitCode,
      signal: event.signal ?? null
    })
  }

  async function closeTerminalRecord(
    terminal: TerminalRecord,
    options: { markEmpty: boolean }
  ): Promise<void> {
    terminal.serviceShutdown = options
    try {
      await trackTerminalShutdown(terminal)
    } finally {
      terminal.serviceShutdown = undefined
    }
    terminalShutdownsById.delete(terminal.id)
    deleteTerminal(terminal, options)
    await cleanupShellIntegration(terminal.integrationDir)
    if (options.markEmpty) await persistAfterTerminalRemoval(terminal, { deleteRestorationTab: true })
  }

  async function persistAfterTerminalRemoval(
    terminal: TerminalRecord,
    options: { deleteRestorationTab: boolean }
  ): Promise<void> {
    if (options.deleteRestorationTab) {
      await enqueuePersistence(terminal.context, () =>
        tabsRepository.deleteTab(terminal.context, terminal.restorationTabId)
      )
    }
    if (contexts.has(contextKey(terminal.ownerWindowId, terminal.context))) {
      await persistContext(terminal.ownerWindowId, terminal.context)
    }
  }

  async function rollbackRestoredTerminals({
    key,
    context,
    restoredRecords
  }: {
    key: string
    context: TerminalCreateRequest['context']
    restoredRecords: TerminalRecord[]
  }): Promise<void> {
    const restoredIds = new Set(restoredRecords.map((record) => record.id))
    const state = contexts.get(key)
    if (state) {
      state.terminalIds = state.terminalIds.filter(
        (id) => !restoredIds.has(id) && terminals.has(id)
      )
      if (
        state.activeTerminalId === null ||
        restoredIds.has(state.activeTerminalId) ||
        !state.terminalIds.includes(state.activeTerminalId)
      ) {
        state.activeTerminalId = state.terminalIds[0] ?? null
      }
      if (state.terminalIds.length === 0) contexts.delete(key)
    }
    for (const record of restoredRecords) {
      terminals.delete(record.id)
      for (const dispose of record.dispose.splice(0)) dispose()
    }
    try {
      if (state && state.terminalIds.length > 0) {
        // Snapshot the surviving tabs now so the rollback write stays exact even
        // if shutdown or close mutates the context before the write runs.
        const activeTerminalId = state.activeTerminalId
        const survivors = state.terminalIds
          .map((id) => terminals.get(id))
          .filter((terminal): terminal is TerminalRecord => Boolean(terminal))
        await enqueuePersistence(context, async () => {
          const replacement: PersistedTerminalTab[] = []
          for (const [order, survivor] of survivors.entries()) {
            replacement.push({
              tabId: survivor.restorationTabId,
              context,
              order,
              title: survivor.title,
              active: survivor.id === activeTerminalId,
              cwd: survivor.currentWorkingDirectory ?? (await resolveInitialCwd(context))
            })
          }
          await tabsRepository.replaceContext(context, replacement)
        })
      }
    } finally {
      await Promise.all(
        restoredRecords.map(async (record) => {
          try {
            await record.pty.kill()
          } finally {
            await cleanupShellIntegration(record.integrationDir)
          }
        })
      )
    }
  }

  function enqueuePersistence(
    context: TerminalCreateRequest['context'],
    operation: () => Promise<void>
  ): Promise<void> {
    const key = deletionContextKey(context)
    const previous = persistenceQueueByContext.get(key) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(operation)
    const tail = run.catch(() => undefined)
    persistenceQueueByContext.set(key, tail)
    void tail.then(() => {
      if (persistenceQueueByContext.get(key) === tail) persistenceQueueByContext.delete(key)
    })
    return run
  }

  function deleteTerminal(terminal: TerminalRecord, options: { markEmpty: boolean }): void {
    terminals.delete(terminal.id)
    const key = contextKey(terminal.ownerWindowId, terminal.context)
    const state = contexts.get(key)
    if (state) {
      state.terminalIds = state.terminalIds.filter((id) => id !== terminal.id)
      if (state.activeTerminalId === terminal.id)
        state.activeTerminalId = state.terminalIds[0] ?? null
      if (state.terminalIds.length === 0) contexts.delete(key)
    }
    if (options.markEmpty && (state?.terminalIds.length ?? 0) === 0) emptyContexts.add(key)
    for (const dispose of terminal.dispose.splice(0)) dispose()
  }

  function trackCreate(
    context: TerminalCreateRequest['context'],
    createPromise: Promise<TerminalCreateResult>
  ): Promise<TerminalCreateResult> {
    const key = deletionContextKey(context)
    let creates = createPromisesByContext.get(key)
    if (!creates) {
      creates = new Set()
      createPromisesByContext.set(key, creates)
    }
    creates.add(createPromise)
    const untrack = () => {
      creates?.delete(createPromise)
      if (creates?.size === 0) createPromisesByContext.delete(key)
    }
    createPromise.then(untrack, untrack)
    return createPromise
  }

  function trackTerminalShutdown(terminal: TerminalRecord): Promise<void> {
    const key = deletionContextKey(terminal.context)
    let tracked = terminalShutdownsById.get(terminal.id)
    if (!tracked) {
      tracked = { key, shutdown: { run: () => terminal.pty.kill() } }
      terminalShutdownsById.set(terminal.id, tracked)
      addTrackedShutdown(key, tracked.shutdown)
    }
    return runTrackedShutdown(tracked.key, tracked.shutdown)
  }

  function trackContextShutdown(
    context: TerminalCreateRequest['context'],
    shutdown: () => Promise<void>
  ): Promise<void> {
    const key = deletionContextKey(context)
    const tracked: TrackedShutdown = { run: shutdown }
    addTrackedShutdown(key, tracked)
    return runTrackedShutdown(key, tracked)
  }

  function addTrackedShutdown(key: string, tracked: TrackedShutdown): void {
    let shutdowns = shutdownsByContext.get(key)
    if (!shutdowns) {
      shutdowns = new Set()
      shutdownsByContext.set(key, shutdowns)
    }
    shutdowns.add(tracked)
  }

  function runTrackedShutdown(key: string, shutdown: TrackedShutdown): Promise<void> {
    if (shutdown.promise) return shutdown.promise
    const shutdowns = shutdownsByContext.get(key)
    shutdown.promise = shutdown.run().then(
      () => {
        shutdowns?.delete(shutdown)
        if (shutdowns?.size === 0) shutdownsByContext.delete(key)
      },
      (error) => {
        shutdown.promise = undefined
        throw error
      }
    )
    return shutdown.promise
  }

  async function swallowContextDeleting<T>(promise: Promise<T>): Promise<void> {
    try {
      await promise
    } catch (error) {
      if (error instanceof Error && error.message === 'terminal.contextDeleting') return
      throw error
    }
  }

  async function persistContext(
    ownerWindowId: number,
    context: TerminalCreateRequest['context']
  ): Promise<void> {
    await enqueuePersistence(context, async () => {
      const state = contexts.get(contextKey(ownerWindowId, context))
      if (!state) return
      const liveTerminals = state.terminalIds
        .map((id) => terminals.get(id))
        .filter(
          (terminal): terminal is TerminalRecord =>
            Boolean(terminal) &&
            terminal!.ownerWindowId === ownerWindowId &&
            sameContext(terminal!.context, context)
        )
      await tabsRepository.updateOrderAndActive(
        context,
        liveTerminals.map((terminal) => terminal.restorationTabId),
        liveTerminals.find((terminal) => terminal.id === state.activeTerminalId)
          ?.restorationTabId ?? null
      )
      for (const [index, terminal] of liveTerminals.entries()) {
        await tabsRepository.upsert({
          tabId: terminal.restorationTabId,
          context,
          order: index,
          title: terminal.title,
          active: state.activeTerminalId === terminal.id,
          cwd: terminal.currentWorkingDirectory ?? (await resolveInitialCwd(context))
        })
      }
    })
  }

  async function resolveRestoredCwd(
    savedCwd: string,
    fallbackCwd: string
  ): Promise<{ cwd: string; fellBack: boolean }> {
    if (!isUsableCwdPath(savedCwd)) return { cwd: fallbackCwd, fellBack: true }
    try {
      const pathStat = await stat(savedCwd)
      if (pathStat.isDirectory()) return { cwd: savedCwd, fellBack: false }
    } catch {
      return { cwd: fallbackCwd, fellBack: true }
    }
    return { cwd: fallbackCwd, fellBack: true }
  }

  function enqueueTerminalOperation<T>(
    terminal: TerminalRecord,
    operation: () => T | Promise<T>
  ): Promise<T> {
    const run = terminal.operationQueue
      .catch(() => undefined)
      .then(async () => {
        if (!terminals.has(terminal.id)) throw new Error('terminal.notFound')
        if (isContextDeleting(terminal.context)) throw new Error('terminal.contextDeleting')
        return operation()
      })
    terminal.operationQueue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  return {
    listTabs,
    create,
    selectTab,
    reorderTabs,
    subscribe,
    unsubscribe,
    writeInput,
    resize,
    close,
    closeAllForWindow,
    closeAllForContext,
    closeAll,
    countLiveTerminals,
    countLiveTerminalsForContext
  }
}

export function resolveDefaultShell(): TerminalShell {
  if (process.platform === 'win32') return { executable: 'powershell.exe', args: [] }
  const executable = process.env.SHELL?.trim()
  if (!executable) throw new Error('terminal.shellNotConfigured')
  return { executable, args: [] }
}

async function withCwdShellIntegration(
  shell: TerminalShell,
  writeStartupFile: ShellIntegrationFileWriter
): Promise<TerminalShell> {
  const name = shellName(shell.executable).toLowerCase()
  if (name === 'bash') return withBashCwdIntegration(shell, writeStartupFile)
  if (name === 'zsh') return withZshCwdIntegration(shell, writeStartupFile)
  if (name === 'fish') {
    return {
      ...shell,
      args: [
        '--init-command',
        'function __spacezero_cwd_report; printf "\\e]7;file://%s%s\\a" (hostname) "$PWD"; end; function __spacezero_cwd_report_on_pwd --on-variable PWD; __spacezero_cwd_report; end; __spacezero_cwd_report',
        ...shell.args
      ]
    }
  }
  if (
    name === 'powershell.exe' ||
    name === 'powershell' ||
    name === 'pwsh.exe' ||
    name === 'pwsh'
  ) {
    return {
      ...shell,
      args: [
        '-NoExit',
        '-Command',
        "$function:__spacezero_original_prompt = $function:prompt; function global:prompt { Write-Host -NoNewline (\"`e]7;file://localhost/{0}`a\" -f ((Get-Location).ProviderPath -replace '\\\\','/')); if ($function:__spacezero_original_prompt) { & $function:__spacezero_original_prompt } else { 'PS ' + (Get-Location) + '> ' } }",
        ...shell.args
      ]
    }
  }
  return shell
}

async function withBashCwdIntegration(
  shell: TerminalShell,
  writeStartupFile: ShellIntegrationFileWriter
): Promise<TerminalShell> {
  const dir = await mkdtemp(join(tmpdir(), 'spacezero-terminal-bash-'))
  const rcfile = join(dir, 'bashrc')
  try {
    await writeStartupFile(
      rcfile,
      'if [ -r "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi\n__spacezero_cwd_report() { printf "\\033]7;file://%s%s\\007" "${HOSTNAME:-localhost}" "$PWD"; }\nPROMPT_COMMAND="__spacezero_cwd_report${PROMPT_COMMAND:+;$PROMPT_COMMAND}"\n',
      'utf8'
    )
  } catch (error) {
    await cleanupShellIntegration(dir)
    throw error
  }
  return { ...shell, args: ['--rcfile', rcfile, ...shell.args], integrationDir: dir }
}

async function withZshCwdIntegration(
  shell: TerminalShell,
  writeStartupFile: ShellIntegrationFileWriter
): Promise<TerminalShell> {
  const dir = await mkdtemp(join(tmpdir(), 'spacezero-terminal-zsh-'))
  const originalZdotdirWasSet = Object.hasOwn(process.env, 'ZDOTDIR') ? '1' : '0'
  const originalZdotdir = process.env.ZDOTDIR ?? ''
  try {
    await writeStartupFile(
      join(dir, '.zshenv'),
      `if [ "\${SPACEZERO_ORIGINAL_ZDOTDIR_WAS_SET:-0}" = "1" ]; then
  export ZDOTDIR="\${SPACEZERO_ORIGINAL_ZDOTDIR}"
else
  unset ZDOTDIR
fi
__spacezero_original_zdotdir="\${ZDOTDIR-$HOME}"
if [ -r "\${__spacezero_original_zdotdir}/.zshenv" ]; then
  source "\${__spacezero_original_zdotdir}/.zshenv"
fi
__spacezero_cwd_report() { printf "\\033]7;file://%s%s\\007" "\${HOST:-localhost}" "$PWD"; }
typeset -ga precmd_functions chpwd_functions
precmd_functions+=(__spacezero_cwd_report)
chpwd_functions+=(__spacezero_cwd_report)
`,
      'utf8'
    )
  } catch (error) {
    await cleanupShellIntegration(dir)
    throw error
  }
  return {
    ...shell,
    args: [...shell.args],
    env: {
      SPACEZERO_ORIGINAL_ZDOTDIR: originalZdotdir,
      SPACEZERO_ORIGINAL_ZDOTDIR_WAS_SET: originalZdotdirWasSet,
      ZDOTDIR: dir
    },
    integrationDir: dir
  }
}

async function cleanupShellIntegration(dir: string | undefined): Promise<void> {
  if (!dir) return
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    // Shell-integration temp cleanup is best-effort and must not block terminal shutdown.
  }
}

function contextKey(ownerWindowId: number, context: TerminalCreateRequest['context']): string {
  return `${ownerWindowId}:${terminalContextIdentity(context)}`
}

function deletionContextKey(context: TerminalCreateRequest['context']): string {
  return terminalContextIdentity(context)
}

function terminalContextIdentity(context: TerminalCreateRequest['context']): string {
  if (context.kind === 'knowledge-base') return context.kind
  return `${context.kind}:${context.sessionId}`
}

function sameContext(
  left: TerminalCreateRequest['context'],
  right: TerminalCreateRequest['context']
): boolean {
  return terminalContextIdentity(left) === terminalContextIdentity(right)
}

function shellName(executable: string): string {
  return executable.split(/[\\/]/).filter(Boolean).at(-1) || 'Shell'
}

function cwdTitle(cwd: string | null, fallback: string): string {
  if (!cwd) return fallback
  return basename(cwd) || fallback
}

function parseCwdReports(terminal: TerminalRecord, data: string): string[] {
  const reports: string[] = []
  const stream = `${terminal.cwdReportBuffer}${data}`
  terminal.cwdReportBuffer = ''

  let searchFrom = 0
  while (searchFrom < stream.length) {
    const start = stream.indexOf(OSC7_PREFIX, searchFrom)
    if (start < 0) {
      terminal.cwdReportBuffer = partialOsc7Prefix(stream.slice(searchFrom))
      break
    }

    const payloadStart = start + OSC7_PREFIX.length
    const belEnd = stream.indexOf(BEL, payloadStart)
    const stEnd = stream.indexOf(ST, payloadStart)
    const end = belEnd < 0 ? stEnd : stEnd < 0 ? belEnd : Math.min(belEnd, stEnd)
    const nestedStart = stream.indexOf(OSC7_PREFIX, payloadStart)
    if (nestedStart >= 0 && (end < 0 || nestedStart < end)) {
      searchFrom = nestedStart
      continue
    }
    if (end < 0) {
      const partial = stream.slice(start)
      terminal.cwdReportBuffer =
        Buffer.byteLength(partial, 'utf8') <= MAX_PARTIAL_CWD_REPORT_BYTES
          ? partial
          : partialOsc7Prefix(partial)
      break
    }

    if (
      Buffer.byteLength(stream.slice(payloadStart, end), 'utf8') <= MAX_PARTIAL_CWD_REPORT_BYTES
    ) {
      const cwd = parseCwdReportPayload(stream.slice(payloadStart, end))
      if (cwd) reports.push(cwd)
    }
    searchFrom = end + (end === stEnd ? ST.length : BEL.length)
  }

  return reports
}

function partialOsc7Prefix(data: string): string {
  const maxLength = Math.min(data.length, OSC7_PREFIX.length - 1)
  for (let length = maxLength; length > 0; length -= 1) {
    const suffix = data.slice(-length)
    if (OSC7_PREFIX.startsWith(suffix)) return suffix
  }
  return ''
}

function parseCwdReportPayload(payload: string): string | null {
  if (!payload.startsWith('file://')) return null
  let url: URL
  try {
    url = new URL(payload)
  } catch {
    return null
  }
  if (url.protocol !== 'file:') return null
  try {
    const pathname = decodeURIComponent(url.pathname)
    if (/^\/[A-Za-z]:[\\/]/.test(pathname)) return pathname.slice(1)
    return pathname
  } catch {
    return null
  }
}

function isUsableCwdPath(cwd: string): boolean {
  return cwd.length > 0 && (isPosixAbsolute(cwd) || isWin32Absolute(cwd))
}

function trimOldestDataToLimits(
  data: string,
  limits: { maxBytes: number; maxLines: number }
): string {
  let trimmed = data
  while (countLines(trimmed) > limits.maxLines) {
    const newlineIndex = trimmed.indexOf('\n')
    if (newlineIndex < 0) break
    trimmed = trimmed.slice(newlineIndex + 1)
  }

  if (Buffer.byteLength(trimmed, 'utf8') > limits.maxBytes) {
    trimmed = trimToUtf8ByteLimit(trimmed, limits.maxBytes)
  }

  while (countLines(trimmed) > limits.maxLines) {
    const newlineIndex = trimmed.indexOf('\n')
    if (newlineIndex < 0) break
    trimmed = trimmed.slice(newlineIndex + 1)
  }

  return trimmed
}

function trimToUtf8ByteLimit(data: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  const bytes = Buffer.from(data, 'utf8')
  let start = Math.max(0, bytes.length - maxBytes)
  while (start < bytes.length && (bytes[start] & 0b1100_0000) === 0b1000_0000) {
    start += 1
  }
  return bytes.subarray(start).toString('utf8')
}

function countLines(data: string): number {
  return Math.max(1, data.split('\n').length - 1)
}

function createMemoryTerminalTabsRepository(): TerminalTabsRepository {
  const tabs = new Map<string, PersistedTerminalTab>()
  const keyFor = (context: TerminalCreateRequest['context'], tabId: string) =>
    `${terminalContextIdentity(context)}:${tabId}`
  return {
    async listByContext(context) {
      return [...tabs.values()]
        .filter((tab) => sameContext(tab.context, context))
        .sort((left, right) => left.order - right.order)
    },
    async upsert(tab) {
      tabs.set(keyFor(tab.context, tab.tabId), { ...tab })
    },
    async replaceContext(context, replacementTabs) {
      for (const tab of [...tabs.values()])
        if (sameContext(tab.context, context)) tabs.delete(keyFor(tab.context, tab.tabId))
      for (const tab of replacementTabs) tabs.set(keyFor(tab.context, tab.tabId), { ...tab })
    },
    async updateOrderAndActive(context, orderedTabIds, activeTabId) {
      for (const [order, tabId] of orderedTabIds.entries()) {
        const existing = tabs.get(keyFor(context, tabId))
        if (existing)
          tabs.set(keyFor(context, tabId), { ...existing, order, active: tabId === activeTabId })
      }
    },
    async updateCwdAndTitle(context, tabId, cwd, title) {
      const existing = tabs.get(keyFor(context, tabId))
      if (existing) tabs.set(keyFor(context, tabId), { ...existing, cwd, title })
    },
    async deleteTab(context, tabId) {
      tabs.delete(keyFor(context, tabId))
    },
    async deleteContext(context) {
      for (const tab of [...tabs.values()])
        if (sameContext(tab.context, context)) tabs.delete(keyFor(tab.context, tab.tabId))
    }
  }
}

function processEnv(): NodeJS.ProcessEnv {
  return process.env
}
