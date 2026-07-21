import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const userDataDirectories: string[] = []

async function launchApp(userDataPath?: string): Promise<ElectronApplication> {
  const dataPath = userDataPath ?? (await mkdtemp(join(tmpdir(), 'spacezero-e2e-')))
  if (!userDataPath) userDataDirectories.push(dataPath)
  return electron.launch({
    executablePath: electronPath,
    args: [`--user-data-dir=${dataPath}`, join(process.cwd(), 'out/main/index.js')]
  })
}

test.afterEach(async () => {
  await Promise.all(
    userDataDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

test('skips first-run onboarding and launches the sandboxed Electron app shell', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'spacezero-e2e-'))
  userDataDirectories.push(userDataPath)
  const electronApp = await launchApp(userDataPath)
  let window = await electronApp.firstWindow()

  await expect(window.getByRole('main', { name: 'Space Zero onboarding' })).toBeVisible()
  await window.getByRole('button', { name: 'Skip' }).click()
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

  const laterLaunch = await launchApp(userDataPath)
  window = await laterLaunch.firstWindow()
  await expect(window.getByRole('main', { name: 'Main workspace' })).toBeVisible()
  await expect(window.getByRole('main', { name: 'Space Zero onboarding' })).toHaveCount(0)
  await laterLaunch.close()
})

test('composes simulated GitHub connection and one Project setup without network access', async () => {
  const electronApp = await launchApp()
  const window = await electronApp.firstWindow()

  await electronApp.evaluate(({ ipcMain, BrowserWindow }) => {
    let completed = false
    const identity = {
      id: '42',
      login: 'octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
      profileUrl: 'https://github.com/octocat'
    }
    const repository = {
      id: '1000',
      nodeId: 'R_1000',
      installationId: '100',
      owner: 'bity-labs',
      name: 'spacezero',
      fullName: 'bity-labs/spacezero',
      isPrivate: true,
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/bity-labs/spacezero',
      cloneUrl: 'https://github.com/bity-labs/spacezero.git'
    }
    const project = {
      id: 'project-1',
      name: 'spacezero',
      path: '/tmp/SpaceZero/projects/bity-labs/spacezero',
      githubRepository: {
        repositoryId: '1000',
        nodeId: 'R_1000',
        owner: 'bity-labs',
        name: 'spacezero',
        fullName: 'bity-labs/spacezero',
        htmlUrl: 'https://github.com/bity-labs/spacezero',
        linkedAt: new Date(0).toISOString()
      },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    }

    for (const channel of [
      'onboarding:getStatus',
      'onboarding:complete',
      'github:getConnection',
      'github:listRepositorySetupOptions',
      'github:startClone',
      'github:getProjectRepository',
      'projects:list'
    ]) {
      ipcMain.removeHandler(channel)
    }
    ipcMain.handle('onboarding:getStatus', () => ({ completed }))
    ipcMain.handle('onboarding:complete', () => {
      completed = true
      return { completed: true }
    })
    ipcMain.handle('github:getConnection', () => ({
      status: 'connected',
      identity,
      installations: [],
      repositories: [repository]
    }))
    ipcMain.handle('github:listRepositorySetupOptions', () => [
      { repository, existingProject: { id: project.id, name: project.name } }
    ])
    ipcMain.handle('github:startClone', () => ({
      status: 'already-added',
      projectId: project.id
    }))
    ipcMain.handle('github:getProjectRepository', () => repository)
    ipcMain.handle('projects:list', () => [project])

    BrowserWindow.getAllWindows()[0]?.webContents.reload()
  })

  await window.getByRole('button', { name: 'Connect GitHub' }).click()
  await window.getByRole('button', { name: 'Set up a Project' }).click()
  await window.getByRole('radio', { name: /bity-labs\/spacezero/ }).click()
  await window.getByRole('button', { name: 'Open Project' }).click()

  await expect(window.getByText('Project Home')).toBeVisible()
  await expect(window.getByRole('heading', { name: 'spacezero', exact: true })).toBeVisible()
  await expect(window.getByRole('region', { name: 'Conversation' })).toHaveCount(0)

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
    await expect(window.getByRole('main', { name: 'Space Zero onboarding' })).toBeVisible()
    await window.getByRole('button', { name: 'Skip' }).click()
    await window.getByRole('button', { name: 'Knowledge Base' }).click()
    await expect(window.getByRole('heading', { name: 'Set up your Knowledge Base' })).toBeVisible()

    await window.getByRole('button', { name: 'Create new' }).click()
    await expect(window.getByText(knowledgeBasePath)).toBeVisible()
    await expect(window.getByRole('button', { name: 'AGENTS.md' })).toBeVisible()
    await expect(window.getByRole('toolbar', { name: 'Tool Switcher' })).toHaveAttribute(
      'aria-orientation',
      'vertical'
    )
    for (const label of ['Files', 'Git', 'Browser', 'Terminal']) {
      await expect(window.getByRole('button', { name: `${label} — Coming soon` })).toBeDisabled()
    }
    await expect(window.getByRole('button', { name: 'Toggle Tool Pane' })).toBeDisabled()

    await window.getByRole('button', { name: 'New file' }).click()
    await window.getByRole('textbox', { name: 'File path' }).fill('notes.md')
    await window.getByRole('button', { name: 'Create file' }).click()
    await window.getByRole('button', { name: 'notes.md' }).click()

    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
    await window.getByLabel('Choose image').setInputFiles({
      name: 'E2E Diagram.png',
      mimeType: 'image/png',
      buffer: image
    })
    await expect(window.getByRole('img', { name: 'E2E Diagram' })).toBeVisible()
    await expect
      .poll(() => readFile(join(knowledgeBasePath, 'assets', 'img', 'e2e-diagram.png')))
      .toEqual(image)
    await expect
      .poll(() => readFile(join(knowledgeBasePath, 'notes.md'), 'utf8'))
      .toContain('![E2E Diagram](assets/img/e2e-diagram.png)')

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
