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
  return {
    write: (data) => pty.write(data),
    resize: (cols, rows) => pty.resize(cols, rows),
    kill: () => pty.kill(),
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
