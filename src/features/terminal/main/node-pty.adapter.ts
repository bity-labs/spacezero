import { execFileSync } from 'node:child_process'
import { chmod } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import type { IPty } from 'node-pty'

import type { PtyProcess, TerminalPtyAdapter } from './terminal.service'

const require = createRequire(import.meta.url)

export function createNodePtyAdapter(): TerminalPtyAdapter {
  return {
    async spawn(request) {
      await ensureDarwinSpawnHelperExecutable()
      const nodePty = await import('node-pty')
      const pty = nodePty.spawn(request.shell, request.args, {
        name: 'xterm-256color',
        cwd: request.cwd,
        cols: request.cols,
        rows: request.rows,
        env: {
          ...request.env,
          TERM: request.env.TERM ?? 'xterm-256color',
          COLORTERM: request.env.COLORTERM ?? 'truecolor'
        }
      })
      return toPtyProcess(pty)
    }
  }
}

async function ensureDarwinSpawnHelperExecutable(): Promise<void> {
  if (process.platform !== 'darwin') return
  try {
    const packageRoot = dirname(require.resolve('node-pty/package.json'))
    await chmod(join(packageRoot, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper'), 0o755)
  } catch {
    // Packaging may already preserve executable bits or place native helpers in a read-only bundle.
  }
}

function toPtyProcess(pty: IPty): PtyProcess {
  const terminator =
    process.platform === 'win32'
      ? undefined
      : createUnixProcessTreeTerminator({
          rootPid: pty.pid,
          killPty: () => pty.kill(),
          onExit: (listener) => {
            const disposable = pty.onExit(listener)
            return () => disposable.dispose()
          }
        })

  return {
    write: (data) => pty.write(data),
    resize: (cols, rows) => pty.resize(cols, rows),
    kill: async () => {
      if (!terminator) {
        pty.kill()
        return
      }
      await terminator.terminate()
    },
    onData: (listener) => {
      const disposable = pty.onData(listener)
      return () => disposable.dispose()
    },
    onExit: (listener) => {
      const disposable = pty.onExit(listener)
      return () => disposable.dispose()
    }
  }
}

export function createUnixProcessTreeTerminator({
  rootPid,
  killPty,
  onExit,
  collectDescendants = collectDescendantPids,
  signal = signalProcess,
  fallbackDelayMs = 2_000
}: {
  rootPid: number
  killPty: () => void
  onExit: (listener: () => void) => () => void
  collectDescendants?: (pid: number) => number[]
  signal?: (pid: number, signal: NodeJS.Signals) => boolean
  fallbackDelayMs?: number
}): { terminate: () => Promise<void> } {
  let exited = false
  let terminatePromise: Promise<void> | undefined
  let resolveTerminated: (() => void) | undefined
  let fallbackTimer: NodeJS.Timeout | undefined
  const disposeExit = onExit(() => {
    exited = true
    if (fallbackTimer) clearTimeout(fallbackTimer)
    resolveTerminated?.()
    disposeExit()
  })

  return {
    terminate: () => {
      if (exited) return Promise.resolve()
      terminatePromise ??= new Promise<void>((resolve) => {
        resolveTerminated = resolve
        if (!Number.isSafeInteger(rootPid) || rootPid <= 1 || rootPid === process.pid) {
          killPty()
          return
        }

        signalUnixProcessTree(rootPid, collectDescendants(rootPid), 'SIGTERM', signal)
        killPty()

        fallbackTimer = setTimeout(() => {
          fallbackTimer = undefined
          if (!exited) {
            signalUnixProcessTree(rootPid, collectDescendants(rootPid), 'SIGKILL', signal)
          }
        }, fallbackDelayMs)
        fallbackTimer.unref()
      })
      return terminatePromise
    }
  }
}

function signalUnixProcessTree(
  rootPid: number,
  descendants: number[],
  signal: NodeJS.Signals,
  signalPid: (pid: number, signal: NodeJS.Signals) => boolean = signalProcess
): void {
  for (const childPid of [...descendants].reverse()) {
    signalPid(childPid, signal)
  }

  if (!signalPid(-rootPid, signal)) {
    signalPid(rootPid, signal)
  }
}

function signalProcess(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal)
    return true
  } catch (error) {
    return isMissingProcessGroup(error)
  }
}

function collectDescendantPids(pid: number): number[] {
  let output: string
  try {
    output = execFileSync('pgrep', ['-P', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
  } catch {
    return []
  }

  const directChildren = output
    .split('\n')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 1 && value !== process.pid)
  return directChildren.flatMap((childPid) => [childPid, ...collectDescendantPids(childPid)])
}

function isMissingProcessGroup(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ESRCH'
  )
}
