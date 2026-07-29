import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const execFileAsync = promisify(execFile)
const userDataDirectories: string[] = []

async function launchApp(userDataPath?: string): Promise<ElectronApplication> {
  const dataPath = userDataPath ?? (await mkdtemp(join(tmpdir(), 'spacezero-e2e-')))
  if (!userDataPath) userDataDirectories.push(dataPath)
  return electron.launch({
    executablePath: electronPath,
    args: [`--user-data-dir=${dataPath}`, join(process.cwd(), 'out/main/index.js')]
  })
}

async function launchPackagedApp(userDataPath: string): Promise<ElectronApplication> {
  const executablePath = resolvePackagedExecutablePath()
  test.skip(!executablePath, 'Packaged app artifact is required for the terminal smoke')
  return electron.launch({
    executablePath: executablePath!,
    args: [`--user-data-dir=${userDataPath}`]
  })
}

async function setMainWindowSize(
  electronApp: ElectronApplication,
  width: number,
  height: number
): Promise<void> {
  await electronApp.evaluate(
    ({ BrowserWindow }, size) => {
      const [mainWindow] = BrowserWindow.getAllWindows()
      mainWindow.setSize(size.width, size.height)
    },
    { width, height }
  )
}

async function expectCollapsedToolPaneControlsAligned(window: Page): Promise<void> {
  await expect(window.getByRole('toolbar', { name: 'Tool Switcher' })).toHaveAttribute(
    'aria-orientation',
    'vertical'
  )
  const geometry = await window.evaluate(() => {
    const toggle = document
      .querySelector('[aria-label="Toggle Tool Pane"]')
      ?.getBoundingClientRect()
    const toolButton = document
      .querySelector('[aria-label="Tool Switcher"] button:not([disabled])')
      ?.getBoundingClientRect()

    if (!toggle || !toolButton) return null
    return {
      centerDelta: Math.abs(
        toggle.left + toggle.width / 2 - (toolButton.left + toolButton.width / 2)
      ),
      toggleHeight: toggle.height,
      toggleWidth: toggle.width,
      toolButtonHeight: toolButton.height,
      toolButtonWidth: toolButton.width
    }
  })

  expect(geometry).not.toBeNull()
  expect(geometry!.centerDelta).toBeLessThanOrEqual(1)
  expect(geometry!.toggleHeight).toBe(32)
  expect(geometry!.toggleWidth).toBe(32)
  expect(geometry!.toolButtonHeight).toBe(32)
  expect(geometry!.toolButtonWidth).toBe(32)
}

async function expectToolPaneHeaderGeometryAligned(window: Page): Promise<void> {
  await expect
    .poll(async () => window.getByRole('complementary', { name: 'Tool Pane' }).boundingBox())
    .not.toBeNull()
  const geometry = await window.evaluate(() => {
    const pane = document.querySelector('[aria-label="Tool Pane"]')?.getBoundingClientRect()
    const header = document
      .querySelector('[aria-label="Tool Pane header controls"]')
      ?.getBoundingClientRect()
    const switcher = document
      .querySelector('[aria-label="Tool Switcher"]')
      ?.getBoundingClientRect()
    const toggle = document
      .querySelector('[aria-label="Toggle Tool Pane"]')
      ?.getBoundingClientRect()

    if (!pane || !header || !switcher || !toggle) return null
    return {
      paneLeft: pane.left,
      paneRight: pane.right,
      headerWidth: header.width,
      paneWidth: pane.width,
      switcherLeft: switcher.left,
      toggleRight: toggle.right
    }
  })

  expect(geometry).not.toBeNull()
  expect(geometry!.headerWidth).toBeGreaterThan(geometry!.paneWidth - 24)
  expect(Math.abs(geometry!.switcherLeft - geometry!.paneLeft)).toBeLessThanOrEqual(12)
  expect(Math.abs(geometry!.toggleRight - geometry!.paneRight)).toBeLessThanOrEqual(12)
}

function resolvePackagedExecutablePath(): string | undefined {
  if (process.env.SPACEZERO_PACKAGED_APP_PATH) return process.env.SPACEZERO_PACKAGED_APP_PATH

  const candidates =
    process.platform === 'darwin'
      ? [
          join(process.cwd(), 'dist', `mac-${process.arch}`, 'Space Zero.app', 'Contents', 'MacOS', 'Space Zero'),
          join(process.cwd(), 'dist', 'mac', 'Space Zero.app', 'Contents', 'MacOS', 'Space Zero')
        ]
      : process.platform === 'win32'
        ? [join(process.cwd(), 'dist', 'win-unpacked', 'Space Zero.exe')]
        : [join(process.cwd(), 'dist', 'linux-unpacked', 'spacezero')]

  return candidates.find((candidate) => existsSync(candidate))
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
  await window.getByRole('button', { name: 'Get started' }).click()
  await window.getByRole('button', { name: 'Skip for now' }).click()
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

  await window.getByRole('button', { name: 'Get started' }).click()
  await window.getByRole('button', { name: 'Set up a Project' }).click()
  await window.getByRole('radio', { name: /bity-labs\/spacezero/ }).click()
  await window.getByRole('button', { name: 'Open Project' }).click()

  await expect(window.getByText('Project Home')).toBeVisible()
  await expect(window.getByRole('heading', { name: 'spacezero', exact: true })).toBeVisible()
  await expect(window.getByRole('region', { name: 'Conversation' })).toHaveCount(0)

  await electronApp.close()
})

