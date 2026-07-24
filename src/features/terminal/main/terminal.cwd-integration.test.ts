import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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

function commandPath(command: string): string | null {
  const result =
    process.platform === 'win32'
      ? spawnSync('where.exe', [command], { encoding: 'utf8' })
      : spawnSync('sh', ['-lc', `command -v ${command}`], { encoding: 'utf8' })
  if (result.status !== 0) return null
  return result.stdout.trim().split(/\r?\n/)[0] || null
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

async function exerciseCwdReporting({
  shell,
  command
}: {
  shell: string
  command: (nextCwd: string) => string
}): Promise<TerminalEvent[]> {
  const initialCwd = await createTempDir('spacezero-terminal-initial-')
  const nextCwd = await createTempDir('spacezero-terminal-next-')
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
    resolveShell: () => ({ executable: shell, args: [] }),
    emitToWindow: (_windowId, event) => events.push(event),
    enableShellIntegration: true
  })

  const context = { kind: 'workspace-session' as const, sessionId: 'workspace-session-pty' }
  const created = await service.create({ ownerWindowId: 1, request: { context } })
  if (created.status !== 'running') throw new Error('expected running terminal')
  await service.subscribe({ ownerWindowId: 1, request: { terminalId: created.terminalId, context } })
  await service.writeInput({
    ownerWindowId: 1,
    request: { terminalId: created.terminalId, context, data: command(nextCwd) }
  })

  await vi.waitFor(
    () => {
      expect(events).toContainEqual<TerminalTabUpdatedEvent>({
        type: 'tab-updated',
        terminalId: created.terminalId,
        title: basename(nextCwd)
      })
    },
    { timeout: 5_000 }
  )

  await service.closeAll()
  return events
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(createdPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('Terminal cwd shell integration with a real PTY', () => {
  const bash = process.platform === 'win32' ? null : commandPath('bash')
  const zsh = process.platform === 'win32' ? null : commandPath('zsh')
  const fish = process.platform === 'win32' ? null : commandPath('fish')
  const pwsh = commandPath('pwsh')
  const windowsPowerShell = process.platform === 'win32' ? commandPath('powershell.exe') : null

  it.runIf(bash)('reports cwd changes from bash without relying on the builder shell config', async () => {
    const home = await createTempDir('spacezero-terminal-home-')
    vi.stubEnv('HOME', home)
    vi.stubEnv('ZDOTDIR', '')

    await exerciseCwdReporting({
      shell: bash!,
      command: (nextCwd) => `cd ${shellQuote(nextCwd)}\n`
    })
  })

  it.runIf(zsh)('preserves zsh .zshenv/.zshrc startup and reports cwd changes', async () => {
    const home = await createTempDir('spacezero-terminal-zsh-home-')
    await writeFile(join(home, '.zshenv'), 'export SPACEZERO_ZSHENV_MARKER=env-ok\n', 'utf8')
    await writeFile(join(home, '.zshrc'), 'export SPACEZERO_ZSHRC_MARKER=rc-ok\n', 'utf8')
    vi.stubEnv('HOME', home)
    vi.stubEnv('ZDOTDIR', '')

    const events = await exerciseCwdReporting({
      shell: zsh!,
      command: (nextCwd) =>
        `print -r -- "MARKERS:$SPACEZERO_ZSHENV_MARKER:$SPACEZERO_ZSHRC_MARKER:$${'{'}ZDOTDIR:-unset${'}'}"\ncd ${shellQuote(nextCwd)}\n`
    })

    const output = events
      .filter((event) => event.type === 'output')
      .map((event) => event.data)
      .join('')
    expect(output).toContain('MARKERS:env-ok:rc-ok:unset')
  })

  it.runIf(fish)('reports cwd changes from fish', async () => {
    const home = await createTempDir('spacezero-terminal-fish-home-')
    vi.stubEnv('HOME', home)

    await exerciseCwdReporting({
      shell: fish!,
      command: (nextCwd) => `cd ${shellQuote(nextCwd)}\n`
    })
  })

  it.runIf(pwsh)('reports cwd changes from PowerShell Core', async () => {
    await exerciseCwdReporting({
      shell: pwsh!,
      command: (nextCwd) => `Set-Location -LiteralPath ${shellQuote(nextCwd)}\r\n`
    })
  })

  it.runIf(windowsPowerShell)('reports cwd changes from Windows PowerShell', async () => {
    await exerciseCwdReporting({
      shell: windowsPowerShell!,
      command: (nextCwd) => `Set-Location -LiteralPath '${nextCwd.replaceAll("'", "''")}'\r\n`
    })
  })
})
