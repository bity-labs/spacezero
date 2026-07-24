import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createNodePtyAdapter } from './node-pty.adapter'
import { createTerminalService } from './terminal.service'
import type { TerminalEvent, TerminalTabUpdatedEvent } from '../shared'

const createdPaths: string[] = []

async function createTempDir(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  createdPaths.push(path)
  return path
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(createdPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('Terminal cwd shell integration with a real PTY', () => {
  it.runIf(process.platform !== 'win32')('reports cwd changes from bash without relying on the builder shell config', async () => {
    await expect(access('/bin/bash')).resolves.toBeUndefined()
    const home = await createTempDir('spacezero-terminal-home-')
    const initialCwd = await createTempDir('spacezero-terminal-initial-')
    const nextCwd = await createTempDir('spacezero-terminal-next-')
    vi.stubEnv('HOME', home)
    vi.stubEnv('ZDOTDIR', '')
    const events: TerminalEvent[] = []
    const service = createTerminalService({
      repository: {
        findSessionById: vi.fn(async () => ({
          id: 'workspace-session-pty',
          kind: 'workspace' as const,
          projectId: null,
          archivedAt: null,
          managedContext: null
        })),
        findProjectById: vi.fn(async () => undefined)
      },
      worktrees: { validate: vi.fn(async () => true) },
      storageSettings: { getSpaceZeroHome: vi.fn(async () => initialCwd) },
      knowledgeBaseRoot: { getVerifiedRoot: vi.fn(async () => initialCwd) },
      pty: createNodePtyAdapter(),
      resolveShell: () => ({ executable: '/bin/bash', args: [] }),
      emitToWindow: (_windowId, event) => events.push(event),
      enableShellIntegration: true
    })

    const context = { kind: 'workspace-session' as const, sessionId: 'workspace-session-pty' }
    const created = await service.create({ ownerWindowId: 1, request: { context } })
    if (created.status !== 'running') throw new Error('expected running terminal')
    await service.subscribe({ ownerWindowId: 1, request: { terminalId: created.terminalId, context } })
    await service.writeInput({
      ownerWindowId: 1,
      request: { terminalId: created.terminalId, context, data: `cd ${nextCwd}\n` }
    })

    await vi.waitFor(() => {
      expect(events).toContainEqual<TerminalTabUpdatedEvent>({
        type: 'tab-updated',
        terminalId: created.terminalId,
        title: basename(nextCwd)
      })
    }, { timeout: 5_000 })

    await service.closeAll()
  })
})