test('opens a Project Session text file in bundled Monaco without network loading', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'spacezero-files-e2e-'))
  const projectPath = join(temporaryDirectory, 'project')
  const userDataPath = join(temporaryDirectory, 'user-data')
  const markdownPath = join(projectPath, 'README.md')
  const notesPath = join(projectPath, 'NOTES.md')
  const sourcePath = join(projectPath, 'package.json')
  await mkdir(projectPath, { recursive: true })
  await writeFile(
    markdownPath,
    ['# Bundled editor', ...Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`)].join(
      '\n\n'
    )
  )
  await writeFile(notesPath, '# Second note\n')
  await writeFile(sourcePath, '{"name":"files-e2e"}\n')

  const electronApp = await launchApp(userDataPath)
  userDataDirectories.push(temporaryDirectory)
  const window = await electronApp.firstWindow()

  await electronApp.evaluate(
    ({ ipcMain, BrowserWindow }, { projectPath }) => {
      const { readFile, readdir, stat } = process.getBuiltinModule('node:fs/promises')
      const { join } = process.getBuiltinModule('node:path')
      const project = {
        id: 'project-files-e2e',
        name: 'files-e2e',
        path: projectPath,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
      const session = {
        id: 'session-files-e2e',
        kind: 'project',
        projectId: project.id,
        title: 'Files E2E',
        status: 'idle',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }

      for (const channel of [
        'onboarding:getStatus',
        'onboarding:complete',
        'projects:list',
        'sessions:listProjectSessions',
        'sessions:listWorkspaceSessions',
        'agent:getState',
        'files:listDirectory',
        'files:openDocument'
      ]) {
        ipcMain.removeHandler(channel)
      }
      ipcMain.handle('onboarding:getStatus', () => ({ completed: false }))
      ipcMain.handle('onboarding:complete', () => ({ completed: true }))
      ipcMain.handle('projects:list', () => [project])
      ipcMain.handle('sessions:listProjectSessions', () => [session])
      ipcMain.handle('sessions:listWorkspaceSessions', () => [])
      ipcMain.handle('agent:getState', () => ({
        sessionId: session.id,
        projectId: project.id,
        cwd: projectPath,
        status: 'idle',
        live: true,
        transcriptPath: `${projectPath}/session.jsonl`,
        modelProvider: undefined,
        modelId: undefined,
        thinking: undefined
      }))
      ipcMain.handle('files:listDirectory', async () => {
        const entries = await readdir(projectPath, { withFileTypes: true })
        return entries.map((entry) => ({
          name: entry.name,
          relativePath: entry.name,
          kind: entry.isDirectory() ? 'directory' : 'file'
        }))
      })
      ipcMain.handle('files:openDocument', async (_event, input) => {
        const relativePath = String(input.relativePath)
        const absolutePath = join(projectPath, relativePath)
        const details = await stat(absolutePath)
        const content = await readFile(absolutePath, 'utf8')
        return {
          name: relativePath,
          relativePath,
          contentKind: 'text',
          size: details.size,
          modifiedAt: details.mtime.toISOString(),
          revision: 'revision-1',
          content,
          hasBom: false,
          lineEnding: 'lf'
        }
      })

      BrowserWindow.getAllWindows()[0]?.webContents.reload()
    },
    { projectPath }
  )

  await window.getByRole('button', { name: 'Get started' }).click()
  await window.getByRole('button', { name: 'Skip for now' }).click()
  await window.getByRole('button', { name: 'files-e2e', exact: true }).click()
  await window.getByRole('button', { name: 'Files E2E' }).click()
  await window.getByRole('button', { name: 'Toggle Tool Pane' }).click()
  await expect(window.getByRole('tree', { name: 'Project files' })).toBeVisible()
  await window.getByText('package.json').click()
  await expect(window.locator('.monaco-editor')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Save' })).toHaveCount(0)
  await expect(window.getByRole('button', { name: 'Save All' })).toHaveCount(0)
  await expect(window.getByText('Saved')).toHaveCount(0)

  await window.getByText('README.md').click()
  await expect(window.getByRole('textbox', { name: 'Rich Markdown editor' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Source' })).toBeVisible()
  const richEditorMetrics = await window.locator('.rich-markdown-editor').evaluate((editor) => {
    const wrapper = editor.parentElement
    const content = editor.querySelector('.rich-markdown-editor__content')
    return {
      wrapperHeight: wrapper?.getBoundingClientRect().height ?? 0,
      editorHeight: editor.getBoundingClientRect().height,
      contentClientHeight: content?.clientHeight ?? 0,
      contentScrollHeight: content?.scrollHeight ?? 0,
      contentOverflowY: content ? window.getComputedStyle(content).overflowY : ''
    }
  })
  expect(richEditorMetrics.editorHeight).toBeGreaterThan(richEditorMetrics.wrapperHeight - 4)
  expect(richEditorMetrics.contentScrollHeight).toBeGreaterThan(
    richEditorMetrics.contentClientHeight
  )
  expect(richEditorMetrics.contentOverflowY).toBe('auto')

  await expect(window.getByRole('button', { name: 'Pin preview' })).toHaveCount(0)
  await window.getByRole('tab', { name: /README\.md\s*preview/ }).dblclick()
  await window.getByText('NOTES.md').click()
  await expect(window.getByRole('textbox', { name: 'Rich Markdown editor' })).toContainText(
    'Second note'
  )
  await window.getByRole('tab', { name: /NOTES\.md\s*preview/ }).dblclick()
  await window.getByRole('tab', { name: 'README.md' }).click()
  await expect(window.getByRole('textbox', { name: 'Rich Markdown editor' })).toContainText(
    'Bundled editor'
  )
  await expect(window.getByRole('button', { name: 'Undo' })).toBeDisabled()

  const externalMonacoRequests = await window.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('cdn.jsdelivr.net'))
  )
  expect(externalMonacoRequests).toEqual([])

  await electronApp.close()
})

test('creates a real Project Session PTY through the packaged terminal IPC bridge', async () => {
  test.skip(process.platform === 'win32', 'Packaged PTY termination smoke is Unix-only for v0')

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'spacezero-terminal-e2e-'))
  const projectPath = join(temporaryDirectory, 'project')
  const userDataPath = join(temporaryDirectory, 'user-data')
  const projectId = 'project-terminal-e2e'
  const sessionId = 'session-terminal-e2e'
  const worktreePath = join(temporaryDirectory, 'worktrees', projectId, sessionId)
  const branch = `spacezero/session-${sessionId}`
  let electronApp: ElectronApplication | undefined

  try {
    await mkdir(projectPath, { recursive: true })
    await execFileAsync('git', ['init'], { cwd: projectPath })
    await execFileAsync('git', ['config', 'user.name', 'Space Zero Test'], { cwd: projectPath })
    await execFileAsync('git', ['config', 'user.email', 'spacezero@example.test'], {
      cwd: projectPath
    })
    await writeFile(join(projectPath, 'README.md'), '# Terminal E2E\n')
    await execFileAsync('git', ['add', 'README.md'], { cwd: projectPath })
    await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: projectPath })
    const { stdout: baseRevision } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: projectPath
    })
    await execFileAsync('git', ['worktree', 'add', '-b', branch, worktreePath, 'HEAD'], {
      cwd: projectPath
    })

    electronApp = await launchPackagedApp(userDataPath)
    const window = await electronApp.firstWindow()
    const isPackaged = await electronApp.evaluate(({ app }) => app.isPackaged)
    expect(isPackaged).toBe(true)

    await electronApp.evaluate(
      ({ app }, { projectId, projectPath, sessionId, worktreePath, branch, baseRevision }) => {
        const { createRequire } = process.getBuiltinModule('node:module')
        const { join } = process.getBuiltinModule('node:path')
        const require = createRequire(`${app.getAppPath()}/package.json`)
        const Database = require('better-sqlite3')
        const database = new Database(join(app.getPath('userData'), 'spacezero.sqlite3'))
        const timestamp = Date.now()
        database
          .prepare(
            `INSERT INTO projects (id, name, path, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(projectId, 'terminal-e2e', projectPath, timestamp, timestamp)
        database
          .prepare(
            `INSERT INTO sessions (
              id,
              project_id,
              title,
              status,
              created_at,
              updated_at,
              worktree_path,
              worktree_branch,
              worktree_base_revision
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            sessionId,
            projectId,
            'Terminal E2E',
            'idle',
            timestamp,
            timestamp,
            worktreePath,
            branch,
            baseRevision.trim()
          )
        database.close()
      },
      { projectId, projectPath, sessionId, worktreePath, branch, baseRevision }
    )

    const result = await window.evaluate(
      async ({ sessionId, worktreePath }) => {
        const context = { kind: 'project-session' as const, sessionId }
        let output = ''
        let childPid: number | null = null
        const waitForMarker = new Promise<{ output: string; childPid: number }>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            unsubscribe()
            reject(new Error(`Timed out waiting for terminal output: ${output}`))
          }, 15_000)
          const unsubscribe = window.spacezero.terminal.onEvent((event) => {
            if (event.type !== 'output') return
            output += event.data
            const match = output.match(/SPACEZERO_CHILD:(\d+)/)
            if (
              output.includes('SPACEZERO_TERMINAL_E2E') &&
              output.includes(worktreePath) &&
              /(^|\r?\n)30 100(\r?\n|$)/.test(output) &&
              match
            ) {
              childPid = Number(match[1])
              window.clearTimeout(timeout)
              unsubscribe()
              resolve({ output, childPid })
            }
          })
        })
        const created = await window.spacezero.terminal.create({
          context,
          cols: 80,
          rows: 24,
          forceNew: true
        })
        if (created.status !== 'running') throw new Error('Expected a running terminal')
        const { terminalId } = created
        const replay = await window.spacezero.terminal.subscribe({ terminalId, context })
        for (const event of replay.events) {
          if (event.type === 'output') output += event.data
        }
        await window.spacezero.terminal.resize({ terminalId, context, cols: 100, rows: 30 })
        await window.spacezero.terminal.writeInput({
          terminalId,
          context,
          data: 'echo SPACEZERO_TERMINAL_E2E; pwd; stty size; sleep 60 & echo SPACEZERO_CHILD:$!\r'
        })
        const observed = await waitForMarker
        await window.spacezero.terminal.close({ terminalId, context })
        return observed
      },
      { sessionId, worktreePath }
    )

    expect(result.output).toContain('SPACEZERO_TERMINAL_E2E')
    expect(result.output).toContain(worktreePath)
    expect(result.output).toMatch(/(^|\r?\n)30 100(\r?\n|$)/)
    await expect
      .poll(async () => isProcessAlive(result.childPid), { timeout: 5_000 })
      .toBe(false)
  } finally {
    await electronApp?.close().catch(() => undefined)
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})

async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !(
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ESRCH'
    )
  }
}

test('keeps a local server PTY alive through Terminal-to-Browser handoff and return', async () => {
  test.skip(process.platform === 'win32', 'PTY handoff regression is Unix-only for v0')

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'spacezero-terminal-browser-e2e-'))
  const userDataPath = join(temporaryDirectory, 'user-data')
  const sessionId = 'session-terminal-browser-e2e'
  let electronApp: ElectronApplication | undefined

  try {
    electronApp = await launchApp(userDataPath)
    const window = await electronApp.firstWindow()
    await electronApp.evaluate(({ app, BrowserWindow }, { sessionId }) => {
      const { createRequire } = process.getBuiltinModule('node:module')
      const { join } = process.getBuiltinModule('node:path')
      const require = createRequire(`${app.getAppPath()}/package.json`)
      const Database = require('better-sqlite3')
      const database = new Database(join(app.getPath('userData'), 'spacezero.sqlite3'))
      const timestamp = Date.now()
      database
        .prepare(
          `INSERT INTO sessions (id, project_id, title, status, created_at, updated_at, managed_context)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(sessionId, null, 'Terminal Browser E2E', 'idle', timestamp, timestamp, null)
      database.close()
      BrowserWindow.getAllWindows()[0]?.webContents.reload()
    }, { sessionId })

    await window.getByRole('button', { name: 'Get started' }).click()
    await window.getByRole('button', { name: 'Skip for now' }).click()
    await window.getByRole('button', { name: 'Terminal Browser E2E' }).click()
    await expect(window.getByRole('region', { name: 'Conversation' })).toBeVisible()
    await window.getByRole('button', { name: 'Terminal', exact: true }).click()
    await expect(window.getByRole('region', { name: 'Terminal' })).toBeVisible()

    const handoff = await window.evaluate(async ({ sessionId }) => {
      const context = { kind: 'workspace-session' as const, sessionId }
      const terminalState = await window.spacezero.terminal.create({
        context,
        cols: 80,
        rows: 24,
        forceNew: false
      })
      if (terminalState.status !== 'running' || !terminalState.terminalId) {
        throw new Error('Expected a running terminal')
      }
      let output = ''
      const terminalId = terminalState.terminalId
      const waitForUrl = new Promise<{
        terminalId: string
        serverUrl: string
        serverPid: number
        output: string
      }>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          unsubscribe()
          reject(new Error(`Timed out waiting for server URL: ${output}`))
        }, 20_000)
        const unsubscribe = window.spacezero.terminal.onEvent((event) => {
          if (event.type !== 'output' || event.terminalId !== terminalId) return
          output += event.data
          const urlMatch = output.match(/(http:\/\/127\.0\.0\.1:\d+\/alive)/)
          const pidMatch = output.match(/SPACEZERO_SERVER_PID:(\d+)/)
          if (urlMatch && pidMatch) {
            window.clearTimeout(timeout)
            unsubscribe()
            resolve({
              terminalId,
              serverUrl: urlMatch[1]!,
              serverPid: Number(pidMatch[1]),
              output
            })
          }
        })
      })
      await window.spacezero.terminal.resize({ terminalId, context, cols: 100, rows: 30 })
      await window.spacezero.terminal.writeInput({
        terminalId,
        context,
        data: `node -e "const http=require('http'); const server=http.createServer((_req,res)=>res.end('SPACEZERO_SERVER_ALIVE')); server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port+'/alive')); setInterval(()=>{}, 1000)" & echo SPACEZERO_SERVER_PID:$!\r`
      })
      return waitForUrl
    }, { sessionId })

    await expect.poll(async () =>
      window.evaluate(({ serverUrl }) =>
        Array.from(document.querySelectorAll('.xterm-rows > div')).some((row) =>
          row.textContent?.includes(serverUrl)
        )
      , { serverUrl: handoff.serverUrl })
    ).toBe(true)

    const viewportBox = await window.locator('.xterm-viewport').boundingBox()
    if (!viewportBox) throw new Error('Terminal viewport was not found')
    await window.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2)
    await window.mouse.wheel(0, 10_000)
    const viewportBeforeHandoff = await window.locator('.xterm-viewport').evaluate((viewport) => ({
      scrollTop: viewport.scrollTop,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight
    }))
    expect(viewportBeforeHandoff.clientHeight).toBeGreaterThan(0)

    const terminalLinkPoint = await window.evaluate(({ serverUrl }) => {
      const row = Array.from(document.querySelectorAll('.xterm-rows > div')).find((candidate) =>
        candidate.textContent?.includes(serverUrl)
      )
      if (!row) throw new Error(`Rendered Terminal Link was not found for ${serverUrl}`)
      const text = row.textContent ?? ''
      const rect = row.getBoundingClientRect()
      const columnWidth = rect.width / Math.max(text.length, 1)
      return {
        x: rect.left + columnWidth * (text.indexOf(serverUrl) + 0.5),
        y: rect.top + rect.height / 2
      }
    }, { serverUrl: handoff.serverUrl })
    const terminalLinkModifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await window.keyboard.down(terminalLinkModifier)
    try {
      await window.mouse.move(terminalLinkPoint.x, terminalLinkPoint.y)
      await window.waitForTimeout(300)
      await window.mouse.click(terminalLinkPoint.x, terminalLinkPoint.y)
    } finally {
      await window.keyboard.up(terminalLinkModifier)
    }
    await expect(window.getByRole('region', { name: 'Browser' })).toBeVisible()
    await expect.poll(async () =>
      electronApp!.evaluate(({ webContents }, { serverUrl }) =>
        webContents.getAllWebContents().some((contents) => contents.getURL() === serverUrl)
      , { serverUrl: handoff.serverUrl })
    ).toBe(true)
    const browserBody = await electronApp.evaluate(async ({ webContents }, { serverUrl }) => {
      const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === serverUrl)
      if (!contents) throw new Error('Embedded Browser server tab was not found')
      return contents.executeJavaScript('document.body.textContent')
    }, { serverUrl: handoff.serverUrl })
    expect(browserBody).toContain('SPACEZERO_SERVER_ALIVE')
    expect(await isProcessAlive(handoff.serverPid)).toBe(true)

    await window.getByRole('button', { name: 'Terminal', exact: true }).click()
    await expect(window.getByRole('region', { name: 'Terminal' })).toBeVisible()
    await expect.poll(async () =>
      window.locator('.xterm-viewport').evaluate((viewport) => viewport.scrollHeight)
    ).toBe(viewportBeforeHandoff.scrollHeight)
    const viewportAfterReturn = await window.locator('.xterm-viewport').evaluate((viewport) => ({
      scrollTop: viewport.scrollTop,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight
    }))
    expect(viewportAfterReturn.scrollHeight).toBe(viewportBeforeHandoff.scrollHeight)
    expect(viewportAfterReturn.clientHeight).toBe(viewportBeforeHandoff.clientHeight)
    expect(viewportAfterReturn.scrollTop).toBe(viewportBeforeHandoff.scrollTop)
    await window.evaluate(async ({ terminalId, sessionId }) => {
      const context = { kind: 'workspace-session' as const, sessionId }
      await window.spacezero.terminal.writeInput({
        terminalId,
        context,
        data: 'echo SPACEZERO_TERMINAL_RETURN; stty size\r'
      })
    }, { terminalId: handoff.terminalId, sessionId })
    const readTerminalReturn = async (): Promise<string> =>
      window.evaluate(async ({ terminalId, sessionId }) => {
        const context = { kind: 'workspace-session' as const, sessionId }
        const tabs = await window.spacezero.terminal.listTabs({ context })
        const replay = await window.spacezero.terminal.subscribe({ terminalId, context })
        const output = replay.events
          .filter((event) => event.type === 'output')
          .map((event) => event.data)
          .join('')
        if (tabs.activeTerminalId !== terminalId) return ''
        return output
      }, { terminalId: handoff.terminalId, sessionId })
    await expect.poll(readTerminalReturn).toMatch(/SPACEZERO_TERMINAL_RETURN[\s\S]*(^|\r?\n)\d+ \d+(\r?\n|$)/)
    const terminalReturn = await readTerminalReturn()
    expect(terminalReturn).toContain('SPACEZERO_TERMINAL_RETURN')
    expect(terminalReturn).toMatch(/(^|\r?\n)\d+ \d+(\r?\n|$)/)

    await window.evaluate(async ({ terminalId, sessionId }) => {
      await window.spacezero.terminal.close({
        terminalId,
        context: { kind: 'workspace-session', sessionId }
      })
    }, { terminalId: handoff.terminalId, sessionId })
    await expect.poll(async () => isProcessAlive(handoff.serverPid), { timeout: 5_000 }).toBe(false)
  } finally {
    const window = electronApp?.windows()[0]
    if (window) {
      await window.evaluate(async ({ sessionId }) => {
        const context = { kind: 'workspace-session' as const, sessionId }
        const { tabs } = await window.spacezero.terminal.listTabs({ context })
        await Promise.all(
          tabs.map(({ terminalId }) => window.spacezero.terminal.close({ terminalId, context }))
        )
      }, { sessionId }).catch(() => undefined)
    }
    await electronApp?.close().catch(() => undefined)
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})

