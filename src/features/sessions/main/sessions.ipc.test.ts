import { EventEmitter } from 'node:events'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StoredSession } from './sessions.service'
import { createTerminalService, type PtyProcess, type TerminalPtyAdapter } from '../../terminal/main/terminal.service'

const deleteChannel = 'sessions:delete'

function createStoredSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: 'workspace-session-1',
    projectId: null,
    title: 'Workspace Session 1',
    status: 'idle',
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    transcriptPath: null,
    worktreePath: null,
    worktreeBranch: null,
    worktreeBaseRevision: null,
    managedContext: null,
    ...overrides
  }
}

async function setupSessionsIpcHarness({
  session,
  terminalPty
}: {
  session: StoredSession
  terminalPty?: TerminalPtyAdapter
}) {
  vi.resetModules()
  const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>()
  const events: string[] = []
  let storedSession: StoredSession | undefined = session
  const ptys: FakePty[] = []
  const pty: TerminalPtyAdapter =
    terminalPty ??
    ({
      spawn: vi.fn(async (request) => {
        const fakePty = new FakePty(request.cols, request.rows)
        ptys.push(fakePty)
        return fakePty
      })
    } satisfies TerminalPtyAdapter)
  const repository = {
    findSessionById: vi.fn(async (sessionId: string) =>
      storedSession?.id === sessionId ? storedSession : undefined
    ),
    findProjectById: vi.fn(async () => undefined),
    listByProjectIdIncludingArchived: vi.fn(async () => []),
    deleteById: vi.fn(async (sessionId: string) => {
      events.push('metadata')
      if (storedSession?.id === sessionId) storedSession = undefined
    })
  }
  const terminalService = createTerminalService({
    repository,
    worktrees: { validate: vi.fn(async () => true) },
    storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
    knowledgeBaseRoot: {
      getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
    },
    pty,
    createId: () => `terminal-${ptys.length + 1}`,
    resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
    emitToWindow: vi.fn()
  })
  const utilityHost = {
    deleteSession: vi.fn(async () => {
      events.push('utility')
    })
  }

  vi.doMock('electron', () => ({
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => {
        handlers.set(channel, handler)
      })
    }
  }))
  vi.doMock('./sessions.repository', () => ({ createSessionsRepository: () => repository }))
  vi.doMock('./managed-worktree.runtime', () => ({
    getManagedWorktreeService: () => ({ remove: vi.fn(async () => undefined) })
  }))
  vi.doMock('../../agent-workspace/main/agent-utility-process', () => ({
    getAgentUtilityProcessHost: () => utilityHost
  }))
  vi.doMock('../../terminal/main/terminal.runtime', () => ({
    getTerminalService: () => terminalService
  }))
  vi.doMock('../../browser/main/browser.ipc', () => ({
    getBrowserService: () => ({
      destroySessionContext: vi.fn(async () => undefined),
      destroyKnowledgeBaseContext: vi.fn(async () => undefined)
    })
  }))
  vi.doMock('../../agent-workspace/main/agent-session-handler', () => ({
    createManagedProjectAgentSession: vi.fn()
  }))
  vi.doMock('../../agent-workspace/main/agent-skill-settings.service', () => ({
    getDisabledGlobalSkillPaths: vi.fn()
  }))
  vi.doMock('../../agent-workspace/main/agent-skill-paths', () => ({
    resolveAgentSkillPaths: vi.fn()
  }))

  const { registerSessionsIpc } = await import('./sessions.ipc')
  registerSessionsIpc()
  const deleteSession = handlers.get(deleteChannel)
  if (!deleteSession) throw new Error('delete handler was not registered')
  return { deleteSession, events, ptys, repository, terminalService, utilityHost }
}

