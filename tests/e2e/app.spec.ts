import { expect, test, _electron as electron } from '@playwright/test'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string

test('launches the Electron app shell with sandboxed preload IPC available', async () => {
  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: [join(process.cwd(), 'out/main/index.js')]
  })

  const window = await electronApp.firstWindow()

  await expect(window.getByRole('main', { name: 'Main workspace' })).toBeVisible()

  const sandbox = await electronApp.evaluate(({ BrowserWindow }) => {
    const [mainWindow] = BrowserWindow.getAllWindows()
    return mainWindow.webContents.getLastWebPreferences().sandbox
  })

  const bridgeResult = await window.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        spacezero: {
          app: {
            getInfo: () => Promise<{ name: string; version: string; platform: string }>
            ping: () => Promise<string>
          }
          db: { health: () => Promise<{ ok: boolean; path: string; projectCount: number }> }
          agent: {
            ping: () => Promise<{
              sessionId: string
              message: 'pong-from-agent-utility'
              utilityProcessId: number | null
            }>
          }
        }
      }
    ).spacezero

    const [info, ping, health, agentPing] = await Promise.all([
      api.app.getInfo(),
      api.app.ping(),
      api.db.health(),
      api.agent.ping()
    ])
    return { info, ping, health, agentPing }
  })

  expect(sandbox).toBe(true)
  expect(bridgeResult.info.name).toBeTruthy()
  expect(bridgeResult.info.version).toBeTruthy()
  expect(bridgeResult.info.platform).toBe(process.platform)
  expect(bridgeResult.ping).toBe('pong')
  expect(bridgeResult.health.ok).toBe(true)
  expect(bridgeResult.health.projectCount).toBeGreaterThanOrEqual(0)
  expect(bridgeResult.agentPing).toMatchObject({
    sessionId: 'agent-ping',
    message: 'pong-from-agent-utility'
  })
  expect(bridgeResult.agentPing.utilityProcessId).toEqual(expect.any(Number))

  await electronApp.close()
})
