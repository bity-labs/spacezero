import { randomUUID } from 'node:crypto'

import type {
  TerminalCloseRequest,
  TerminalCreateRequest,
  TerminalCreateResult,
  TerminalEvent,
  TerminalResizeRequest,
  TerminalSubscribeRequest,
  TerminalSubscribeResult,
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
}

type TerminalRecord = {
  id: string
  ownerWindowId: number
  context: TerminalCreateRequest['context']
  pty: PtyProcess
  output: RetainedOutput
  subscribed: boolean
  subscriptionGeneration: number
  operationQueue: Promise<void>
  dispose: Array<() => void>
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
  maxRetainedBytes = DEFAULT_MAX_RETAINED_BYTES
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
}) {
  const terminals = new Map<string, TerminalRecord>()
  const emptyContexts = new Set<string>()
  const deletingContexts = new Set<string>()
  const inFlightCreates = new Map<string, InFlightCreate>()
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

    const existing = findExistingTerminal(ownerWindowId, request.context)
    if (existing) return { status: 'running', terminalId: existing.id }

    const key = contextKey(ownerWindowId, request.context)
    if (!request.forceNew && emptyContexts.has(key)) {
      await assertContextOwnerActive(request.context)
      return { status: 'empty', terminalId: null }
    }

    const inFlight = inFlightCreates.get(key)
    if (inFlight) return inFlight.promise

    const createPromise = createFreshTerminal({ ownerWindowId, request }).finally(() => {
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

    const shell = resolveShell()
    const id = createId()
    let process: PtyProcess
    try {
      process = await pty.spawn({
        shell: shell.executable,
        args: shell.args,
        cwd,
        cols: request.cols ?? 80,
        rows: request.rows ?? 24,
        env: processEnv()
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

    const record: TerminalRecord = {
      id,
      ownerWindowId,
      context: request.context,
      pty: process,
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
    emptyContexts.delete(contextKey(ownerWindowId, request.context))
    return { status: 'running', terminalId: id }
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
      const inFlight = [...inFlightCreates.values()]
        .filter((create) => sameContext(create.context, context))
        .map((create) => swallowContextDeleting(create.promise))
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

  function findExistingTerminal(
    ownerWindowId: number,
    context: TerminalCreateRequest['context']
  ): TerminalRecord | undefined {
    return [...terminals.values()].find(
      (terminal) =>
        terminal.ownerWindowId === ownerWindowId && sameContext(terminal.context, context)
    )
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
    if (session.kind && session.kind !== 'workspace') throw new Error('terminal.workspaceSessionNotFound')
    if (session.projectId !== null || session.managedContext) {
      throw new Error('terminal.workspaceSessionNotFound')
    }
    return storageSettings.getSpaceZeroHome()
  }

  async function assertContextOwnerActive(context: TerminalCreateRequest['context']): Promise<void> {
    await resolveInitialCwd(context)
  }

  function retainAndEmit(terminal: TerminalRecord, data: string): void {
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
    if (options.markEmpty) emptyContexts.add(contextKey(terminal.ownerWindowId, terminal.context))
    for (const dispose of terminal.dispose.splice(0)) dispose()
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
    create,
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
