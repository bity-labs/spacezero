import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  createTerminalService,
  type PersistedTerminalTab,
  type PtyProcess,
  type TerminalPtyAdapter,
  type TerminalTabsRepository
} from './terminal.service'
import type { TerminalContext } from '../shared'

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

function createHarness(tabsRepository = createFakeTabsRepository()) {
  let nextId = 1
  const ptys: FakePty[] = []
  const adapter: TerminalPtyAdapter = {
    spawn: vi.fn(async (request) => {
      const pty = new FakePty(request.cwd)
      ptys.push(pty)
      return pty
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
    tabsRepository,
    createId: () => `id-${nextId++}`,
    resolveShell: () => ({ executable: '/bin/zsh', args: [] }),
    emitToWindow: vi.fn()
  })
  return { adapter, ptys, service, tabsRepository }
}

describe('Terminal tab restoration persistence', () => {
  it('persists tab order, active selection, title, and last validated cwd without output', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'spacezero-terminal-persist-'))
    try {
      const tabsRepository = createFakeTabsRepository()
      const firstRun = createHarness(tabsRepository)
      const first = await firstRun.service.create({ ownerWindowId: 1, request: { context } })
      const second = await firstRun.service.create({
        ownerWindowId: 1,
        request: { context, forceNew: true }
      })
      if (first.status !== 'running' || second.status !== 'running')
        throw new Error('expected tabs')
      firstRun.ptys[0]?.emitData('secret command output\n')
      firstRun.ptys[1]?.emitData(`\u001B]7;file://localhost${cwd}\u0007`)
      await vi.waitFor(() => expect(tabsRepository.rows.some((row) => row.cwd === cwd)).toBe(true))
      await firstRun.service.reorderTabs({
        ownerWindowId: 1,
        request: { context, terminalIds: [second.terminalId, first.terminalId] }
      })
      await firstRun.service.selectTab({
        ownerWindowId: 1,
        request: { context, terminalId: first.terminalId }
      })
      await firstRun.service.closeAll()

      const secondRun = createHarness(tabsRepository)
      const restored = await secondRun.service.create({ ownerWindowId: 2, request: { context } })

      expect(restored.status).toBe('running')
      expect(restored.terminalId).not.toBe(first.terminalId)
      expect(restored.tabs).toEqual([
        { terminalId: 'id-1', title: cwd.split('/').at(-1) },
        { terminalId: 'id-2', title: 'session-1' }
      ])
      expect(restored.activeTerminalId).toBe('id-2')
      expect(secondRun.adapter.spawn).toHaveBeenNthCalledWith(1, expect.objectContaining({ cwd }))
      expect(secondRun.adapter.spawn).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ cwd: session.worktreePath })
      )
      await expect(
        secondRun.service.subscribe({
          ownerWindowId: 2,
          request: { context, terminalId: restored.activeTerminalId ?? '' }
        })
      ).resolves.toMatchObject({ events: [] })
      expect(JSON.stringify(tabsRepository.rows)).not.toContain('secret command output')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('removes restoration records on explicit close, natural exit, and context deletion', async () => {
    const tabsRepository = createFakeTabsRepository()
    const { ptys, service } = createHarness(tabsRepository)
    const first = await service.create({ ownerWindowId: 1, request: { context } })
    const second = await service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    if (first.status !== 'running' || second.status !== 'running') throw new Error('expected tabs')

    await service.close({ ownerWindowId: 1, request: { context, terminalId: first.terminalId } })
    expect(tabsRepository.rows).toHaveLength(1)
    ptys[1]?.emitExit(0)
    await vi.waitFor(() => expect(tabsRepository.rows).toHaveLength(0))

    await service.create({ ownerWindowId: 1, request: { context, forceNew: true } })
    expect(tabsRepository.rows).toHaveLength(1)
    await service.closeAllForContext(context)
    expect(tabsRepository.rows).toHaveLength(0)
  })

  it('falls back to the validated context root when a restored cwd is inaccessible', async () => {
    const tabsRepository = createFakeTabsRepository([
      {
        tabId: 'persisted-tab',
        context,
        order: 0,
        title: 'missing',
        active: true,
        cwd: '/definitely/missing/spacezero/terminal/path'
      }
    ])
    const { adapter, service } = createHarness(tabsRepository)

    await expect(service.create({ ownerWindowId: 1, request: { context } })).resolves.toMatchObject(
      {
        status: 'running',
        tabs: [{ terminalId: 'id-1', title: 'session-1' }]
      }
    )
    expect(adapter.spawn).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: session.worktreePath })
    )
  })
})

function createFakeTabsRepository(
  initialRows: PersistedTerminalTab[] = []
): TerminalTabsRepository & { rows: PersistedTerminalTab[] } {
  const rows = [...initialRows]
  return {
    rows,
    async listByContext(context) {
      return rows
        .filter((row) => sameContext(row.context, context))
        .sort((left, right) => left.order - right.order)
    },
    async upsert(tab) {
      const index = rows.findIndex(
        (row) => sameContext(row.context, tab.context) && row.tabId === tab.tabId
      )
      if (index >= 0) rows[index] = { ...tab }
      else rows.push({ ...tab })
    },
    async updateOrderAndActive(context, orderedTabIds, activeTabId) {
      for (const [order, tabId] of orderedTabIds.entries()) {
        const row = rows.find(
          (candidate) => sameContext(candidate.context, context) && candidate.tabId === tabId
        )
        if (row) {
          row.order = order
          row.active = tabId === activeTabId
        }
      }
    },
    async updateCwdAndTitle(context, tabId, cwd, title) {
      const row = rows.find(
        (candidate) => sameContext(candidate.context, context) && candidate.tabId === tabId
      )
      if (row) Object.assign(row, { cwd, title })
    },
    async deleteTab(context, tabId) {
      const index = rows.findIndex(
        (row) => sameContext(row.context, context) && row.tabId === tabId
      )
      if (index >= 0) rows.splice(index, 1)
    },
    async deleteContext(context) {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (sameContext(rows[index]!.context, context)) rows.splice(index, 1)
      }
    }
  }
}

function sameContext(left: TerminalContext, right: TerminalContext): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'knowledge-base' || right.kind === 'knowledge-base') return true
  return left.sessionId === right.sessionId
}

class FakePty extends EventEmitter implements PtyProcess {
  killed = false

  constructor(readonly cwd: string) {
    super()
  }

  write(): void {}
  resize(): void {}
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
  emitExit(exitCode: number | null): void {
    this.emit('exit', { exitCode, signal: null })
  }
}
