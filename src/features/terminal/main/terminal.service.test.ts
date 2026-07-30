import { EventEmitter } from 'node:events'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

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
const secondSession = {
  id: 'session-2',
  projectId: project.id,
  worktreePath: '/SpaceZero/worktrees/project-1/session-2',
  worktreeBranch: 'spacezero/session-session-2',
  worktreeBaseRevision: 'def456',
  archivedAt: null
}
const projectHomeContext = { kind: 'project-home' as const, projectId: project.id }
const context = { kind: 'project-session' as const, sessionId: session.id }
const secondProjectContext = { kind: 'project-session' as const, sessionId: secondSession.id }
const workspaceSession = {
  id: 'workspace-session-1',
  kind: 'workspace' as const,
  projectId: null,
  archivedAt: null,
  managedContext: null
}
const secondWorkspaceSession = {
  id: 'workspace-session-2',
  kind: 'workspace' as const,
  projectId: null,
  archivedAt: null,
  managedContext: null
}
const workspaceContext = {
  kind: 'workspace-session' as const,
  sessionId: workspaceSession.id
}
const secondWorkspaceContext = {
  kind: 'workspace-session' as const,
  sessionId: secondWorkspaceSession.id
}
const globalChatContext = { kind: 'global-chat' as const }
const knowledgeBaseContext = { kind: 'knowledge-base' as const }

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
    findSessionById: vi.fn(async (sessionId: string) => {
      if (sessionId === session.id) return session
      if (sessionId === secondSession.id) return secondSession
      if (sessionId === workspaceSession.id) return workspaceSession
      if (sessionId === secondWorkspaceSession.id) return secondWorkspaceSession
      return undefined
    }),
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
    storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
    knowledgeBaseRoot: {
      getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
    },
    pty: adapter,
    createId: () => `terminal-${ptys.length + 1}`,
    resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
    emitToWindow: (_windowId, event) => events.push(event)
  })
  return { adapter, events, ptys, repository, service, worktrees }
}