test('aligns the collapsed Tool Pane toggle with its tool buttons and keeps it usable', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'spacezero-tool-pane-alignment-e2e-'))
  const knowledgeBasePath = join(temporaryDirectory, 'SpaceZero', 'knowledge-base')
  const userDataPath = join(temporaryDirectory, 'user-data')
  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: [join(process.cwd(), 'out/main/index.js'), `--user-data-dir=${userDataPath}`],
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
    await window.getByRole('button', { name: 'Get started' }).click()
    await window.getByRole('button', { name: 'Skip for now' }).click()
    await window.getByRole('button', { name: 'Knowledge Base' }).click()
    await window.getByRole('button', { name: 'Create new' }).click()
    await expect(window.getByRole('button', { name: 'Toggle Tool Pane' })).toBeEnabled()

    await setMainWindowSize(electronApp, 1280, 900)
    await expectCollapsedToolPaneControlsAligned(window)

    const toggle = window.getByRole('button', { name: 'Toggle Tool Pane' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(window.getByRole('complementary', { name: 'Tool Pane' })).toBeVisible()
  } finally {
    await electronApp.close().catch(() => undefined)
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})

test('opens a configured Knowledge Base as a persistent managed chat', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'spacezero-kb-e2e-'))
  const knowledgeBasePath = join(temporaryDirectory, 'SpaceZero', 'knowledge-base')
  const userDataPath = join(temporaryDirectory, 'user-data')
  const launchKnowledgeBaseApp = () =>
    electron.launch({
      executablePath: electronPath,
      args: [join(process.cwd(), 'out/main/index.js'), `--user-data-dir=${userDataPath}`],
      env: {
        ...process.env,
        SPACEZERO_KNOWLEDGE_BASE_PATH: knowledgeBasePath,
        GIT_AUTHOR_NAME: 'Space Zero Test',
        GIT_AUTHOR_EMAIL: 'spacezero@example.test',
        GIT_COMMITTER_NAME: 'Space Zero Test',
        GIT_COMMITTER_EMAIL: 'spacezero@example.test'
      }
    })
  let electronApp = await launchKnowledgeBaseApp()

  try {
    let window = await electronApp.firstWindow()
    await expect(window.getByRole('main', { name: 'Space Zero onboarding' })).toBeVisible()
    await window.getByRole('button', { name: 'Get started' }).click()
    await window.getByRole('button', { name: 'Skip for now' }).click()
    await window.getByRole('button', { name: 'Knowledge Base' }).click()
    await expect(window.getByRole('heading', { name: 'Set up your Knowledge Base' })).toBeVisible()

    await window.getByRole('button', { name: 'Create new' }).click()
    await expect(window.getByPlaceholder('Ask about your Knowledge Base…')).toBeVisible()
    await expect(window.getByRole('tree', { name: 'Knowledge Base files' })).toHaveCount(0)
    await expect(window.getByText('No workspace sessions yet.')).toBeVisible()
    await expect(window.getByRole('toolbar', { name: 'Tool Switcher' })).toHaveAttribute(
      'aria-orientation',
      'vertical'
    )
    await expect(window.getByRole('button', { name: 'Files', exact: true })).toBeEnabled()
    await expect(window.getByRole('button', { name: 'Browser', exact: true })).toBeEnabled()
    await expect(window.getByRole('button', { name: 'Terminal', exact: true })).toBeEnabled()
    await expect(window.getByRole('button', { name: 'Git', exact: true })).toBeEnabled()
    await expect(window.getByRole('button', { name: 'Toggle Tool Pane' })).toBeEnabled()
    expect(
      await window.evaluate(() => {
        const legacyMethods = [
          'getTree',
          'openDocument',
          'search',
          'createItem',
          'renameItem',
          'moveItem',
          'deleteItem',
          'saveDocument',
          'checkDocument',
          'getSyncStatus',
          'addRemote',
          'syncNow',
          'openRemote'
        ]
        return legacyMethods.filter((method) => method in window.spacezero.knowledgeBase)
      })
    ).toEqual([])
    await setMainWindowSize(electronApp, 1280, 900)
    await window.getByRole('button', { name: 'Toggle Tool Pane' }).click()
    await expect(window.getByRole('tree', { name: 'Files' })).toBeVisible()
    await expectToolPaneHeaderGeometryAligned(window)
    await window.getByRole('separator', { name: 'Resize Tool Pane' }).press('ArrowRight')
    await expectToolPaneHeaderGeometryAligned(window)
    await setMainWindowSize(electronApp, 960, 900)
    await expectToolPaneHeaderGeometryAligned(window)
    await expect(window.getByText('AGENTS.md')).toBeVisible()
    await window.getByText('AGENTS.md').click()
    await expect(window.getByRole('button', { name: 'Rich' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Source' })).toBeVisible()

    const previousSessionId = await window.evaluate(() =>
      window.spacezero.knowledgeBase.getCurrentSession().then((session) => session.id)
    )
    await window.getByRole('button', { name: 'New chat' }).click()
    await expect
      .poll(() =>
        window.evaluate(() =>
          window.spacezero.knowledgeBase.getCurrentSession().then((session) => session.id)
        )
      )
      .not.toBe(previousSessionId)
    const replacementSessionId = await window.evaluate(() =>
      window.spacezero.knowledgeBase.getCurrentSession().then((session) => session.id)
    )
    await expect(window.getByText('No workspace sessions yet.')).toBeVisible()
    await expect(window.getByRole('toolbar', { name: 'Tool Switcher' })).toHaveAttribute(
      'aria-orientation',
      'horizontal'
    )
    await expect(window.getByRole('tree', { name: 'Files' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Files', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await electronApp.close()
    electronApp = await launchKnowledgeBaseApp()
    window = await electronApp.firstWindow()
    await setMainWindowSize(electronApp, 960, 900)
    await window.getByRole('button', { name: 'Knowledge Base' }).click()
    await expect(window.getByPlaceholder('Ask about your Knowledge Base…')).toBeVisible()
    await expectToolPaneHeaderGeometryAligned(window)
    await expect(window.getByText('No workspace sessions yet.')).toBeVisible()
    await expect(window.getByRole('tree', { name: 'Files' })).toBeVisible()
    await expect
      .poll(() =>
        window.evaluate(() =>
          window.spacezero.knowledgeBase.getCurrentSession().then((session) => session.id)
        )
      )
      .toBe(replacementSessionId)
  } finally {
    await electronApp.close()
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})

test('opens a sandboxed Browser Tool page through the dedicated embedded profile', async () => {
  const server = await startBrowserFixtureServer()
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Browser fixture server did not bind.')
  const fixtureUrl = `http://127.0.0.1:${address.port}/browser-fixture`
  const downloadDirectory = await mkdtemp(join(tmpdir(), 'spacezero-browser-download-e2e-'))
  userDataDirectories.push(downloadDirectory)
  const downloadPath = join(downloadDirectory, 'chosen-fixture-download.txt')

  const electronApp = await launchApp()
  const window = await electronApp.firstWindow()

  await electronApp.evaluate(({ app, ipcMain, BrowserWindow }) => {
    const { createRequire } = process.getBuiltinModule('node:module')
    const { join } = process.getBuiltinModule('node:path')
    const require = createRequire(`${app.getAppPath()}/package.json`)
    const Database = require('better-sqlite3')
    const database = new Database(join(app.getPath('userData'), 'spacezero.sqlite3'))
    const timestamp = Date.now()
    const insertProject = database.prepare(
      `INSERT OR IGNORE INTO projects (id, name, path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    insertProject.run('browser-project-1', 'Browser Project 1', '/tmp/spacezero-browser-project-1', timestamp, timestamp)
    insertProject.run('browser-project-2', 'Browser Project 2', '/tmp/spacezero-browser-project-2', timestamp, timestamp)
    const insertSession = database.prepare(
      `INSERT OR IGNORE INTO sessions (id, project_id, title, status, created_at, updated_at, managed_context)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    insertSession.run('browser-e2e-session', null, 'Browser E2E', 'idle', timestamp, timestamp, null)
    insertSession.run('browser-workspace-2', null, 'Browser Workspace 2', 'idle', timestamp, timestamp, null)
    insertSession.run('browser-project-session-1', 'browser-project-1', 'Browser Project Session 1', 'idle', timestamp, timestamp, null)
    insertSession.run('browser-project-session-2', 'browser-project-2', 'Browser Project Session 2', 'idle', timestamp, timestamp, null)
    insertSession.run('browser-kb-session', null, 'Browser Knowledge Base', 'idle', timestamp, timestamp, 'knowledge-base')
    database
      .prepare(
        `INSERT OR REPLACE INTO app_settings (key, value, updated_at)
         VALUES (?, ?, ?)`
      )
      .run('knowledgeBase.currentSessionId', 'browser-kb-session', timestamp)
    database.close()

    for (const channel of [
      'onboarding:getStatus',
      'onboarding:complete',
      'sessions:listProjectSessions',
      'sessions:listWorkspaceSessions',
      'projects:list',
      'agent:getState'
    ]) {
      ipcMain.removeHandler(channel)
    }
    ipcMain.handle('onboarding:getStatus', () => ({ completed: true }))
    ipcMain.handle('onboarding:complete', () => ({ completed: true }))
    ipcMain.handle('projects:list', () => [])
    ipcMain.handle('sessions:listProjectSessions', () => [])
    ipcMain.handle('sessions:listWorkspaceSessions', () => [
      {
        id: 'browser-e2e-session',
        kind: 'workspace',
        title: 'Browser E2E',
        status: 'idle',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
    ])
    ipcMain.handle('agent:getState', () => ({
      sessionId: 'browser-e2e-session',
      kind: 'workspace',
      status: 'idle',
      title: 'Browser E2E',
      messages: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    }))
    BrowserWindow.getAllWindows()[0]?.webContents.reload()
  })

  await window.getByRole('button', { name: /Browser E2E/ }).click()
  await expect(window.getByRole('region', { name: 'Conversation' })).toBeVisible()

  await window.getByRole('button', { name: 'Browser', exact: true }).click()
  await expect(window.getByRole('complementary', { name: 'Tool Pane' })).toBeVisible()
  await window.getByLabel('Browser URL').fill(fixtureUrl)
  await window.getByRole('button', { name: 'Go' }).click()

  await expect.poll(async () =>
    electronApp.evaluate(({ webContents }, { fixtureUrl }) =>
      webContents.getAllWebContents().some((contents) => contents.getURL() === fixtureUrl)
    , { fixtureUrl })
  ).toBe(true)

  const browserIsolation = await electronApp.evaluate(async ({ BrowserWindow, session, webContents }, { fixtureUrl }) => {
    const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === fixtureUrl)
    const [mainWindow] = BrowserWindow.getAllWindows()
    if (!contents) throw new Error('Embedded browser webContents was not found.')
    const attachedBounds = mainWindow.contentView.children
      .find((child) => child.webContents === contents)
      ?.getBounds()
    return {
      url: contents.getURL(),
      attachedBounds,
      title: await contents.executeJavaScript('document.querySelector("h1")?.textContent'),
      preferences: contents.getLastWebPreferences(),
      usesDedicatedProfile: contents.session === session.fromPartition('persist:spacezero-browser'),
      usesDefaultProfile: contents.session === session.defaultSession,
      globals: await contents.executeJavaScript(`({
        spacezero: typeof window.spacezero,
        electronRequire: typeof window.require,
        nodeProcess: typeof window.process
      })`)
    }
  }, { fixtureUrl })

  const surfaceBounds = await window.getByLabel('Browser page surface').boundingBox()
  expect(browserIsolation.url).toBe(fixtureUrl)
  expect(browserIsolation.title).toBe('Browser fixture')
  expect(browserIsolation.attachedBounds).toMatchObject({
    x: Math.round(surfaceBounds?.x ?? 0),
    width: Math.round(surfaceBounds?.width ?? 0)
  })
  expect(browserIsolation.attachedBounds?.y).toBeGreaterThanOrEqual(Math.round(surfaceBounds?.y ?? 0))
  expect((browserIsolation.attachedBounds?.y ?? 0) + (browserIsolation.attachedBounds?.height ?? 0)).toBe(
    Math.round((surfaceBounds?.y ?? 0) + (surfaceBounds?.height ?? 0))
  )
  expect(browserIsolation.usesDedicatedProfile).toBe(true)
  expect(browserIsolation.usesDefaultProfile).toBe(false)
  expect(browserIsolation.preferences.sandbox).toBe(true)
  expect(browserIsolation.preferences.nodeIntegration).toBe(false)
  expect(browserIsolation.globals).toMatchObject({
    spacezero: 'undefined',
    electronRequire: 'undefined'
  })

  await electronApp.evaluate(({ dialog, shell }, { downloadPath }) => {
    let openedPath: string | null = null
    let revealedPath: string | null = null
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: downloadPath })
    shell.openPath = async (path: string) => {
      openedPath = path
      return ''
    }
    shell.showItemInFolder = (path: string) => {
      revealedPath = path
    }
    ;(globalThis as {
      __spacezeroBrowserDownloadNativeActions?: () => { openedPath: string | null; revealedPath: string | null }
    }).__spacezeroBrowserDownloadNativeActions = () => ({ openedPath, revealedPath })
  }, { downloadPath })
  await window.evaluate(() => {
    ;(globalThis as { __spacezeroBrowserDownloadEvents?: unknown[] }).__spacezeroBrowserDownloadEvents = []
    window.spacezero.browser.onEvent((event) => {
      if (event.type === 'download-updated') {
        ;(globalThis as { __spacezeroBrowserDownloadEvents?: unknown[] }).__spacezeroBrowserDownloadEvents?.push(event.download)
      }
    })
  })
  await electronApp.evaluate(async ({ webContents }, { fixtureUrl }) => {
    const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === fixtureUrl)
    if (!contents) throw new Error('Embedded browser webContents was not found for download fixture.')
    await contents.executeJavaScript('document.querySelector("#download-link")?.click()')
  }, { fixtureUrl })
  await expect.poll(() => existsSync(downloadPath)).toBe(true)
  await expect(window.getByLabel('Browser downloads')).toContainText('Download complete')
  await expect(window.getByLabel('Browser downloads')).toContainText('fixture-download.txt')
  const downloadEvents = await window.evaluate(() =>
    (globalThis as { __spacezeroBrowserDownloadEvents?: unknown[] }).__spacezeroBrowserDownloadEvents ?? []
  )
  expect(JSON.stringify(downloadEvents)).not.toContain(downloadPath)
  expect(JSON.stringify(downloadEvents)).not.toContain(fixtureUrl)
  const downloadsRegion = window.getByLabel('Browser downloads')
  await downloadsRegion.getByRole('button', { name: 'Open', exact: true }).click()
  await downloadsRegion.getByRole('button', { name: 'Reveal in folder' }).click()
  await expect.poll(async () =>
    electronApp.evaluate(() =>
      (globalThis as {
        __spacezeroBrowserDownloadNativeActions?: () => { openedPath: string | null; revealedPath: string | null }
      }).__spacezeroBrowserDownloadNativeActions?.()
    )
  ).toEqual({ openedPath: downloadPath, revealedPath: downloadPath })

  const newWindowTargetUrl = `http://127.0.0.1:${address.port}/new-window-target`
  const scriptedPopupPageUrl = `http://127.0.0.1:${address.port}/scripted-popup-page`
  const delayedPopupPageUrl = `http://127.0.0.1:${address.port}/delayed-popup-page`
  const namedScriptedPopupPageUrl = `http://127.0.0.1:${address.port}/named-scripted-popup-page`
  const scriptedPopupTargetUrl = `http://127.0.0.1:${address.port}/scripted-popup-target`
  const authPopupTargetUrl = `http://127.0.0.1:${address.port}/auth-popup-target`
  await electronApp.evaluate(async ({ webContents }, { fixtureUrl }) => {
    const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === fixtureUrl)
    if (!contents) throw new Error('Embedded browser webContents was not found for popup fixtures.')
    const point = await contents.executeJavaScript(`(() => {
      const rect = document.querySelector('#target-blank').getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    })()`)
    contents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    contents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  }, { fixtureUrl })
  await expect.poll(async () =>
    window.evaluate(() =>
      window.spacezero.browser.getState({
        contextKey: 'session:browser-e2e-session',
        context: { kind: 'workspace-session', sessionId: 'browser-e2e-session' }
      }).then((state) => state.tabs.map((tab) => tab.url))
    )
  ).toContain(newWindowTargetUrl)

  await window.evaluate(async ({ scriptedPopupPageUrl }) => {
    await window.spacezero.browser.createTab({
      contextKey: 'session:browser-e2e-session',
      context: { kind: 'workspace-session', sessionId: 'browser-e2e-session' },
      input: scriptedPopupPageUrl
    })
  }, { scriptedPopupPageUrl })
  await expect.poll(async () =>
    electronApp.evaluate(({ webContents }, { scriptedPopupPageUrl }) =>
      webContents.getAllWebContents().some((contents) => contents.getURL() === scriptedPopupPageUrl)
    , { scriptedPopupPageUrl })
  ).toBe(true)
  await new Promise((resolve) => setTimeout(resolve, 500))
  const scriptedPopupBlocked = await electronApp.evaluate(({ webContents }, { scriptedPopupTargetUrl }) =>
    webContents.getAllWebContents().every((contents) => contents.getURL() !== scriptedPopupTargetUrl)
  , { scriptedPopupTargetUrl })
  expect(scriptedPopupBlocked).toBe(true)
  await window.evaluate(async ({ namedScriptedPopupPageUrl }) => {
    await window.spacezero.browser.createTab({
      contextKey: 'session:browser-e2e-session',
      context: { kind: 'workspace-session', sessionId: 'browser-e2e-session' },
      input: namedScriptedPopupPageUrl
    })
  }, { namedScriptedPopupPageUrl })
  await expect.poll(async () =>
    electronApp.evaluate(({ webContents }, { namedScriptedPopupPageUrl }) =>
      webContents.getAllWebContents().some((contents) => contents.getURL() === namedScriptedPopupPageUrl)
    , { namedScriptedPopupPageUrl })
  ).toBe(true)
  await new Promise((resolve) => setTimeout(resolve, 500))
  expect(await electronApp.evaluate(({ webContents }, { scriptedPopupTargetUrl }) =>
    webContents.getAllWebContents().every((contents) => contents.getURL() !== scriptedPopupTargetUrl)
  , { scriptedPopupTargetUrl })).toBe(true)

  await window.evaluate(async ({ delayedPopupPageUrl }) => {
    await window.spacezero.browser.createTab({
      contextKey: 'session:browser-e2e-session',
      context: { kind: 'workspace-session', sessionId: 'browser-e2e-session' },
      input: delayedPopupPageUrl
    })
  }, { delayedPopupPageUrl })
  await expect.poll(async () =>
    electronApp.evaluate(({ webContents }, { delayedPopupPageUrl }) =>
      webContents.getAllWebContents().some((contents) => contents.getURL() === delayedPopupPageUrl)
    , { delayedPopupPageUrl })
  ).toBe(true)
  await electronApp.evaluate(async ({ webContents }, { delayedPopupPageUrl }) => {
    const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === delayedPopupPageUrl)
    if (!contents) throw new Error('Embedded browser webContents was not found for delayed popup fixture.')
    const point = await contents.executeJavaScript(`(() => {
      const rect = document.querySelector('#delayed-popup').getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    })()`)
    contents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    contents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  }, { delayedPopupPageUrl })
  await new Promise((resolve) => setTimeout(resolve, 6600))
  expect(await electronApp.evaluate(({ webContents }, { scriptedPopupTargetUrl }) =>
    webContents.getAllWebContents().every((contents) => contents.getURL() !== scriptedPopupTargetUrl)
  , { scriptedPopupTargetUrl })).toBe(true)

  await window.evaluate(async ({ fixtureUrl }) => {
    const state = await window.spacezero.browser.getState({
      contextKey: 'session:browser-e2e-session',
      context: { kind: 'workspace-session', sessionId: 'browser-e2e-session' }
    })
    const fixtureTab = state.tabs.find((tab) => tab.url === fixtureUrl)
    if (!fixtureTab) throw new Error('Fixture tab was not found after scripted popup check.')
    await window.spacezero.browser.selectTab({
      contextKey: 'session:browser-e2e-session',
      context: { kind: 'workspace-session', sessionId: 'browser-e2e-session' },
      tabId: fixtureTab.id
    })
  }, { fixtureUrl })

  await electronApp.evaluate(async ({ webContents }, { fixtureUrl }) => {
    const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === fixtureUrl)
    if (!contents) throw new Error('Embedded browser webContents was not found for auth popup fixture.')
    const point = await contents.executeJavaScript(`(() => {
      const rect = document.querySelector('#auth-popup').getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    })()`)
    contents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    contents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  }, { fixtureUrl })
  await expect.poll(async () =>
    electronApp.evaluate(({ webContents }, { authPopupTargetUrl }) =>
      webContents.getAllWebContents().some((contents) => contents.getURL() === authPopupTargetUrl)
    , { authPopupTargetUrl })
  ).toBe(true)
  const authPopupIsolation = await electronApp.evaluate(async ({ session, webContents }, { authPopupTargetUrl }) => {
    const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === authPopupTargetUrl)
    if (!contents) throw new Error('Authentication popup webContents was not found.')
    return {
      openerAvailable: await contents.executeJavaScript('Boolean(window.opener)'),
      usesDedicatedProfile: contents.session === session.fromPartition('persist:spacezero-browser'),
      preferences: contents.getLastWebPreferences(),
      globals: await contents.executeJavaScript(`({ spacezero: typeof window.spacezero, electronRequire: typeof window.require })`)
    }
  }, { authPopupTargetUrl })
  expect(authPopupIsolation).toMatchObject({
    openerAvailable: true,
    usesDedicatedProfile: true,
    preferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    globals: { spacezero: 'undefined', electronRequire: 'undefined' }
  })
  await electronApp.evaluate(async ({ webContents }, { authPopupTargetUrl }) => {
    const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === authPopupTargetUrl)
    if (!contents) throw new Error('Authentication popup webContents was not found for descendant popup check.')
    await contents.executeJavaScript(`window.open('/scripted-popup-target', 'descendant-auth', 'width=320,height=240')`)
  }, { authPopupTargetUrl })
  await new Promise((resolve) => setTimeout(resolve, 500))
  expect(await electronApp.evaluate(({ webContents }, { scriptedPopupTargetUrl }) =>
    webContents.getAllWebContents().every((contents) => contents.getURL() !== scriptedPopupTargetUrl)
  , { scriptedPopupTargetUrl })).toBe(true)
  await electronApp.evaluate(async ({ webContents }, { authPopupTargetUrl }) => {
    const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === authPopupTargetUrl)
    if (!contents) throw new Error('Authentication popup webContents was not found to close.')
    await contents.executeJavaScript('window.close()')
  }, { authPopupTargetUrl })
  await expect.poll(async () =>
    electronApp.evaluate(({ webContents }, { authPopupTargetUrl }) =>
      webContents.getAllWebContents().every((contents) => contents.getURL() !== authPopupTargetUrl)
    , { authPopupTargetUrl })
  ).toBe(true)

  const contextIsolationTargets = [
    {
      name: 'workspace-original',
      contextKey: 'session:browser-e2e-session',
      context: { kind: 'workspace-session', sessionId: 'browser-e2e-session' },
      url: fixtureUrl
    },
    {
      name: 'project-1',
      contextKey: 'session:browser-project-session-1',
      context: { kind: 'project-session', projectId: 'browser-project-1', sessionId: 'browser-project-session-1' },
      url: `${fixtureUrl}?context=project-1`
    },
    {
      name: 'project-2',
      contextKey: 'session:browser-project-session-2',
      context: { kind: 'project-session', projectId: 'browser-project-2', sessionId: 'browser-project-session-2' },
      url: `${fixtureUrl}?context=project-2`
    },
    {
      name: 'workspace-2',
      contextKey: 'session:browser-workspace-2',
      context: { kind: 'workspace-session', sessionId: 'browser-workspace-2' },
      url: `${fixtureUrl}?context=workspace-2`
    },
    {
      name: 'knowledge-base',
      contextKey: 'knowledge-base',
      context: { kind: 'knowledge-base' },
      url: `${fixtureUrl}?context=knowledge-base`
    }
  ]
  const contextIsolationCreateTargets = contextIsolationTargets.slice(1)
  await window.evaluate(
    async ({ targets }) => {
      for (const target of targets) {
        await window.spacezero.browser.createTab({
          contextKey: target.contextKey,
          context: target.context,
          input: target.url
        })
      }
    },
    { targets: contextIsolationCreateTargets }
  )
  await expect.poll(async () =>
    electronApp.evaluate(({ webContents }, { urls }) => {
      const liveUrls = new Set(webContents.getAllWebContents().map((contents) => contents.getURL()))
      return urls.every((url) => liveUrls.has(url))
    }, { urls: contextIsolationTargets.map((target) => target.url) })
  ).toBe(true)
  const contextStates = await window.evaluate(async ({ targets }) =>
    Promise.all(
      targets.map(async (target) => ({
        name: target.name,
        url: target.url,
        state: await window.spacezero.browser.getState({
          contextKey: target.contextKey,
          context: target.context
        })
      }))
    )
  , { targets: contextIsolationTargets })
  expect(contextStates).toHaveLength(5)
  const expectedContextTabs = contextStates.map(({ name, url, state }) => {
    const expectedTabs = state.tabs.filter((tab) => tab.url === url)
    expect(expectedTabs, `${name} should contain its own Browser tab`).toHaveLength(1)
    for (const otherTarget of contextIsolationTargets.filter((target) => target.url !== url)) {
      expect(
        state.tabs.filter((tab) => tab.url === otherTarget.url),
        `${name} should not contain ${otherTarget.name}'s Browser tab`
      ).toHaveLength(0)
    }
    return { name, url, tabId: expectedTabs[0].id }
  })
  expect(new Set(expectedContextTabs.map((tab) => tab.tabId)).size).toBe(expectedContextTabs.length)
  for (const { name, state } of contextStates) {
    const foreignTabIds = expectedContextTabs
      .filter((tab) => tab.name !== name)
      .map((tab) => tab.tabId)
    expect(
      state.tabs.filter((tab) => foreignTabIds.includes(tab.id)),
      `${name} should not contain another context's Browser tab id`
    ).toHaveLength(0)
  }
  const contextIsolationResults = await electronApp.evaluate(async ({ session, webContents }, { urls }) => {
    return Promise.all(
      urls.map(async (url) => {
        const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === url)
        if (!contents) throw new Error(`Embedded Browser webContents was not found for ${url}`)
        return {
          url,
          preferences: contents.getLastWebPreferences(),
          usesDedicatedProfile: contents.session === session.fromPartition('persist:spacezero-browser'),
          globals: await contents.executeJavaScript(`({
            spacezero: typeof window.spacezero,
            electronRequire: typeof window.require,
            nodeProcess: typeof window.process
          })`)
        }
      })
    )
  }, { urls: contextIsolationTargets.map((target) => target.url) })
  expect(contextIsolationResults).toHaveLength(5)
  for (const result of contextIsolationResults) {
    expect(result.usesDedicatedProfile).toBe(true)
    expect(result.preferences.sandbox).toBe(true)
    expect(result.preferences.contextIsolation).toBe(true)
    expect(result.preferences.nodeIntegration).toBe(false)
    expect(result.globals).toMatchObject({
      spacezero: 'undefined',
      electronRequire: 'undefined'
    })
  }

  await window.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect.poll(async () =>
    electronApp.evaluate(({ BrowserWindow, webContents }, { fixtureUrl }) => {
      const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === fixtureUrl)
      const [mainWindow] = BrowserWindow.getAllWindows()
      return Boolean(contents && mainWindow.contentView.children.some((child) => child.webContents === contents))
    }, { fixtureUrl })
  ).toBe(false)
  await expect.poll(async () =>
    electronApp.evaluate(({ webContents }, { fixtureUrl }) =>
      webContents.getAllWebContents().some((contents) => contents.getURL() === fixtureUrl)
    , { fixtureUrl })
  ).toBe(true)

  await window.getByRole('button', { name: 'Browser', exact: true }).click()
  await expect.poll(async () =>
    electronApp.evaluate(({ BrowserWindow, webContents }, { fixtureUrl }) => {
      const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === fixtureUrl)
      const [mainWindow] = BrowserWindow.getAllWindows()
      return Boolean(contents && mainWindow.contentView.children.some((child) => child.webContents === contents))
    }, { fixtureUrl })
  ).toBe(true)

  await window.getByRole('button', { name: 'Toggle Tool Pane' }).click()
  await expect.poll(async () =>
    electronApp.evaluate(({ BrowserWindow, webContents }, { fixtureUrl }) => {
      const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === fixtureUrl)
      const [mainWindow] = BrowserWindow.getAllWindows()
      return Boolean(contents && mainWindow.contentView.children.some((child) => child.webContents === contents))
    }, { fixtureUrl })
  ).toBe(false)
  await expect.poll(async () =>
    electronApp.evaluate(({ webContents }, { fixtureUrl }) =>
      webContents.getAllWebContents().some((contents) => contents.getURL() === fixtureUrl)
    , { fixtureUrl })
  ).toBe(true)

  await electronApp.close()
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
})

