import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { createTerminalService, type PtyProcess, type TerminalPtyAdapter } from './terminal.service'

const project = { id: 'project-1', path: '/repo/base', archivedAt: null }
const session = {
  id: 'session-1',
  projectId: project.id,
  worktreePath: '/SpaceZero/worktrees/project-1/session-1',
  worktreeBranch: 'spacezero/session-session-1',
  worktreeBaseRevision: 'abc123',
  archivedAt: null
}
const context = { kind: 'project-session' as const, sessionId: session.id }

function createHarness() {
  const ptys: FakePty[] = []
  const adapter: TerminalPtyAdapter = {
    spawn: vi.fn(async (request) => {
      const pty = new FakePty(request.cols, request.rows)
      ptys.push(pty)
      return pty
    })
  }
  const repository = {
    findSessionById: vi.fn(async (sessionId: string) =>
      sessionId === session.id ? session : undefined
    ),
    findProjectById: vi.fn(async (projectId: string) =>
      projectId === project.id ? project : undefined
    )
  }
  const worktrees = {
    validate: vi.fn(async () => true)
  }
  const events: unknown[] = []
  const service = createTerminalService({
    repository,
    worktrees,
    pty: adapter,
    createId: () => `terminal-${ptys.length + 1}`,
    resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
    emitToWindow: (_windowId, event) => events.push(event)
  })
  return { adapter, events, ptys, repository, service, worktrees }
}

