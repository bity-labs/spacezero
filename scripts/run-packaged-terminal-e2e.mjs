import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

import { withTemporaryFile } from './temporary-file.mjs'

const configPath = resolve(process.cwd(), 'resources/github-app.json')
const testConfig = `${JSON.stringify(
  { clientId: 'packaged-smoke', appSlug: 'packaged-smoke' },
  null,
  2
)}\n`

await runPackageCommand(['run', 'build'])
await withTemporaryFile(configPath, testConfig, async () => {
  await runPackageCommand(['exec', 'electron-builder', '--', '--dir'])
  await runPackageCommand([
    'exec',
    'playwright',
    '--',
    'test',
    'tests/e2e/app.spec.ts',
    '-g',
    'packaged terminal IPC'
  ])
})

function runPackageCommand(args) {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(executable, args, { stdio: 'inherit' })
    child.once('error', rejectCommand)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveCommand()
        return
      }
      rejectCommand(
        new Error(
          signal
            ? `${executable} ${args.join(' ')} terminated by ${signal}`
            : `${executable} ${args.join(' ')} exited with code ${code}`
        )
      )
    })
  })
}