test('restores Browser tabs lazily after restart with fresh runtime history', async () => {
  const server = await startBrowserFixtureServer()
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Browser fixture server did not bind.')
  const activeUrl = `http://127.0.0.1:${address.port}/browser-fixture?tab=active`
  const inactiveUrl = `http://127.0.0.1:${address.port}/browser-fixture?tab=inactive`
  const userDataPath = await mkdtemp(join(tmpdir(), 'spacezero-browser-restore-e2e-'))
  userDataDirectories.push(userDataPath)

  const firstLaunch = await launchApp(userDataPath)
  await firstLaunch.firstWindow()
  await firstLaunch.evaluate(({ app }) => {
    const { createRequire } = process.getBuiltinModule('node:module')
    const { join } = process.getBuiltinModule('node:path')
    const require = createRequire(`${app.getAppPath()}/package.json`)
    const Database = require('better-sqlite3')
    const database = new Database(join(app.getPath('userData'), 'spacezero.sqlite3'))
    const timestamp = Date.now()
    database
      .prepare(
        `INSERT OR IGNORE INTO sessions (id, project_id, title, status, created_at, updated_at, managed_context)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run('browser-restore-session', null, 'Browser Restore', 'idle', timestamp, timestamp, null)
    database.close()
  })
  await firstLaunch.close()

  const secondLaunch = await launchApp(userDataPath)
  const window = await secondLaunch.firstWindow()
  await secondLaunch.evaluate(
    ({ app }, { activeUrl, inactiveUrl }) => {
      const { createRequire } = process.getBuiltinModule('node:module')
      const { join } = process.getBuiltinModule('node:path')
      const require = createRequire(`${app.getAppPath()}/package.json`)
      const Database = require('better-sqlite3')
      const database = new Database(join(app.getPath('userData'), 'spacezero.sqlite3'))
      const timestamp = Date.now()
      const insert = database.prepare(
        `INSERT OR REPLACE INTO browser_tabs (
          context_key,
          context_kind,
          context_session_id,
          context_project_id,
          tab_id,
          sort_order,
          active,
          url,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      insert.run('session:browser-restore-session', 'workspace-session', 'browser-restore-session', null, 'browser-tab-restore-inactive', 0, 0, inactiveUrl, timestamp)
      insert.run('session:browser-restore-session', 'workspace-session', 'browser-restore-session', null, 'browser-tab-restore-active', 1, 1, activeUrl, timestamp)
      insert.run('session:browser-restore-session', 'workspace-session', 'browser-restore-session', null, 'browser-tab-restore-blank', 2, 0, null, timestamp)
      database.close()
    },
    { activeUrl, inactiveUrl }
  )

  const contextRequest = {
    contextKey: 'session:browser-restore-session',
    context: { kind: 'workspace-session' as const, sessionId: 'browser-restore-session' }
  }

  const restored = await window.evaluate((request) => window.spacezero.browser.getState(request), contextRequest)
  expect(restored.tabs.map((tab) => ({ id: tab.id, url: tab.url }))).toEqual([
    { id: 'browser-tab-restore-inactive', url: inactiveUrl },
    { id: 'browser-tab-restore-active', url: activeUrl },
    { id: 'browser-tab-restore-blank', url: null }
  ])
  expect(restored.activeTabId).toBe('browser-tab-restore-active')
  await expect.poll(async () =>
    secondLaunch.evaluate(({ webContents }, { activeUrl, inactiveUrl }) =>
      webContents
        .getAllWebContents()
        .filter((contents) => [activeUrl, inactiveUrl].includes(contents.getURL())).length,
    { activeUrl, inactiveUrl })
  ).toBe(0)

  await window.evaluate((request) =>
    window.spacezero.browser.show({
      ...request,
      bounds: { x: 10, y: 10, width: 320, height: 240 },
      shortcutBindings: []
    }), contextRequest)
  await expect.poll(async () =>
    secondLaunch.evaluate(({ webContents }, { activeUrl }) =>
      webContents.getAllWebContents().some((contents) => contents.getURL() === activeUrl),
    { activeUrl })
  ).toBe(true)
  await expect.poll(async () =>
    secondLaunch.evaluate(({ webContents }, { inactiveUrl }) =>
      webContents.getAllWebContents().some((contents) => contents.getURL() === inactiveUrl),
    { inactiveUrl })
  ).toBe(false)

  const activeHistory = await secondLaunch.evaluate(({ webContents }, { activeUrl }) => {
    const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === activeUrl)
    return { canGoBack: contents?.navigationHistory.canGoBack() ?? true }
  }, { activeUrl })
  expect(activeHistory.canGoBack).toBe(false)

  await window.evaluate((request) =>
    window.spacezero.browser.selectTab({ ...request, tabId: 'browser-tab-restore-inactive' }), contextRequest)
  await expect.poll(async () =>
    secondLaunch.evaluate(({ webContents }, { inactiveUrl }) =>
      webContents.getAllWebContents().some((contents) => contents.getURL() === inactiveUrl),
    { inactiveUrl })
  ).toBe(true)

  await secondLaunch.close()
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
})

test('enforces Browser permission and certificate policy through real Electron handlers', async () => {
  const httpServer = await startBrowserFixtureServer()
  const httpAddress = httpServer.address()
  if (!httpAddress || typeof httpAddress === 'string') throw new Error('Browser HTTP fixture server did not bind.')
  const httpUrl = `http://127.0.0.1:${httpAddress.port}/browser-fixture`

  const certificateDirectory = await mkdtemp(join(tmpdir(), 'spacezero-browser-cert-e2e-'))
  const httpsServer = await startHttpsBrowserFixtureServer(certificateDirectory)
  const httpsAddress = httpsServer.address()
  if (!httpsAddress || typeof httpsAddress === 'string') throw new Error('Browser HTTPS fixture server did not bind.')
  const exactLoopbackHttpsUrl = `https://localhost:${httpsAddress.port}/browser-fixture`
  const aliasLoopbackHttpsUrl = `https://127.1:${httpsAddress.port}/browser-fixture`
  const redirectToAliasHttpsUrl = `https://localhost:${httpsAddress.port}/redirect-to-lookalike`

  const electronApp = await launchApp()
  const window = await electronApp.firstWindow()

  try {
    await electronApp.evaluate(({ app, ipcMain, BrowserWindow, dialog }) => {
      const { createRequire } = process.getBuiltinModule('node:module')
      const { join } = process.getBuiltinModule('node:path')
      const require = createRequire(`${app.getAppPath()}/package.json`)
      const Database = require('better-sqlite3')
      const database = new Database(join(app.getPath('userData'), 'spacezero.sqlite3'))
      const timestamp = Date.now()
      database
        .prepare(
          `INSERT OR IGNORE INTO sessions (id, project_id, title, status, created_at, updated_at, managed_context)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run('browser-permissions-e2e', null, 'Browser Permissions E2E', 'idle', timestamp, timestamp, null)
      database.close()

      for (const channel of [
        'onboarding:getStatus',
        'onboarding:complete',
        'sessions:listProjectSessions',
        'sessions:listWorkspaceSessions',
        'projects:list',
        'agent:getState'
      ]) {
        ipcMain.removeHandler(channel)
      }
      ipcMain.handle('onboarding:getStatus', () => ({ completed: true }))
      ipcMain.handle('onboarding:complete', () => ({ completed: true }))
      ipcMain.handle('projects:list', () => [])
      ipcMain.handle('sessions:listProjectSessions', () => [])
      ipcMain.handle('sessions:listWorkspaceSessions', () => [
        {
          id: 'browser-permissions-e2e',
          kind: 'workspace',
          title: 'Browser Permissions E2E',
          status: 'idle',
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString()
        }
      ])
      ipcMain.handle('agent:getState', () => ({
        sessionId: 'browser-permissions-e2e',
        kind: 'workspace',
        status: 'idle',
        title: 'Browser Permissions E2E',
        messages: [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }))
      const originalShowMessageBox = dialog.showMessageBox.bind(dialog)
      let promptCount = 0
      dialog.showMessageBox = async (...args) => {
        promptCount += 1
        const options = args.at(-1) as { title?: string } | undefined
        if (options?.title?.includes('permission') || options?.title?.includes('certificate')) {
          return { response: 0, checkboxChecked: false }
        }
        return originalShowMessageBox(...args)
      }
      const certificateErrorUrls: string[] = []
      app.on('certificate-error', (_event, _webContents, url) => {
        certificateErrorUrls.push(url)
      })
      ;(globalThis as {
        __spacezeroBrowserPromptCount?: () => number
        __spacezeroBrowserCertificateErrorUrls?: () => string[]
      }).__spacezeroBrowserPromptCount = () => promptCount
      ;(globalThis as {
        __spacezeroBrowserPromptCount?: () => number
        __spacezeroBrowserCertificateErrorUrls?: () => string[]
      }).__spacezeroBrowserCertificateErrorUrls = () => [...certificateErrorUrls]
      BrowserWindow.getAllWindows()[0]?.webContents.reload()
    })

    await window.getByRole('button', { name: /Browser Permissions E2E/ }).click()
    await window.getByRole('button', { name: 'Browser', exact: true }).click()
    await window.getByLabel('Browser URL').fill(httpUrl)
    await window.getByRole('button', { name: 'Go' }).click()
    await expect.poll(async () =>
      electronApp.evaluate(({ webContents }, { httpUrl }) =>
        webContents.getAllWebContents().some((contents) => contents.getURL() === httpUrl)
      , { httpUrl })
    ).toBe(true)

    const visiblePermission = await electronApp.evaluate(async ({ webContents }, { httpUrl }) => {
      const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === httpUrl)
      if (!contents) throw new Error('Permission fixture webContents was not found.')
      return contents.executeJavaScript('Notification.requestPermission()')
    }, { httpUrl })
    expect(visiblePermission).toBe('granted')
    await expect.poll(async () =>
      electronApp.evaluate(() => (globalThis as { __spacezeroBrowserPromptCount?: () => number }).__spacezeroBrowserPromptCount?.() ?? 0)
    ).toBe(1)
    const unsupportedPermission = await electronApp.evaluate(async ({ webContents }, { httpUrl }) => {
      const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === httpUrl)
      if (!contents) throw new Error('Permission fixture webContents was not found.')
      return contents.executeJavaScript(`navigator.permissions
        .query({ name: 'window-management' })
        .then((permission) => permission.state)
        .catch((error) => error.name)`)
    }, { httpUrl })
    expect(unsupportedPermission).not.toBe('granted')
    await expect.poll(async () =>
      electronApp.evaluate(() => (globalThis as { __spacezeroBrowserPromptCount?: () => number }).__spacezeroBrowserPromptCount?.() ?? 0)
    ).toBe(1)

    await window.getByRole('button', { name: 'Terminal', exact: true }).click()
    const hiddenPermission = await electronApp.evaluate(async ({ webContents }, { httpUrl }) => {
      const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === httpUrl)
      if (!contents) throw new Error('Hidden permission fixture webContents was not found.')
      return contents.executeJavaScript('Notification.requestPermission()')
    }, { httpUrl })
    expect(hiddenPermission).toBe('denied')

    await window.getByRole('button', { name: 'Browser', exact: true }).click()
    await window.evaluate(async ({ url }) => {
      await window.spacezero.browser.createTab({
        contextKey: 'session:browser-permissions-e2e',
        context: { kind: 'workspace-session', sessionId: 'browser-permissions-e2e' },
        input: url
      })
    }, { url: exactLoopbackHttpsUrl })
    await expect.poll(async () =>
      electronApp.evaluate(({ webContents }, { url }) =>
        webContents.getAllWebContents().some((contents) => contents.getURL() === url)
      , { url: exactLoopbackHttpsUrl })
    ).toBe(true)
    const exactCertificateBody = await electronApp.evaluate(async ({ webContents }, { url }) => {
      const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === url)
      if (!contents) throw new Error('Exact-loopback HTTPS fixture webContents was not found.')
      return contents.executeJavaScript('document.body.textContent')
    }, { url: exactLoopbackHttpsUrl })
    expect(exactCertificateBody).toContain('Browser fixture')

    const promptsAfterExactCertificate = await electronApp.evaluate(() =>
      (globalThis as { __spacezeroBrowserPromptCount?: () => number }).__spacezeroBrowserPromptCount?.() ?? 0
    )
    expect(promptsAfterExactCertificate).toBe(2)

    await window.evaluate(async ({ url }) => {
      await window.spacezero.browser.createTab({
        contextKey: 'session:browser-permissions-e2e',
        context: { kind: 'workspace-session', sessionId: 'browser-permissions-e2e' },
        input: url
      })
    }, { url: redirectToAliasHttpsUrl })
    await expect.poll(async () =>
      electronApp.evaluate(() =>
        (globalThis as { __spacezeroBrowserCertificateErrorUrls?: () => string[] })
          .__spacezeroBrowserCertificateErrorUrls?.()
          .some((url) => url.includes('127.1') || url.includes('127.0.0.1')) ?? false
      )
    ).toBe(true)
    const redirectedAliasCertificateBody = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const [mainWindow] = BrowserWindow.getAllWindows()
      const browserView = mainWindow.contentView.children.at(-1)
      if (!browserView) throw new Error('Redirected certificate fixture webContents was not found.')
      return browserView.webContents.executeJavaScript('document.body.textContent').catch(() => '')
    })
    expect(redirectedAliasCertificateBody).not.toContain('Browser fixture')
    await expect.poll(async () =>
      electronApp.evaluate(() => (globalThis as { __spacezeroBrowserPromptCount?: () => number }).__spacezeroBrowserPromptCount?.() ?? 0)
    ).toBe(promptsAfterExactCertificate)

    await window.evaluate(async ({ url }) => {
      await window.spacezero.browser.createTab({
        contextKey: 'session:browser-permissions-e2e',
        context: { kind: 'workspace-session', sessionId: 'browser-permissions-e2e' },
        input: url
      })
    }, { url: aliasLoopbackHttpsUrl })
    await expect.poll(async () =>
      electronApp.evaluate(() =>
        (globalThis as { __spacezeroBrowserCertificateErrorUrls?: () => string[] })
          .__spacezeroBrowserCertificateErrorUrls?.()
          .some((url) => url.includes('127.1') || url.includes('127.0.0.1')) ?? false
      )
    ).toBe(true)
    const aliasCertificateBody = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const [mainWindow] = BrowserWindow.getAllWindows()
      const browserView = mainWindow.contentView.children.at(-1)
      if (!browserView) throw new Error('Alias certificate fixture webContents was not found.')
      return browserView.webContents.executeJavaScript('document.body.textContent').catch(() => '')
    })
    expect(aliasCertificateBody).not.toContain('Browser fixture')
    await expect.poll(async () =>
      electronApp.evaluate(() => (globalThis as { __spacezeroBrowserPromptCount?: () => number }).__spacezeroBrowserPromptCount?.() ?? 0)
    ).toBe(promptsAfterExactCertificate)

    const browserDefaults = await electronApp.evaluate(({ session, webContents }, { urls }) =>
      urls.map((url) => {
        const contents = webContents.getAllWebContents().find((candidate) => candidate.getURL() === url)
        if (!contents) throw new Error(`Browser webContents was not found for ${url}`)
        const preferences = contents.getLastWebPreferences()
        return {
          usesDedicatedProfile: contents.session === session.fromPartition('persist:spacezero-browser'),
          sandbox: preferences.sandbox,
          contextIsolation: preferences.contextIsolation,
          nodeIntegration: preferences.nodeIntegration
        }
      })
    , { urls: [httpUrl, exactLoopbackHttpsUrl] })
    expect(browserDefaults).toEqual([
      { usesDedicatedProfile: true, sandbox: true, contextIsolation: true, nodeIntegration: false },
      { usesDedicatedProfile: true, sandbox: true, contextIsolation: true, nodeIntegration: false }
    ])
  } finally {
    await electronApp.close().catch(() => undefined)
    await new Promise<void>((resolve, reject) => httpServer.close((error) => (error ? reject(error) : resolve())))
    await new Promise<void>((resolve, reject) => httpsServer.close((error) => (error ? reject(error) : resolve())))
    await rm(certificateDirectory, { recursive: true, force: true })
  }
})

async function startBrowserFixtureServer(): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/download.txt')) {
      response.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': 'attachment; filename="fixture-download.txt"'
      })
      response.end('spacezero browser download fixture')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    if (request.url?.startsWith('/new-window-target')) {
      response.end('<!doctype html><title>New Window Target</title><h1>New window target</h1>')
      return
    }
    if (request.url?.startsWith('/scripted-popup-page')) {
      response.end(`<!doctype html><title>Scripted Popup Page</title><h1>Scripted popup page</h1><script>setTimeout(() => window.open('/scripted-popup-target', '_blank'), 50)</script>`)
      return
    }
    if (request.url?.startsWith('/delayed-popup-page')) {
      response.end(`<!doctype html><title>Delayed Popup Page</title><h1>Delayed popup page</h1><button id="delayed-popup" onclick="setTimeout(() => window.open('/scripted-popup-target', '_blank'), 6200)">Delayed popup</button>`)
      return
    }
    if (request.url?.startsWith('/named-scripted-popup-page')) {
      response.end(`<!doctype html><title>Named Scripted Popup Page</title><h1>Named scripted popup page</h1><script>window.open('/scripted-popup-target', 'spacezero-auth', 'width=480,height=640')</script>`)
      return
    }
    if (request.url?.startsWith('/scripted-popup-target')) {
      response.end('<!doctype html><title>Scripted Popup Target</title><h1>Scripted popup target</h1>')
      return
    }
    if (request.url?.startsWith('/auth-popup-target')) {
      response.end(`<!doctype html><title>Auth Popup Target</title><h1>Auth popup target</h1><script>window.opener.postMessage('auth-ready', '*')</script>`)
      return
    }
    response.end(`<!doctype html><title>Space Zero Browser Fixture</title><h1>Browser fixture</h1>
      <a id="target-blank" href="/new-window-target" target="_blank">Open target blank</a>
      <a id="download-link" href="/download.txt" download>Download fixture</a>
      <button id="scripted-popup" onclick="window.open('/scripted-popup-target', '_blank')">Scripted popup</button>
      <button id="auth-popup" onclick="window.open('/auth-popup-target', 'spacezero-auth', 'width=480,height=640')">Auth popup</button>`)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  return server
}

async function startHttpsBrowserFixtureServer(directory: string): Promise<HttpsServer> {
  const keyPath = join(directory, 'localhost.key')
  const certPath = join(directory, 'localhost.crt')
  await execFileAsync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
    '-days',
    '1'
  ])
  const { readFile } = await import('node:fs/promises')
  const server = createHttpsServer(
    { key: await readFile(keyPath), cert: await readFile(certPath) },
    (request, response) => {
      if (request.url?.startsWith('/redirect-to-lookalike')) {
        const port = request.headers.host?.split(':').at(-1)
        response.writeHead(302, { location: `https://127.1:${port}/browser-fixture` })
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><title>Space Zero Browser Fixture</title><h1>Browser fixture</h1>')
    }
  )
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  return server
}