describe('Terminal service', () => {
  it('launches Project Home at the main-owned registered root without reusing a prior worktree terminal', async () => {
    const { adapter, service, worktrees } = createHarness()

    await service.create({ ownerWindowId: 1, request: { context } })
    const projectHome = await service.create({
      ownerWindowId: 1,
      request: { context: projectHomeContext }
    })

    expect(projectHome).toMatchObject({ status: 'running', terminalId: 'terminal-2' })
    expect(adapter.spawn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cwd: project.path })
    )
    expect(worktrees.validate).toHaveBeenCalledTimes(1)
  })

  it('rejects an unavailable Project Home identity before spawning a PTY', async () => {
    const { adapter, repository, service } = createHarness()
    repository.findProjectById.mockResolvedValueOnce(undefined)

    await expect(
      service.create({ ownerWindowId: 1, request: { context: projectHomeContext } })
    ).rejects.toThrow('terminal.projectNotFound')
    expect(adapter.spawn).not.toHaveBeenCalled()
  })

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

    expect(first).toMatchObject({ status: 'running', terminalId: 'terminal-1' })
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

  it('launches global-chat, workspace-session, and knowledge-base PTYs from main-resolved roots', async () => {
    const { adapter, ptys, service, worktrees } = createHarness()

    await expect(
      service.create({ ownerWindowId: 1, request: { context: globalChatContext } })
    ).resolves.toMatchObject({ status: 'running', terminalId: 'terminal-1' })
    await expect(
      service.create({ ownerWindowId: 1, request: { context: workspaceContext } })
    ).resolves.toMatchObject({ status: 'running', terminalId: 'terminal-2' })
    await expect(
      service.create({ ownerWindowId: 1, request: { context: knowledgeBaseContext } })
    ).resolves.toMatchObject({ status: 'running', terminalId: 'terminal-3' })

    expect(adapter.spawn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ cwd: '/home/builder/SpaceZero' })
    )
    expect(adapter.spawn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cwd: '/home/builder/SpaceZero' })
    )
    expect(adapter.spawn).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ cwd: '/home/builder/SpaceZero/knowledge-base' })
    )
    expect(worktrees.validate).not.toHaveBeenCalled()
    expect(ptys).toHaveLength(3)
  })

  it('keeps terminal identity, PTY, output, and events isolated across project, workspace, and knowledge-base contexts', async () => {
    const { events, ptys, service } = createHarness()
    const contexts = [
      context,
      secondProjectContext,
      workspaceContext,
      secondWorkspaceContext,
      knowledgeBaseContext
    ]
    const terminals: Array<Awaited<ReturnType<typeof service.create>>> = []
    for (const terminalContext of contexts) {
      terminals.push(
        await service.create({ ownerWindowId: 1, request: { context: terminalContext } })
      )
    }
    if (terminals.some((terminal) => terminal.status !== 'running')) {
      throw new Error('expected running terminals')
    }

    for (let index = 0; index < contexts.length; index += 1) {
      const terminal = terminals[index]
      if (terminal.status !== 'running') throw new Error('expected running terminal')
      await service.subscribe({
        ownerWindowId: 1,
        request: { terminalId: terminal.terminalId, context: contexts[index]! }
      })
      ptys[index]?.emitData(`context-${index}\n`)
    }

    expect(events).toEqual(
      terminals.map((terminal, index) => {
        if (terminal.status !== 'running') throw new Error('expected running terminal')
        return {
          type: 'output',
          terminalId: terminal.terminalId,
          sequence: 1,
          data: `context-${index}\n`
        }
      })
    )
    await expect(
      service.writeInput({
        ownerWindowId: 1,
        request: {
          terminalId: terminals[2].status === 'running' ? terminals[2].terminalId : '',
          context,
          data: 'forged'
        }
      })
    ).rejects.toThrow('terminal.notFound')
  })

  it('rejects missing or forged workspace and knowledge-base roots before spawning a PTY', async () => {
    const { adapter, repository, service } = createHarness()
    repository.findSessionById.mockResolvedValueOnce(undefined)
    await expect(
      service.create({ ownerWindowId: 1, request: { context: workspaceContext } })
    ).rejects.toThrow('terminal.workspaceSessionNotFound')

    const failingKnowledgeService = createTerminalService({
      repository,
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => {
          throw new Error('Knowledge Base is not configured.')
        })
      },
      pty: adapter,
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn()
    })
    await expect(
      failingKnowledgeService.create({
        ownerWindowId: 1,
        request: { context: knowledgeBaseContext }
      })
    ).rejects.toThrow('Knowledge Base is not configured.')
    expect(adapter.spawn).not.toHaveBeenCalled()
  })

  it('serializes concurrent creates for the same window/context into one PTY', async () => {
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
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: adapter,
      createId: () => 'terminal-concurrent',
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn()
    })

    const first = service.create({ ownerWindowId: 1, request: { context } })
    const second = service.create({ ownerWindowId: 1, request: { context } })
    await vi.waitFor(() => expect(adapter.spawn).toHaveBeenCalledTimes(1))
    resolveSpawn?.(new FakePty(80, 24))

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 'running', terminalId: 'terminal-concurrent' }),
      expect.objectContaining({ status: 'running', terminalId: 'terminal-concurrent' })
    ])
    expect(adapter.spawn).toHaveBeenCalledTimes(1)
    expect(ptys).toHaveLength(1)
  })

  it('retains an explicit empty state after close or hidden natural exit until forced to create', async () => {
    const { adapter, ptys, service } = createHarness()
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')
    const { terminalId } = created

    await service.close({ ownerWindowId: 1, request: { terminalId, context } })
    await expect(service.create({ ownerWindowId: 1, request: { context } })).resolves.toMatchObject({
      status: 'empty',
      terminalId: null
    })
    expect(adapter.spawn).toHaveBeenCalledTimes(1)

    await expect(
      service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    ).resolves.toMatchObject({ status: 'running', terminalId: 'terminal-2' })
    ptys[1]?.emitExit(0)
    await expect(service.create({ ownerWindowId: 1, request: { context } })).resolves.toMatchObject({
      status: 'empty',
      terminalId: null
    })
    expect(adapter.spawn).toHaveBeenCalledTimes(2)
  })

  it('creates, selects, and reorders multiple tabs without imposing a per-context limit', async () => {
    const { ptys, service } = createHarness()

    const first = await service.create({ ownerWindowId: 1, request: { context } })
    const second = await service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    const third = await service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    if (first.status !== 'running' || second.status !== 'running' || third.status !== 'running') {
      throw new Error('expected running terminals')
    }

    expect(ptys).toHaveLength(3)
    expect(third.tabs?.map((tab) => tab.terminalId)).toEqual([
      first.terminalId,
      second.terminalId,
      third.terminalId
    ])
    expect(third.activeTerminalId).toBe(third.terminalId)

    await expect(
      service.selectTab({
        ownerWindowId: 1,
        request: { terminalId: first.terminalId, context }
      })
    ).resolves.toMatchObject({ activeTerminalId: first.terminalId })

    await expect(
      service.reorderTabs({
        ownerWindowId: 1,
        request: { context, terminalIds: [third.terminalId, first.terminalId, second.terminalId] }
      })
    ).resolves.toMatchObject({
      activeTerminalId: first.terminalId,
      tabs: [
        { terminalId: third.terminalId, title: 'session-1' },
        { terminalId: first.terminalId, title: 'session-1' },
        { terminalId: second.terminalId, title: 'session-1' }
      ]
    })
  })

  it('rejects duplicate or incomplete reorder payloads without changing reachable tabs', async () => {
    const { service } = createHarness()
    const first = await service.create({ ownerWindowId: 1, request: { context } })
    const second = await service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    if (first.status !== 'running' || second.status !== 'running') throw new Error('expected tabs')

    await expect(
      service.reorderTabs({
        ownerWindowId: 1,
        request: { context, terminalIds: [first.terminalId, first.terminalId] }
      })
    ).rejects.toThrow('terminal.notFound')
    await expect(
      service.reorderTabs({
        ownerWindowId: 1,
        request: { context, terminalIds: [first.terminalId] }
      })
    ).rejects.toThrow('terminal.notFound')

    await expect(service.listTabs({ ownerWindowId: 1, request: { context } })).resolves.toEqual({
      activeTerminalId: second.terminalId,
      tabs: [
        { terminalId: first.terminalId, title: 'session-1' },
        { terminalId: second.terminalId, title: 'session-1' }
      ]
    })
  })

  it('keeps inactive tab output running in the background and resizes only the selected tab', async () => {
    const { ptys, service } = createHarness()
    const first = await service.create({ ownerWindowId: 1, request: { context } })
    const second = await service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    if (first.status !== 'running' || second.status !== 'running') throw new Error('expected tabs')

    await service.selectTab({ ownerWindowId: 1, request: { terminalId: first.terminalId, context } })
    await service.subscribe({ ownerWindowId: 1, request: { terminalId: first.terminalId, context } })
    await service.unsubscribe({ ownerWindowId: 1, request: { terminalId: first.terminalId, context } })
    ptys[0]?.emitData('background one\n')
    ptys[1]?.emitData('background two\n')

    const replay = await service.subscribe({
      ownerWindowId: 1,
      request: { terminalId: first.terminalId, context }
    })
    await service.resize({ ownerWindowId: 1, request: { terminalId: first.terminalId, context, cols: 120, rows: 40 } })

    expect(replay.events).toEqual([
      { type: 'output', terminalId: first.terminalId, sequence: 1, data: 'background one\n' }
    ])
    expect(ptys[0]?.resizes).toEqual([{ cols: 120, rows: 40 }])
    expect(ptys[1]?.resizes).toEqual([])
  })

  it('closes one tab without terminating sibling tabs and leaves the final close in the empty state', async () => {
    const { ptys, service } = createHarness()
    const first = await service.create({ ownerWindowId: 1, request: { context } })
    const second = await service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    if (first.status !== 'running' || second.status !== 'running') throw new Error('expected tabs')

    const closeSnapshot = await service.close({
      ownerWindowId: 1,
      request: { terminalId: first.terminalId, context }
    })
    expect(ptys.map((pty) => pty.killed)).toEqual([true, false])
    expect(closeSnapshot).toMatchObject({
      activeTerminalId: second.terminalId,
      tabs: [{ terminalId: second.terminalId, title: 'session-1' }]
    })
    await expect(
      service.listTabs({ ownerWindowId: 1, request: { context } })
    ).resolves.toMatchObject(closeSnapshot)

    ptys[1]?.emitExit(0)
    await expect(service.create({ ownerWindowId: 1, request: { context } })).resolves.toMatchObject({
      status: 'empty',
      terminalId: null,
      tabs: []
    })
  })

  it('forwards input unchanged, resizes valid PTYs, and rejects forged window or context ownership', async () => {
    const { ptys, service } = createHarness()
    const created = await service.create({
      ownerWindowId: 1,
      request: { context, cols: 80, rows: 24 }
    })
    if (created.status !== 'running') throw new Error('expected running terminal')
    const { terminalId } = created

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
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')
    const { terminalId } = created

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
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
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
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')
    const { terminalId } = created
    const pty = ptys[0]

    pty.emitData('one\n')
    pty.emitData('two\n')
    pty.emitData('three\n')
    pty.emitData('0123456789abcdef')

    const replay = await service.subscribe({ ownerWindowId: 1, request: { terminalId, context } })
    expect(replay.events).toEqual([
      { type: 'output', terminalId, sequence: 4, data: '456789abcdef' }
    ])
    expect(replay.oldestSequence).toBe(4)
  })

  it('trims a single oversized chunk to the retained line limit', async () => {
    const ptys: FakePty[] = []
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: {
        spawn: vi.fn(async () => {
          const pty = new FakePty(80, 24)
          ptys.push(pty)
          return pty
        })
      },
      createId: () => 'terminal-line-evict',
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn(),
      maxRetainedLines: 2,
      maxRetainedBytes: 100
    })
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')
    const { terminalId } = created

    ptys[0]?.emitData('one\ntwo\nthree\n')

    const replay = await service.subscribe({ ownerWindowId: 1, request: { terminalId, context } })
    expect(replay.events).toEqual([
      { type: 'output', terminalId, sequence: 1, data: 'two\nthree\n' }
    ])
  })

  it('closes the PTY on user close and removes it after natural shell exit', async () => {
    const { events, ptys, service } = createHarness()
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')
    const { terminalId } = created
    await service.subscribe({ ownerWindowId: 1, request: { terminalId, context } })

    await service.close({ ownerWindowId: 1, request: { terminalId, context } })

    expect(ptys[0]?.killed).toBe(true)
    await expect(
      service.writeInput({ ownerWindowId: 1, request: { terminalId, context, data: 'again' } })
    ).rejects.toThrow('terminal.notFound')

    const next = await service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    if (next.status !== 'running') throw new Error('expected running terminal')
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

  it('rejects operations once the owning context is being deleted', async () => {
    const { ptys, service } = createHarness()
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')
    const { terminalId } = created

    await service.closeAllForContext(context)

    await expect(
      service.writeInput({ ownerWindowId: 1, request: { terminalId, context, data: 'again' } })
    ).rejects.toThrow('terminal.notFound')
    await expect(
      service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    ).rejects.toThrow('terminal.contextDeleting')
    expect(ptys[0]?.killed).toBe(true)
  })

  it('reports aggregate live terminal counts for shutdown and context deletion prompts', async () => {
    const { service } = createHarness()
    await service.create({ ownerWindowId: 1, request: { context } })
    await service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    await service.create({ ownerWindowId: 1, request: { context: workspaceContext } })

    expect(service.countLiveTerminals()).toBe(3)
    expect(service.countLiveTerminalsForContext(context)).toBe(2)
    expect(service.countLiveTerminalsForContext(workspaceContext)).toBe(1)
    expect(service.countLiveTerminalsForContext(knowledgeBaseContext)).toBe(0)

    await service.closeAllForContext(context)

    expect(service.countLiveTerminals()).toBe(1)
    expect(service.countLiveTerminalsForContext(context)).toBe(0)
    expect(service.countLiveTerminalsForContext(workspaceContext)).toBe(1)
  })

  it('re-authenticates an existing terminal owner before returning a live record', async () => {
    const { repository, service } = createHarness()
    await expect(
      service.create({ ownerWindowId: 1, request: { context: workspaceContext } })
    ).resolves.toMatchObject({ status: 'running', terminalId: 'terminal-1' })

    repository.findSessionById.mockResolvedValueOnce(undefined)

    await expect(
      service.create({ ownerWindowId: 1, request: { context: workspaceContext } })
    ).rejects.toThrow('terminal.workspaceSessionNotFound')
  })

  it('closes live workspace-session terminals without touching project-session or knowledge-base terminals', async () => {
    const { ptys, service } = createHarness()
    const projectTerminal = await service.create({ ownerWindowId: 1, request: { context } })
    const workspaceTerminal = await service.create({
      ownerWindowId: 1,
      request: { context: workspaceContext }
    })
    const knowledgeBaseTerminal = await service.create({
      ownerWindowId: 1,
      request: { context: knowledgeBaseContext }
    })
    if (
      projectTerminal.status !== 'running' ||
      workspaceTerminal.status !== 'running' ||
      knowledgeBaseTerminal.status !== 'running'
    ) {
      throw new Error('expected running terminals')
    }

    await service.closeAllForContext(workspaceContext)

    expect(ptys.map((pty) => pty.killed)).toEqual([false, true, false])
    await expect(
      service.writeInput({
        ownerWindowId: 1,
        request: {
          terminalId: workspaceTerminal.terminalId,
          context: workspaceContext,
          data: 'again'
        }
      })
    ).rejects.toThrow('terminal.notFound')
    await expect(
      service.writeInput({
        ownerWindowId: 1,
        request: { terminalId: projectTerminal.terminalId, context, data: 'project' }
      })
    ).resolves.toBeUndefined()
    await expect(
      service.writeInput({
        ownerWindowId: 1,
        request: {
          terminalId: knowledgeBaseTerminal.terminalId,
          context: knowledgeBaseContext,
          data: 'knowledge'
        }
      })
    ).resolves.toBeUndefined()
  })

  it('kills and rejects an in-flight create that completes after context deletion starts', async () => {
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
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: adapter,
      createId: () => 'terminal-raced-create',
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn()
    })

    const create = service.create({ ownerWindowId: 1, request: { context } })
    await vi.waitFor(() => expect(adapter.spawn).toHaveBeenCalledTimes(1))
    const cleanup = service.closeAllForContext(context)
    resolveSpawn?.(new FakePty(80, 24))

    await expect(create).rejects.toThrow('terminal.contextDeleting')
    await cleanup
    expect(ptys[0]?.killed).toBe(true)
    await expect(service.create({ ownerWindowId: 1, request: { context } })).rejects.toThrow(
      'terminal.contextDeleting'
    )
  })

  it('awaits and terminates every concurrent forced create during context deletion', async () => {
    const resolvers: Array<(pty: FakePty) => void> = []
    const ptys: FakePty[] = []
    const adapter: TerminalPtyAdapter = {
      spawn: vi.fn(
        () =>
          new Promise<PtyProcess>((resolve) => {
            resolvers.push((pty) => {
              ptys.push(pty)
              resolve(pty)
            })
          })
      )
    }
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: adapter,
      createId: () => `terminal-forced-${resolvers.length}`,
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn()
    })

    const first = service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    const second = service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    await vi.waitFor(() => expect(adapter.spawn).toHaveBeenCalledTimes(2))
    let cleanupResolved = false
    const cleanup = service.closeAllForContext(context).then(() => {
      cleanupResolved = true
    })

    resolvers[0]?.(new FakePty(80, 24))
    await expect(first).rejects.toThrow('terminal.contextDeleting')
    await Promise.resolve()
    expect(cleanupResolved).toBe(false)
    resolvers[1]?.(new FakePty(80, 24))
    await expect(second).rejects.toThrow('terminal.contextDeleting')
    await cleanup
    expect(ptys.map((pty) => pty.killed)).toEqual([true, true])
    expect(cleanupResolved).toBe(true)
  })

  it('kills and rejects an in-flight workspace-session create when that Session is deleted', async () => {
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
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => workspaceSession),
        findProjectById: vi.fn(async () => undefined)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: adapter,
      createId: () => 'terminal-raced-workspace-create',
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn()
    })

    const create = service.create({ ownerWindowId: 1, request: { context: workspaceContext } })
    await vi.waitFor(() => expect(adapter.spawn).toHaveBeenCalledTimes(1))
    const cleanup = service.closeAllForContext(workspaceContext)
    resolveSpawn?.(new FakePty(80, 24))

    await expect(create).rejects.toThrow('terminal.contextDeleting')
    await cleanup
    expect(ptys[0]?.killed).toBe(true)
    await expect(
      service.create({ ownerWindowId: 1, request: { context: workspaceContext } })
    ).rejects.toThrow('terminal.contextDeleting')
  })

  it('waits for an already-started close before context deletion resolves', async () => {
    const ptys: DeferredKillPty[] = []
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: {
        spawn: vi.fn(async () => {
          const pty = new DeferredKillPty(80, 24)
          ptys.push(pty)
          return pty
        })
      },
      createId: () => 'terminal-close-delete-race',
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn()
    })
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')

    const close = service.close({
      ownerWindowId: 1,
      request: { terminalId: created.terminalId, context }
    })
    await vi.waitFor(() => expect(ptys[0]?.killStarted).toBe(true))
    let cleanupResolved = false
    const cleanup = service.closeAllForContext(context).then(() => {
      cleanupResolved = true
    })

    await Promise.resolve()
    expect(cleanupResolved).toBe(false)
    ptys[0]?.resolveKill()
    await Promise.all([close, cleanup])
    expect(cleanupResolved).toBe(true)
  })

  it('propagates a raced-create termination failure during context deletion', async () => {
    let resolveSpawn: ((pty: PtyProcess) => void) | undefined
    const adapter: TerminalPtyAdapter = {
      spawn: vi.fn(
        () =>
          new Promise<PtyProcess>((resolve) => {
            resolveSpawn = resolve
          })
      )
    }
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: adapter,
      createId: () => 'terminal-raced-create-kill-fails',
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn()
    })

    const create = service.create({ ownerWindowId: 1, request: { context } })
    await vi.waitFor(() => expect(adapter.spawn).toHaveBeenCalledTimes(1))
    const cleanup = service.closeAllForContext(context)
    resolveSpawn?.(new RejectingKillPty(80, 24))

    await expect(Promise.all([create, cleanup])).rejects.toThrow('terminal.killFailed')
  })

  it('retries a failed shutdown before context deletion can complete', async () => {
    const ptys: FailsOnceKillPty[] = []
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: {
        spawn: vi.fn(async () => {
          const pty = new FailsOnceKillPty(80, 24)
          ptys.push(pty)
          return pty
        })
      },
      createId: () => 'terminal-retry-kill',
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn()
    })
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')

    await expect(service.closeAllForContext(context)).rejects.toThrow('terminal.killFailed')
    expect(ptys[0]?.killAttempts).toBe(1)
    expect(service.countLiveTerminals()).toBe(1)
    expect(service.countLiveTerminalsForContext(context)).toBe(1)

    await service.closeAllForContext(context)
    expect(ptys[0]?.killAttempts).toBe(2)
    await expect(service.closeAllForContext(context)).resolves.toBeUndefined()
  })

  it('keeps failed app shutdowns visible and retryable through closeAll', async () => {
    const ptys: FailsOnceKillPty[] = []
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: {
        spawn: vi.fn(async () => {
          const pty = new FailsOnceKillPty(80, 24)
          ptys.push(pty)
          return pty
        })
      },
      createId: () => 'terminal-app-shutdown-retry',
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn()
    })
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')

    await expect(service.closeAll()).rejects.toThrow('terminal.killFailed')
    expect(ptys[0]?.killAttempts).toBe(1)
    expect(service.countLiveTerminals()).toBe(1)

    await service.closeAll()
    expect(ptys[0]?.killAttempts).toBe(2)
    expect(service.countLiveTerminals()).toBe(0)
  })

  it('preserves input and resize invocation order while older operations are pending', async () => {
    const { ptys, service } = createHarness()
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')
    const { terminalId } = created

    const first = service.writeInput({
      ownerWindowId: 1,
      request: { terminalId, context, data: 'first' }
    })
    const second = service.writeInput({
      ownerWindowId: 1,
      request: { terminalId, context, data: 'second' }
    })
    const resize = service.resize({
      ownerWindowId: 1,
      request: { terminalId, context, cols: 120, rows: 40 }
    })

    await Promise.all([second, resize, first])

    expect(ptys[0]?.writes).toEqual(['first', 'second'])
    expect(ptys[0]?.resizes).toEqual([{ cols: 120, rows: 40 }])
  })

  it('does not let an older unsubscribe disable a newer subscription', async () => {
    const { events, ptys, service } = createHarness()
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')
    const { terminalId } = created
    await service.subscribe({ ownerWindowId: 1, request: { terminalId, context } })

    const staleUnsubscribe = service.unsubscribe({
      ownerWindowId: 1,
      request: { terminalId, context }
    })
    const newerSubscribe = service.subscribe({ ownerWindowId: 1, request: { terminalId, context } })
    await Promise.all([newerSubscribe, staleUnsubscribe])
    ptys[0]?.emitData('live\n')

    expect(events).toContainEqual({ type: 'output', terminalId, sequence: 1, data: 'live\n' })
  })

  it('trims a single multibyte chunk without exceeding the hard byte limit', async () => {
    const ptys: FakePty[] = []
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: {
        spawn: vi.fn(async () => {
          const pty = new FakePty(80, 24)
          ptys.push(pty)
          return pty
        })
      },
      createId: () => 'terminal-multibyte-evict',
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn(),
      maxRetainedLines: 10_000,
      maxRetainedBytes: 10
    })
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')
    const { terminalId } = created

    ptys[0]?.emitData(`abcdefghi${'€'.repeat(3)}`)

    const replay = await service.subscribe({ ownerWindowId: 1, request: { terminalId, context } })
    const retained = replay.events
      .filter((event) => event.type === 'output')
      .map((event) => event.data)
      .join('')
    expect(Buffer.byteLength(retained, 'utf8')).toBeLessThanOrEqual(10)
    expect(retained).not.toContain('�')
  })

  it('updates tab labels from validated OSC 7 cwd reports, including outside-root directories', async () => {
    const outsideRoot = await mkdtemp(join(tmpdir(), 'spacezero-terminal-outside-'))
    try {
      const { events, ptys, service } = createHarness()
      const created = await service.create({ ownerWindowId: 1, request: { context } })
      if (created.status !== 'running') throw new Error('expected running terminal')
      const { terminalId } = created
      await service.subscribe({ ownerWindowId: 1, request: { terminalId, context } })

      ptys[0]?.emitData(`\u001B]7;file://localhost${outsideRoot}\u0007`)
      await vi.waitFor(() =>
        expect(events).toContainEqual({ type: 'tab-updated', terminalId, title: outsideRoot.split('/').at(-1) })
      )

      await expect(service.listTabs({ ownerWindowId: 1, request: { context } })).resolves.toEqual({
        tabs: [{ terminalId, title: outsideRoot.split('/').at(-1) }],
        activeTerminalId: terminalId
      })
    } finally {
      await rm(outsideRoot, { recursive: true, force: true })
    }
  })

  it('parses OSC 7 cwd reports across PTY chunks and coalesced sequences with bounded malformed reset', async () => {
    const firstCwd = await mkdtemp(join(tmpdir(), 'spacezero-terminal-stream-first-'))
    const secondCwd = await mkdtemp(join(tmpdir(), 'spacezero-terminal-stream-second-'))
    try {
      const { events, ptys, service } = createHarness()
      const created = await service.create({ ownerWindowId: 1, request: { context } })
      if (created.status !== 'running') throw new Error('expected running terminal')
      const { terminalId } = created
      await service.subscribe({ ownerWindowId: 1, request: { terminalId, context } })

      ptys[0]?.emitData('\u001B]7;file://localhost')
      ptys[0]?.emitData(`${firstCwd}\u0007`)
      await vi.waitFor(() =>
        expect(events).toContainEqual({
          type: 'tab-updated',
          terminalId,
          title: firstCwd.split('/').at(-1)
        })
      )

      ptys[0]?.emitData(`\u001B]7;${'x'.repeat(4092)}`)
      ptys[0]?.emitData(
        `\u001B]7;file://localhost${secondCwd}\u0007\u001B]7;not-a-file-url\u0007`
      )
      await vi.waitFor(() =>
        expect(events).toContainEqual({
          type: 'tab-updated',
          terminalId,
          title: secondCwd.split('/').at(-1)
        })
      )
    } finally {
      await rm(firstCwd, { recursive: true, force: true })
      await rm(secondCwd, { recursive: true, force: true })
    }
  })

  it('resynchronizes an at-limit malformed OSC 7 buffer when the replacement prefix is split across PTY chunks', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'spacezero-terminal-stream-split-'))
    try {
      const { events, ptys, service } = createHarness()
      const created = await service.create({ ownerWindowId: 1, request: { context } })
      if (created.status !== 'running') throw new Error('expected running terminal')
      const { terminalId } = created
      await service.subscribe({ ownerWindowId: 1, request: { terminalId, context } })

      ptys[0]?.emitData(`\u001B]7;${'x'.repeat(4092)}`)
      ptys[0]?.emitData('\u001B]')
      ptys[0]?.emitData(`7;file://localhost${cwd}\u0007`)
      await vi.waitFor(() =>
        expect(events).toContainEqual({
          type: 'tab-updated',
          terminalId,
          title: cwd.split('/').at(-1)
        })
      )
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('ignores malformed, stale, inaccessible, and cross-context cwd reports without changing the last valid label', async () => {
    const validCwd = await mkdtemp(join(tmpdir(), 'spacezero-terminal-valid-'))
    try {
      const { ptys, service } = createHarness()
      const first = await service.create({ ownerWindowId: 1, request: { context } })
      const second = await service.create({ ownerWindowId: 1, request: { context: secondProjectContext } })
      if (first.status !== 'running' || second.status !== 'running') throw new Error('expected running terminals')

      ptys[0]?.emitData('\u001B]7;not-a-file-url\u0007')
      ptys[0]?.emitData('\u001B]7;file://localhost/no/such/spacezero/path\u0007')
      ptys[1]?.emitData(`\u001B]7;file://localhost${validCwd}\u0007`)
      await vi.waitFor(async () =>
        expect(await service.listTabs({ ownerWindowId: 1, request: { context: secondProjectContext } })).toEqual({
          tabs: [{ terminalId: second.terminalId, title: validCwd.split('/').at(-1) }],
          activeTerminalId: second.terminalId
        })
      )

      await expect(service.listTabs({ ownerWindowId: 1, request: { context } })).resolves.toEqual({
        tabs: [{ terminalId: first.terminalId, title: 'session-1' }],
        activeTerminalId: first.terminalId
      })
    } finally {
      await rm(validCwd, { recursive: true, force: true })
    }
  })

  it('adds cwd shell integration only for supported shells when enabled', async () => {
    const { adapter, service } = createHarness()
    const integratedService = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: adapter,
      createId: () => 'terminal-integrated',
      resolveShell: () => ({ executable: '/bin/bash', args: [] }),
      emitToWindow: vi.fn(),
      enableShellIntegration: true
    })

    await integratedService.create({ ownerWindowId: 1, request: { context } })

    expect(adapter.spawn).toHaveBeenCalledWith(
      expect.objectContaining({ shell: '/bin/bash', args: expect.arrayContaining(['--rcfile']) })
    )
    expect(service).toBeDefined()
  })

  it.each([
    ['/bin/zsh', []],
    ['/usr/bin/fish', ['--init-command']],
    ['C:/Program Files/PowerShell/7/pwsh.exe', ['-NoExit', '-Command']],
    ['C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoExit', '-Command']]
  ])('adds cwd shell integration for supported adapter %s', async (executable, expectedArgs) => {
    const { adapter } = createHarness()
    const integratedService = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: adapter,
      createId: () => `terminal-integrated-${executable}`,
      resolveShell: () => ({ executable, args: ['--user-arg'] }),
      emitToWindow: vi.fn(),
      enableShellIntegration: true
    })

    await integratedService.create({ ownerWindowId: 1, request: { context } })

    const spawnRequest = vi.mocked(adapter.spawn).mock.calls.at(-1)?.[0]
    expect(spawnRequest?.shell).toBe(executable)
    for (const arg of expectedArgs) expect(spawnRequest?.args).toContain(arg)
    expect(spawnRequest?.args).toContain('--user-arg')
  })

  it('removes a bash shell-integration directory when the terminal is closed', async () => {
    const { adapter } = createHarness()
    let nextId = 1
    const integratedService = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: adapter,
      createId: () => `terminal-integrated-close-${nextId++}`,
      resolveShell: () => ({ executable: '/bin/bash', args: [] }),
      emitToWindow: vi.fn(),
      enableShellIntegration: true
    })

    const first = await integratedService.create({ ownerWindowId: 1, request: { context } })
    const second = await integratedService.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    if (first.status !== 'running' || second.status !== 'running') throw new Error('expected running terminals')
    const [firstRcfile, secondRcfile] = vi
      .mocked(adapter.spawn)
      .mock.calls.map((call) => call[0].args.at(1))
    if (!firstRcfile || !secondRcfile) throw new Error('expected integration rcfiles')
    const firstIntegrationDir = firstRcfile.replace(/\/bashrc$/, '')
    const secondIntegrationDir = secondRcfile.replace(/\/bashrc$/, '')
    await expect(pathExists(firstIntegrationDir)).resolves.toBe(true)
    await expect(pathExists(secondIntegrationDir)).resolves.toBe(true)

    await integratedService.close({
      ownerWindowId: 1,
      request: { terminalId: first.terminalId, context }
    })

    await expect(pathExists(firstIntegrationDir)).resolves.toBe(false)
    await expect(pathExists(secondIntegrationDir)).resolves.toBe(true)
    await integratedService.close({
      ownerWindowId: 1,
      request: { terminalId: second.terminalId, context }
    })
    await expect(pathExists(secondIntegrationDir)).resolves.toBe(false)
  })

  it('removes a zsh shell-integration directory after natural terminal exit', async () => {
    const { adapter, ptys } = createHarness()
    const integratedService = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: adapter,
      createId: () => 'terminal-integrated-exit',
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn(),
      enableShellIntegration: true
    })

    const created = await integratedService.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')
    const integrationDir = vi.mocked(adapter.spawn).mock.calls.at(-1)?.[0].env.ZDOTDIR
    if (!integrationDir) throw new Error('expected integration ZDOTDIR')
    await expect(pathExists(integrationDir)).resolves.toBe(true)

    ptys[0]?.emitExit(0)

    await vi.waitFor(async () => expect(await pathExists(integrationDir)).toBe(false))
  })

  it.each([
    ['/bin/bash', 'bashrc'],
    ['/bin/zsh', '.zshenv']
  ])(
    'removes a %s shell-integration directory when startup-file creation fails',
    async (executable, startupFileName) => {
      const { adapter } = createHarness()
      let startupFile: string | undefined
      const integratedService = createTerminalService({
        repository: {
          findSessionById: vi.fn(async () => session),
          findProjectById: vi.fn(async () => project)
        },
        worktrees: { validate: vi.fn(async () => true) },
        storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
        knowledgeBaseRoot: {
          getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
        },
        pty: adapter,
        createId: () => `terminal-${executable}`,
        resolveShell: () => ({ executable, args: [] }),
        emitToWindow: vi.fn(),
        enableShellIntegration: true,
        writeShellIntegrationFile: vi.fn(async (file) => {
          startupFile = file
          throw new Error('ENOSPC')
        })
      })

      await expect(
        integratedService.create({ ownerWindowId: 1, request: { context } })
      ).rejects.toThrow('ENOSPC')

      expect(startupFile).toBeDefined()
      expect(startupFile).toEqual(expect.stringContaining(startupFileName))
      await expect(pathExists(dirname(startupFile!))).resolves.toBe(false)
      expect(adapter.spawn).not.toHaveBeenCalled()
    }
  )

  it('removes a shell-integration directory when shell launch fails', async () => {
    let integrationDir: string | undefined
    const adapter: TerminalPtyAdapter = {
      spawn: vi.fn(async (request) => {
        integrationDir = request.env.ZDOTDIR
        throw new Error('ENOENT')
      })
    }
    const integratedService = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: adapter,
      resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
      emitToWindow: vi.fn(),
      enableShellIntegration: true
    })

    await expect(integratedService.create({ ownerWindowId: 1, request: { context } })).rejects.toThrow(
      'terminal.shellLaunchFailed'
    )

    expect(integrationDir).toBeDefined()
    await expect(pathExists(integrationDir!)).resolves.toBe(false)
  })

  it('leaves unsupported shell launch requests unchanged when cwd integration is enabled', async () => {
    const { adapter } = createHarness()
    const integratedService = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => session),
        findProjectById: vi.fn(async () => project)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
      pty: adapter,
      createId: () => 'terminal-unsupported-shell',
      resolveShell: () => ({ executable: '/bin/ksh', args: ['-l'] }),
      emitToWindow: vi.fn(),
      enableShellIntegration: true
    })

    await integratedService.create({ ownerWindowId: 1, request: { context } })

    expect(adapter.spawn).toHaveBeenCalledWith(
      expect.objectContaining({ shell: '/bin/ksh', args: ['-l'] })
    )
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
      storageSettings: { getSpaceZeroHome: vi.fn(async () => '/home/builder/SpaceZero') },
      knowledgeBaseRoot: {
        getVerifiedRoot: vi.fn(async () => '/home/builder/SpaceZero/knowledge-base')
      },
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

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

  emitData(data: string): void {
    this.emit('data', data)
  }

  emitExit(exitCode: number | null, signal: number | string | null = null): void {
    this.emit('exit', { exitCode, signal })
  }
}

class DeferredKillPty extends FakePty {
  killStarted = false
  private resolveKillPromise: (() => void) | undefined

  override async kill(): Promise<void> {
    this.killStarted = true
    this.killed = true
    await new Promise<void>((resolve) => {
      this.resolveKillPromise = resolve
    })
  }

  resolveKill(): void {
    this.resolveKillPromise?.()
  }
}

class RejectingKillPty extends FakePty {
  override async kill(): Promise<void> {
    this.killed = true
    throw new Error('terminal.killFailed')
  }
}

class FailsOnceKillPty extends FakePty {
  killAttempts = 0

  override async kill(): Promise<void> {
    this.killAttempts += 1
    this.killed = true
    if (this.killAttempts === 1) throw new Error('terminal.killFailed')
  }
}