describe('Sessions IPC terminal cleanup mapping', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('deletes a live Workspace Session through the workspace-session terminal context', async () => {
    const session = createStoredSession()
    const { deleteSession, ptys, terminalService, utilityHost, repository } =
      await setupSessionsIpcHarness({ session })
    const created = await terminalService.create({
      ownerWindowId: 1,
      request: { context: { kind: 'workspace-session', sessionId: session.id } }
    })
    if (created.status !== 'running') throw new Error('expected running terminal')

    await deleteSession({}, { sessionId: session.id })

    expect(ptys).toHaveLength(1)
    expect(ptys[0]?.killed).toBe(true)
    expect(utilityHost.deleteSession).toHaveBeenCalledWith({ sessionId: session.id })
    expect(repository.deleteById).toHaveBeenCalledWith(session.id)
    await expect(
      terminalService.writeInput({
        ownerWindowId: 1,
        request: {
          terminalId: created.terminalId,
          context: { kind: 'workspace-session', sessionId: session.id },
          data: 'still there?'
        }
      })
    ).rejects.toThrow('terminal.notFound')
  })

  it('awaits deferred in-flight Workspace Session terminal shutdown before utility and metadata deletion', async () => {
    const session = createStoredSession()
    let resolveSpawn: ((pty: FakePty) => void) | undefined
    const ptys: FakePty[] = []
    const adapter: TerminalPtyAdapter = {
      spawn: vi.fn(
        () =>
          new Promise<PtyProcess>((resolve) => {
            resolveSpawn = (pty) => {
              ptys.push(pty)
              resolve(pty)
            }
          })
      )
    }
    const { deleteSession, events, terminalService } = await setupSessionsIpcHarness({
      session,
      terminalPty: adapter
    })
    const create = terminalService.create({
      ownerWindowId: 1,
      request: { context: { kind: 'workspace-session', sessionId: session.id } }
    })
    await vi.waitFor(() => expect(adapter.spawn).toHaveBeenCalledTimes(1))

    let deletionResolved = false
    const deletion = deleteSession({}, { sessionId: session.id }).then(() => {
      deletionResolved = true
    })
    await Promise.resolve()
    expect(events).toEqual([])
    expect(deletionResolved).toBe(false)

    resolveSpawn?.(new FakePty(80, 24))
    await create
    await deletion

    expect(ptys[0]?.killed).toBe(true)
    expect(events).toEqual(['utility', 'metadata'])
    expect(deletionResolved).toBe(true)
  })

  it('coalesces concurrent deletion requests into one cleanup and metadata transaction', async () => {
    const session = createStoredSession()
    const { deleteSession, ptys, repository, terminalService, utilityHost } =
      await setupSessionsIpcHarness({ session })
    const created = await terminalService.create({
      ownerWindowId: 1,
      request: { context: { kind: 'workspace-session', sessionId: session.id } }
    })
    if (created.status !== 'running') throw new Error('expected running terminal')

    await Promise.all([
      deleteSession({}, { sessionId: session.id }),
      deleteSession({}, { sessionId: session.id })
    ])

    expect(ptys[0]?.killed).toBe(true)
    expect(utilityHost.deleteSession).toHaveBeenCalledTimes(1)
    expect(repository.deleteById).toHaveBeenCalledTimes(1)
  })

  it('preserves the Knowledge Base managed-chat exception during Session deletion', async () => {
    const session = createStoredSession({
      id: 'knowledge-base-chat-session',
      managedContext: 'knowledge-base'
    })
    const { deleteSession, ptys, terminalService, utilityHost, repository } =
      await setupSessionsIpcHarness({ session })
    const created = await terminalService.create({
      ownerWindowId: 1,
      request: { context: { kind: 'knowledge-base' } }
    })
    if (created.status !== 'running') throw new Error('expected running terminal')

    await deleteSession({}, { sessionId: session.id })

    expect(ptys).toHaveLength(1)
    expect(ptys[0]?.killed).toBe(false)
    expect(utilityHost.deleteSession).toHaveBeenCalledWith({ sessionId: session.id })
    expect(repository.deleteById).toHaveBeenCalledWith(session.id)
    await expect(
      terminalService.writeInput({
        ownerWindowId: 1,
        request: { terminalId: created.terminalId, context: { kind: 'knowledge-base' }, data: 'kb' }
      })
    ).resolves.toBeUndefined()
  })
})

class FakePty extends EventEmitter implements PtyProcess {
  killed = false
  readonly writes: string[] = []

  constructor(
    readonly cols: number,
    readonly rows: number
  ) {
    super()
  }

  write(data: string): void {
    this.writes.push(data)
  }

  resize(): void {
    // No-op for these deletion regressions.
  }

  async kill(): Promise<void> {
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
}