describe('Terminal service', () => {
  it('launches one project-session PTY in the authenticated managed worktree and reuses it for the same window/context', async () => {
    const { adapter, ptys, service, worktrees } = createHarness()

    const first = await service.create({
      ownerWindowId: 1,
      request: { context, cols: 100, rows: 30 }
    })
    const second = await service.create({
      ownerWindowId: 1,
      request: { context, cols: 120, rows: 40 }
    })

    expect(first).toEqual({ terminalId: 'terminal-1' })
    expect(second).toEqual(first)
    expect(adapter.spawn).toHaveBeenCalledTimes(1)
    expect(adapter.spawn).toHaveBeenCalledWith({
      shell: '/bin/zsh',
      args: [],
      cwd: session.worktreePath,
      cols: 100,
      rows: 30,
      env: process.env
    })
    expect(worktrees.validate).toHaveBeenCalledWith({
      projectPath: project.path,
      projectId: project.id,
      sessionId: session.id,
      worktree: {
        path: session.worktreePath,
        branch: session.worktreeBranch,
        baseRevision: session.worktreeBaseRevision
      }
    })
    expect(ptys).toHaveLength(1)
  })

  it('forwards input unchanged, resizes valid PTYs, and rejects forged window or context ownership', async () => {
    const { ptys, service } = createHarness()
    const { terminalId } = await service.create({
      ownerWindowId: 1,
      request: { context, cols: 80, rows: 24 }
    })

    await service.writeInput({
      ownerWindowId: 1,
      request: { terminalId, context, data: 'npm test\r' }
    })
    await service.resize({ ownerWindowId: 1, request: { terminalId, context, cols: 90, rows: 25 } })

    expect(ptys[0]?.writes).toEqual(['npm test\r'])
    expect(ptys[0]?.resizes).toEqual([{ cols: 90, rows: 25 }])
    await expect(
      service.writeInput({ ownerWindowId: 2, request: { terminalId, context, data: 'whoami\r' } })
    ).rejects.toThrow('terminal.notFound')
    await expect(
      service.resize({
        ownerWindowId: 1,
        request: {
          terminalId,
          context: { kind: 'project-session', sessionId: 'session-2' },
          cols: 90,
          rows: 25
        }
      })
    ).rejects.toThrow('terminal.notFound')
  })

  it('retains bounded output and replays only events after the subscriber cursor', async () => {
    const { events, ptys, service } = createHarness()
    const { terminalId } = await service.create({ ownerWindowId: 1, request: { context } })

    await service.subscribe({ ownerWindowId: 1, request: { terminalId, context } })
    ptys[0]?.emitData('first\n')
    ptys[0]?.emitData('second\n')
    await service.unsubscribe({ ownerWindowId: 1, request: { terminalId, context } })
    ptys[0]?.emitData('third\n')

    const replay = await service.subscribe({
      ownerWindowId: 1,
      request: { terminalId, context, afterSequence: 2 }
    })

    expect(events).toEqual([
      { type: 'output', terminalId, sequence: 1, data: 'first\n' },
      { type: 'output', terminalId, sequence: 2, data: 'second\n' }
    ])
    expect(replay.events).toEqual([{ type: 'output', terminalId, sequence: 3, data: 'third\n' }])
    expect(replay.nextSequence).toBe(4)
  })

  it('evicts oldest output when retained line or byte limits are reached', async () => {
    const ptys: FakePty[] = []
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      pty: {
        spawn: vi.fn(async () => {
          const pty = new FakePty(80, 24)
          ptys.push(pty)
          return pty
        })
      },
      createId: () => 'terminal-evict',
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn(),
      maxRetainedLines: 2,
      maxRetainedBytes: 12
    })
    const { terminalId } = await service.create({ ownerWindowId: 1, request: { context } })
    const pty = ptys[0]

    pty.emitData('one\n')
    pty.emitData('two\n')
    pty.emitData('three\n')
    pty.emitData('0123456789abcdef')

    const replay = await service.subscribe({ ownerWindowId: 1, request: { terminalId, context } })
    expect(replay.events).toEqual([
      { type: 'output', terminalId, sequence: 4, data: '0123456789abcdef' }
    ])
    expect(replay.oldestSequence).toBe(4)
  })

  it('closes the PTY on user close and removes it after natural shell exit', async () => {
    const { events, ptys, service } = createHarness()
    const { terminalId } = await service.create({ ownerWindowId: 1, request: { context } })
    await service.subscribe({ ownerWindowId: 1, request: { terminalId, context } })

    await service.close({ ownerWindowId: 1, request: { terminalId, context } })

    expect(ptys[0]?.killed).toBe(true)
    await expect(
      service.writeInput({ ownerWindowId: 1, request: { terminalId, context, data: 'again' } })
    ).rejects.toThrow('terminal.notFound')

    const next = await service.create({ ownerWindowId: 1, request: { context } })
    await service.subscribe({ ownerWindowId: 1, request: { terminalId: next.terminalId, context } })
    ptys[1]?.emitExit(0)

    expect(events).toContainEqual({
      type: 'exit',
      terminalId: next.terminalId,
      exitCode: 0,
      signal: null
    })
    await expect(
      service.resize({
        ownerWindowId: 1,
        request: { terminalId: next.terminalId, context, cols: 80, rows: 24 }
      })
    ).rejects.toThrow('terminal.notFound')
  })

  it('surfaces shell launch failures without substituting another shell', async () => {
    const adapter: TerminalPtyAdapter = {
      spawn: vi.fn(async () => {
        throw new Error('ENOENT')
      })
    }
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      pty: adapter,
      resolveShell: () => ({ executable: '/missing-shell', args: [] }),
      emitToWindow: vi.fn()
    })

    await expect(service.create({ ownerWindowId: 1, request: { context } })).rejects.toThrow(
      'terminal.shellLaunchFailed'
    )
    expect(adapter.spawn).toHaveBeenCalledTimes(1)
  })
})

class FakePty extends EventEmitter implements PtyProcess {
  killed = false
  readonly writes: string[] = []
  readonly resizes: Array<{ cols: number; rows: number }> = []

  constructor(
    readonly cols: number,
    readonly rows: number
  ) {
    super()
  }

  write(data: string): void {
    this.writes.push(data)
  }

  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows })
  }

  kill(): void {
    this.killed = true
  }

  onData(listener: (data: string) => void): () => void {
    this.on('data', listener)
    return () => this.off('data', listener)
  }

  onExit(
    listener: (event: { exitCode: number | null; signal?: number | string | null }) => void
  ): () => void {
    this.on('exit', listener)
    return () => this.off('exit', listener)
  }

  emitData(data: string): void {
    this.emit('data', data)
  }

  emitExit(exitCode: number | null, signal: number | string | null = null): void {
    this.emit('exit', { exitCode, signal })
  }
}
