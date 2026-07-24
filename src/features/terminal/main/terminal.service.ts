import { randomUUID } from 'node:crypto'
import { mkdtemp, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { isAbsolute as isPosixAbsolute } from 'node:path/posix'
import { isAbsolute as isWin32Absolute } from 'node:path/win32'

import type {
  TerminalCloseRequest,
  TerminalCreateRequest,
  TerminalCreateResult,
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
}

type TerminalRecord = {
  id: string
  ownerWindowId: number
  context: TerminalCreateRequest['context']
  pty: PtyProcess
  shellTitle: string
  title: string
  currentWorkingDirectory: string | null
  latestCwdReportOrdinal: number
  output: RetainedOutput
  subscribed: boolean
  subscriptionGeneration: number
  operationQueue: Promise<void>
  dispose: Array<() => void>
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
  createId = randomUUID,
  resolveShell = resolveDefaultShell,
  emitToWindow,
  maxRetainedLines = DEFAULT_MAX_RETAINED_LINES,
  maxRetainedBytes = DEFAULT_MAX_RETAINED_BYTES,
  enableShellIntegration = false
}: {
  repository: TerminalRepository
  worktrees: TerminalWorktreeValidator
  storageSettings: TerminalStorageSettingsProvider
  knowledgeBaseRoot: TerminalKnowledgeBaseRootProvider
  pty: TerminalPtyAdapter
  createId?: () => string
  resolveShell?: () => TerminalShell
  emitToWindow: (windowId: number, event: TerminalEvent) => void
  maxRetainedLines?: number
  maxRetainedBytes?: number
  enableShellIntegration?: boolean
}) {
  const terminals = new Map<string, TerminalRecord>()
  const contexts = new Map<string, TerminalContextState>()
  const emptyContexts = new Set<string>()
  const deletingContexts = new Set<string>()
  const inFlightCreates = new Map<string, InFlightCreate>()
  const createPromisesByContext = new Map<string, Set<Promise<TerminalCreateResult>>>()
  const shutdownsByContext = new Map<string, Set<TrackedShutdown>>()
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
      return { status: 'running', terminalId: existing.id, ...snapshot(ownerWindowId, request.context) }
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

    const createPromise = trackCreate(request.context, createFreshTerminal({ ownerWindowId, request })).finally(() => {
      inFlightCreates.delete(key)
    })
    inFlightCreates.set(key, { context: request.context, promise: createPromise })
    return createPromise
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

    const shell = enableShellIntegration ? await withCwdShellIntegration(resolveShell()) : resolveShell()
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
      throw new Error(
        `terminal.shellLaunchFailed: ${error instanceof Error ? error.message : 'unknown error'}`,
        { cause: error }
      )
    }

    if (isContextDeleting(request.context)) {
      await trackContextShutdown(request.context, () => process.kill())
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
      currentWorkingDirectory: cwd,
      latestCwdReportOrdinal: 0,
      output: { chunks: [], nextSequence: 1, totalBytes: 0, totalLines: 0 },
      subscribed: false,
      subscriptionGeneration: 0,
      operationQueue: Promise.resolve(),
      dispose: []
    }
    record.dispose.push(
      process.onData((data) => retainAndEmit(record, data)),
      process.onExit((event) => removeExitedTerminal(record, event))
    )
    terminals.set(id, record)
    setActiveTerminal(ownerWindowId, request.context, id)
    emptyContexts.delete(contextKey(ownerWindowId, request.context))
    return { status: 'running', terminalId: id, ...snapshot(ownerWindowId, request.context) }
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

      if (inFlight.length === 0 && kills.length === 0 && shutdowns.length === 0) return
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
    if (!terminal || terminal.ownerWindowId !== ownerWindowId || !sameContext(terminal.context, context)) {
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
    for (const cwd of parseCwdReports(data)) {
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
    if (!pathStat.isDirectory() || terminal.latestCwdReportOrdinal !== reportOrdinal || !terminals.has(terminal.id)) return

    terminal.currentWorkingDirectory = reportedCwd
    const nextTitle = cwdTitle(reportedCwd, terminal.shellTitle)
    if (nextTitle === terminal.title) return
    terminal.title = nextTitle
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
    deleteTerminal(terminal, { markEmpty: true })
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
    deleteTerminal(terminal, options)
    await trackContextShutdown(terminal.context, () => terminal.pty.kill())
  }

  function deleteTerminal(terminal: TerminalRecord, options: { markEmpty: boolean }): void {
    terminals.delete(terminal.id)
    const key = contextKey(terminal.ownerWindowId, terminal.context)
    const state = contexts.get(key)
    if (state) {
      state.terminalIds = state.terminalIds.filter((id) => id !== terminal.id)
      if (state.activeTerminalId === terminal.id) state.activeTerminalId = state.terminalIds[0] ?? null
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

  function trackContextShutdown(
    context: TerminalCreateRequest['context'],
    shutdown: () => Promise<void>
  ): Promise<void> {
    const key = deletionContextKey(context)
    let shutdowns = shutdownsByContext.get(key)
    if (!shutdowns) {
      shutdowns = new Set()
      shutdownsByContext.set(key, shutdowns)
    }
    const tracked: TrackedShutdown = { run: shutdown }
    shutdowns.add(tracked)
    return runTrackedShutdown(key, tracked)
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
    closeAll
  }
}

export function resolveDefaultShell(): TerminalShell {
  if (process.platform === 'win32') return { executable: 'powershell.exe', args: [] }
  const executable = process.env.SHELL?.trim()
  if (!executable) throw new Error('terminal.shellNotConfigured')
  return { executable, args: [] }
}

async function withCwdShellIntegration(shell: TerminalShell): Promise<TerminalShell> {
  const name = shellName(shell.executable).toLowerCase()
  if (name === 'bash') return withBashCwdIntegration(shell)
  if (name === 'zsh') return withZshCwdIntegration(shell)
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
  if (name === 'powershell.exe' || name === 'powershell' || name === 'pwsh.exe' || name === 'pwsh') {
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

async function withBashCwdIntegration(shell: TerminalShell): Promise<TerminalShell> {
  const dir = await mkdtemp(join(tmpdir(), 'spacezero-terminal-bash-'))
  const rcfile = join(dir, 'bashrc')
  await writeFile(
    rcfile,
    'if [ -r "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi\n__spacezero_cwd_report() { printf "\\033]7;file://%s%s\\007" "${HOSTNAME:-localhost}" "$PWD"; }\nPROMPT_COMMAND="__spacezero_cwd_report${PROMPT_COMMAND:+;$PROMPT_COMMAND}"\n',
    'utf8'
  )
  return { ...shell, args: ['--rcfile', rcfile, ...shell.args] }
}

async function withZshCwdIntegration(shell: TerminalShell): Promise<TerminalShell> {
  const dir = await mkdtemp(join(tmpdir(), 'spacezero-terminal-zsh-'))
  await writeFile(
    join(dir, '.zshrc'),
    'if [ -r "${SPACEZERO_ORIGINAL_ZDOTDIR:-$HOME}/.zshrc" ]; then source "${SPACEZERO_ORIGINAL_ZDOTDIR:-$HOME}/.zshrc"; fi\nautoload -Uz add-zsh-hook\n__spacezero_cwd_report() { printf "\\033]7;file://%s%s\\007" "${HOST:-localhost}" "$PWD"; }\nadd-zsh-hook precmd __spacezero_cwd_report\nadd-zsh-hook chpwd __spacezero_cwd_report\n',
    'utf8'
  )
  return {
    ...shell,
    args: [...shell.args],
    env: { SPACEZERO_ORIGINAL_ZDOTDIR: process.env.ZDOTDIR || process.env.HOME, ZDOTDIR: dir }
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

function parseCwdReports(data: string): string[] {
  const reports: string[] = []
  let searchFrom = 0
  while (searchFrom < data.length) {
    const start = data.indexOf(`${String.fromCharCode(27)}]7;`, searchFrom)
    if (start < 0) break
    const payloadStart = start + 4
    const belEnd = data.indexOf(String.fromCharCode(7), payloadStart)
    const stEnd = data.indexOf(`${String.fromCharCode(27)}\\`, payloadStart)
    const end = belEnd < 0 ? stEnd : stEnd < 0 ? belEnd : Math.min(belEnd, stEnd)
    if (end < 0) break
    const cwd = parseCwdReportPayload(data.slice(payloadStart, end))
    if (cwd) reports.push(cwd)
    searchFrom = end + (end === stEnd ? 2 : 1)
  }
  return reports
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

function processEnv(): NodeJS.ProcessEnv {
  return process.env
}
