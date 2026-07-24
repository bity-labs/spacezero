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
        projectId: string | null
        worktreePath?: string | null
        worktreeBranch?: string | null
        worktreeBaseRevision?: string | null
        archivedAt?: Date | null
      }
    | undefined
  >
  findProjectById: (
    projectId: string
  ) => Promise<{ id: string; path: string; archivedAt?: Date | null } | undefined>
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
  kill: () => void
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
  dispose: Array<() => void>
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

const DEFAULT_MAX_RETAINED_LINES = 10_000
const DEFAULT_MAX_RETAINED_BYTES = 5 * 1024 * 1024

export function createTerminalService({
  repository,
  worktrees,
  pty,
  createId = randomUUID,
  resolveShell = resolveDefaultShell,
  emitToWindow,
  maxRetainedLines = DEFAULT_MAX_RETAINED_LINES,
  maxRetainedBytes = DEFAULT_MAX_RETAINED_BYTES
}: {
  repository: TerminalRepository
  worktrees: TerminalWorktreeValidator
  pty: TerminalPtyAdapter
  createId?: () => string
  resolveShell?: () => TerminalShell
  emitToWindow: (windowId: number, event: TerminalEvent) => void
  maxRetainedLines?: number
  maxRetainedBytes?: number
}) {
  const terminals = new Map<string, TerminalRecord>()

  async function create({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalCreateRequest
  }): Promise<TerminalCreateResult> {
    const existing = findExistingTerminal(ownerWindowId, request.context)
    if (existing) return { terminalId: existing.id }

    const cwd = await resolveProjectSessionWorktree(request.context.sessionId)
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

    const record: TerminalRecord = {
      id,
      ownerWindowId,
      context: request.context,
      pty: process,
      output: { chunks: [], nextSequence: 1, totalBytes: 0, totalLines: 0 },
      subscribed: false,
      dispose: []
    }
    record.dispose.push(
      process.onData((data) => retainAndEmit(record, data)),
      process.onExit((event) => removeExitedTerminal(record, event))
    )
    terminals.set(id, record)
    return { terminalId: id }
  }

  async function subscribe({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalSubscribeRequest
  }): Promise<TerminalSubscribeResult> {
    const terminal = requireTerminal(ownerWindowId, request.terminalId, request.context)
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
  }

  async function unsubscribe({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalUnsubscribeRequest
  }): Promise<void> {
    const terminal = requireTerminal(ownerWindowId, request.terminalId, request.context)
    terminal.subscribed = false
  }

  async function writeInput({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalWriteInputRequest
  }): Promise<void> {
    requireTerminal(ownerWindowId, request.terminalId, request.context).pty.write(request.data)
  }

  async function resize({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalResizeRequest
  }): Promise<void> {
    requireTerminal(ownerWindowId, request.terminalId, request.context).pty.resize(
      request.cols,
      request.rows
    )
  }

  async function close({
    ownerWindowId,
    request
  }: {
    ownerWindowId: number
    request: TerminalCloseRequest
  }): Promise<void> {
    const terminal = requireTerminal(ownerWindowId, request.terminalId, request.context)
    deleteTerminal(terminal)
    terminal.pty.kill()
  }

  function closeAllForWindow(ownerWindowId: number): void {
    for (const terminal of [...terminals.values()]) {
      if (terminal.ownerWindowId === ownerWindowId) {
        deleteTerminal(terminal)
        terminal.pty.kill()
      }
    }
  }

  function closeAll(): void {
    for (const terminal of [...terminals.values()]) {
      deleteTerminal(terminal)
      terminal.pty.kill()
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
  }

  function removeExitedTerminal(
    terminal: TerminalRecord,
    event: { exitCode: number | null; signal?: number | string | null }
  ): void {
    if (!terminals.has(terminal.id)) return
    deleteTerminal(terminal)
    emitToWindow(terminal.ownerWindowId, {
      type: 'exit',
      terminalId: terminal.id,
      exitCode: event.exitCode,
      signal: event.signal ?? null
    })
  }

  function deleteTerminal(terminal: TerminalRecord): void {
    terminals.delete(terminal.id)
    for (const dispose of terminal.dispose.splice(0)) dispose()
  }

  return {
    create,
    subscribe,
    unsubscribe,
    writeInput,
    resize,
    close,
    closeAllForWindow,
    closeAll
  }
}

export function resolveDefaultShell(): TerminalShell {
  if (process.platform === 'win32') return { executable: 'powershell.exe', args: [] }
  const executable = process.env.SHELL?.trim()
  if (!executable) throw new Error('terminal.shellNotConfigured')
  return { executable, args: [] }
}

function sameContext(
  left: TerminalCreateRequest['context'],
  right: TerminalCreateRequest['context']
): boolean {
  return left.kind === right.kind && left.sessionId === right.sessionId
}

function countLines(data: string): number {
  return Math.max(1, data.split('\n').length - 1)
}

function processEnv(): NodeJS.ProcessEnv {
  return process.env
}
