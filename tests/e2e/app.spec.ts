import { expect, test, _electron as electron } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
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

test('sets up and edits a searchable Knowledge Base through the public desktop UI', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'spacezero-kb-e2e-'))
  const knowledgeBasePath = join(temporaryDirectory, 'SpaceZero', 'knowledge-base')
  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: [
      join(process.cwd(), 'out/main/index.js'),
      `--user-data-dir=${join(temporaryDirectory, 'user-data')}`
    ],
    env: {
      ...process.env,
      SPACEZERO_KNOWLEDGE_BASE_PATH: knowledgeBasePath,
      GIT_AUTHOR_NAME: 'Space Zero Test',
      GIT_AUTHOR_EMAIL: 'spacezero@example.test',
      GIT_COMMITTER_NAME: 'Space Zero Test',
      GIT_COMMITTER_EMAIL: 'spacezero@example.test'
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.getByRole('button', { name: 'Knowledge Base' }).click()
    await expect(
      window.getByRole('heading', { name: 'Set up your Knowledge Base' })
    ).toBeVisible()

    await window.getByRole('button', { name: 'Create new' }).click()
    await expect(window.getByText(knowledgeBasePath)).toBeVisible()
    await expect(window.getByRole('button', { name: 'AGENTS.md' })).toBeVisible()

    await window.getByRole('button', { name: 'New file' }).click()
    await window.getByRole('textbox', { name: 'File path' }).fill('notes.md')
    await window.getByRole('button', { name: 'Create file' }).click()
    await window.getByRole('button', { name: 'notes.md' }).click()
    const sourceMode = window.getByRole('button', { name: 'Source' })
    await sourceMode.click()

    const editor = window.getByRole('textbox', { name: 'Edit notes.md' })
    await editor.fill('# E2E Knowledge\n\nDurable smoke-test context.')
    await expect
      .poll(() => readFile(join(knowledgeBasePath, 'notes.md'), 'utf8'))
      .toContain('Durable smoke-test context.')
    await expect(sourceMode).toHaveAttribute('aria-pressed', 'true')

    const searchInput = window.getByRole('textbox', { name: 'Search Knowledge Base' })
    await searchInput.fill('Durable smoke-test')
    await searchInput.press('Enter')
    const searchResults = window.getByRole('region', {
      name: 'Knowledge Base search results'
    })
    await expect(searchResults.getByText('Durable smoke-test context.')).toBeVisible()
    await expect(searchResults.getByRole('button', { name: /notes\.md/ })).toBeVisible()
  } finally {
    await electronApp.close()
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})
