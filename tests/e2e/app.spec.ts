import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import { execFile } from 'node:child_process'
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

  await window.getByRole('button', { name: 'Skip' }).click()
  await window.getByRole('button', { name: 'files-e2e', exact: true }).click()
  await window.getByRole('button', { name: 'Files E2E' }).click()
  await window.getByRole('button', { name: 'Toggle Tool Pane' }).click()
  await expect(window.getByRole('tree', { name: 'Project files' })).toBeVisible()
  await window.getByText('package.json').click()
  await expect(window.locator('.monaco-editor')).toBeVisible()
  await expect(window.getByText('Saved')).toBeVisible()

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

  await window.getByRole('button', { name: 'Pin preview' }).click()
  await window.getByText('NOTES.md').click()
  await expect(window.getByRole('textbox', { name: 'Rich Markdown editor' })).toContainText(
    'Second note'
  )
  await window.getByRole('button', { name: 'Pin preview' }).click()
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
    await window.getByRole('button', { name: 'Skip' }).click()
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
    for (const label of ['Git', 'Browser', 'Terminal']) {
      await expect(window.getByRole('button', { name: `${label} — Coming soon` })).toBeDisabled()
    }
    await expect(window.getByRole('button', { name: 'Toggle Tool Pane' })).toBeEnabled()
    await window.getByRole('button', { name: 'Toggle Tool Pane' }).click()
    await expect(window.getByRole('tree', { name: 'Files' })).toBeVisible()
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
    await window.getByRole('button', { name: 'Knowledge Base' }).click()
    await expect(window.getByPlaceholder('Ask about your Knowledge Base…')).toBeVisible()
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
