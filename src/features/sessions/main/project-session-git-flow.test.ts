import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentSessionState } from '../../../shared/agent-protocol'
import { createManagedProjectAgentSession } from '../../agent-workspace/main/agent-session-handler'
import type { AgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import {
  createProjectPathAdapter,
  normalizeExistingProjectPath
} from '../../projects/main/project-path.adapter'
import { createManagedWorktreeAdapter } from './managed-worktree.adapter'
import { createManagedWorktreeService } from './managed-worktree.service'
import { createSessionCleanupService } from './session-cleanup.service'
import type { SessionsRepository, StoredSession } from './sessions.service'

const execFileAsync = promisify(execFile)
const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

async function runRealGit(request: {
  args: string[]
  environment?: NodeJS.ProcessEnv
  allowFailure?: boolean
}): Promise<{ stdout: string; exitCode: number }> {
  try {
    const { stdout } = await execFileAsync('git', request.args, {
      env: request.environment,
      encoding: 'utf8'
    })
    return { stdout, exitCode: 0 }
  } catch (error) {
    if (request.allowFailure) {
      return {
        stdout:
          typeof error === 'object' && error !== null && 'stdout' in error
            ? String(error.stdout)
            : '',
        exitCode:
          typeof error === 'object' && error !== null && 'code' in error
            ? Number(error.code) || 1
            : 1
      }
    }
    throw error
  }
}

async function createGitRepository(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await runRealGit({ args: ['init', '-b', 'main', path] })
  await runRealGit({ args: ['-C', path, 'config', 'user.name', 'Space Zero Test'] })
  await runRealGit({ args: ['-C', path, 'config', 'user.email', 'test@spacezero.dev'] })
  await writeFile(join(path, 'README.md'), '# Test\n')
  await runRealGit({ args: ['-C', path, 'add', 'README.md'] })
  await runRealGit({ args: ['-C', path, 'commit', '-m', 'initial'] })
}

function createRepository(
  projectPath: string,
  { failFirstCreate = false }: { failFirstCreate?: boolean } = {}
): SessionsRepository & { storedSessions: StoredSession[] } {
  const storedSessions: StoredSession[] = []
  let createAttempts = 0

  return {
    storedSessions,
    async listProjectSessions() {
      return storedSessions.filter((session) => session.projectId !== null)
    },
    async listWorkspaceSessions() {
      return storedSessions.filter((session) => session.projectId === null)
    },
    async create(session) {
      createAttempts += 1
      if (failFirstCreate && createAttempts === 1) throw new Error('db write failed')
      storedSessions.push(session)
      return session
    },
    async countByProjectId(projectId) {
      return storedSessions.filter((session) => session.projectId === projectId).length
    },
    async countWorkspaceSessions() {
      return storedSessions.filter((session) => session.projectId === null).length
    },
    async projectExists(projectId) {
      return projectId === 'project-1'
    },
    async findProjectById(projectId) {
      return projectId === 'project-1' ? { id: projectId, path: projectPath } : undefined
    },
    async findSessionById(sessionId) {
      return storedSessions.find((session) => session.id === sessionId)
    },
    async update(session) {
      const index = storedSessions.findIndex((candidate) => candidate.id === session.id)
      if (index >= 0) storedSessions[index] = session
      return session
    },
    async deleteById(sessionId) {
      const index = storedSessions.findIndex((session) => session.id === sessionId)
      if (index >= 0) storedSessions.splice(index, 1)
    },
    async listByProjectIdIncludingArchived(projectId) {
      return storedSessions.filter((session) => session.projectId === projectId)
    },
    async updateMany(sessions) {
      for (const session of sessions) await this.update(session)
      return sessions
    },
    async deleteByProjectId(projectId) {
      for (let index = storedSessions.length - 1; index >= 0; index -= 1) {
        if (storedSessions[index].projectId === projectId) storedSessions.splice(index, 1)
      }
    }
  }
}

type CreateUtilitySessionRequest = Parameters<AgentUtilityProcessHost['createSession']>[0]

function createState(request: CreateUtilitySessionRequest): AgentSessionState {
  return {
    sessionId: request.sessionId,
    kind: request.kind,
    projectId: request.projectId,
    cwd: request.cwd,
    status: 'idle',
    live: true,
    transcriptPath: `/agent/sessions/${request.sessionId}.jsonl`,
    modelProvider: 'faux',
    modelId: 'faux-1',
    thinkingLevel: 'medium'
  }
}

const readModelDefaults = async () => ({
  defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
  defaultThinking: 'high' as const
})

describe('Project Session real Git flows', () => {
  it('creates a managed New session from a public Create empty Project flow', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-empty-project-session-test-'))
    temporaryPaths.push(root)
    const projectPath = await createProjectPathAdapter({
      getProjectsPath: async () => join(root, 'projects')
    }).createEmptyProjectDirectory('Empty Project')
    const repository = createRepository(projectPath)
    const worktrees = createManagedWorktreeService({
      adapter: createManagedWorktreeAdapter(),
      getWorktreesPath: async () => join(root, 'worktrees')
    })
    const utilityHost = {
      createSession: vi.fn(async (request: CreateUtilitySessionRequest) => createState(request)),
      deleteSession: vi.fn(async () => undefined)
    }

    const { state, session } = await createManagedProjectAgentSession(
      { projectId: 'project-1' },
      {
        repository,
        utilityHost,
        worktrees,
        createSessionId: () => 'session-1',
        readModelDefaults
      }
    )

    expect(state.cwd).toBe(join(root, 'worktrees', 'project-1', 'session-1'))
    expect(state.cwd).not.toBe(projectPath)
    expect(
      (await runRealGit({ args: ['-C', state.cwd, 'rev-parse', '--show-toplevel'] })).stdout.trim()
    ).toBe(state.cwd)
    await expect(
      worktrees.validate({
        projectPath,
        projectId: 'project-1',
        sessionId: 'session-1',
        worktree: session.worktree!
      })
    ).resolves.toBe(true)
  })

  it('normalizes a selected repository subdirectory before creating a real worktree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-folder-project-session-test-'))
    temporaryPaths.push(root)
    const repositoryRoot = join(root, 'project')
    await createGitRepository(repositoryRoot)
    const selectedSubdirectory = join(repositoryRoot, 'packages', 'desktop')
    await mkdir(selectedSubdirectory, { recursive: true })
    const projectPath = normalizeExistingProjectPath(selectedSubdirectory)
    const repository = createRepository(projectPath)
    const worktrees = createManagedWorktreeService({
      adapter: createManagedWorktreeAdapter(),
      getWorktreesPath: async () => join(root, 'worktrees')
    })

    expect(projectPath).toBe(repositoryRoot)
    await expect(
      createManagedProjectAgentSession(
        { projectId: 'project-1' },
        {
          repository,
          utilityHost: {
            createSession: async (request) => createState(request),
            deleteSession: async () => undefined
          },
          worktrees,
          createSessionId: () => 'session-1',
          readModelDefaults
        }
      )
    ).resolves.toMatchObject({
      state: { cwd: join(root, 'worktrees', 'project-1', 'session-1') }
    })
    await expect(
      createManagedWorktreeAdapter().create({
        projectPath: selectedSubdirectory,
        destination: join(root, 'worktrees', 'project-1', 'raw-subdirectory-session'),
        branch: 'spacezero/session-raw-subdirectory-session',
        startPoint: { kind: 'current-head' }
      })
    ).rejects.toThrow('session.projectNotRepositoryRoot')
  })

  it('retains recovery metadata across utility rollback and verified worktree cleanup failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-session-recovery-test-'))
    temporaryPaths.push(root)
    const projectPath = join(root, 'project')
    await createGitRepository(projectPath)
    const repository = createRepository(projectPath, { failFirstCreate: true })
    const worktreesPath = join(root, 'worktrees')
    const worktrees = createManagedWorktreeService({
      adapter: createManagedWorktreeAdapter(),
      getWorktreesPath: async () => worktreesPath
    })
    const utilityHost = {
      createSession: vi.fn(async (request: CreateUtilitySessionRequest) => createState(request)),
      deleteSession: vi.fn(async () => {
        throw new Error('utility cleanup failed')
      })
    }

    await expect(
      createManagedProjectAgentSession(
        { projectId: 'project-1' },
        {
          repository,
          utilityHost,
          worktrees,
          createSessionId: () => 'session-1',
          readModelDefaults
        }
      )
    ).rejects.toThrow('session.creationRollbackFailed')

    const recoverySession = await repository.findSessionById('session-1')
    expect(recoverySession).toMatchObject({
      worktreePath: join(worktreesPath, 'project-1', 'session-1'),
      worktreeBranch: 'spacezero/session-session-1'
    })
    await expect(access(recoverySession!.worktreePath!)).resolves.toBeUndefined()

    const failedRemovalRequests: string[][] = []
    const failingRemovalWorktrees = createManagedWorktreeService({
      adapter: createManagedWorktreeAdapter({
        runGit: async (request) => {
          failedRemovalRequests.push(request.args)
          if (request.args.includes('worktree') && request.args.includes('remove')) {
            return { stdout: '', exitCode: 1 }
          }
          return runRealGit(request)
        }
      }),
      getWorktreesPath: async () => worktreesPath
    })
    await expect(
      failingRemovalWorktrees.validate({
        projectPath,
        projectId: 'project-1',
        sessionId: 'session-1',
        worktree: {
          path: recoverySession!.worktreePath!,
          branch: recoverySession!.worktreeBranch!,
          baseRevision: recoverySession!.worktreeBaseRevision!
        }
      })
    ).resolves.toBe(true)

    const cleanup = createSessionCleanupService({
      repository,
      worktrees: failingRemovalWorktrees,
      deleteUtilitySession: async () => undefined,
      removeTranscript: async () => undefined
    })
    await expect(cleanup.deleteSession('session-1')).rejects.toThrow('session.worktreeRemoveFailed')
    await expect(repository.findSessionById('session-1')).resolves.toBe(recoverySession)
    await expect(access(recoverySession!.worktreePath!)).resolves.toBeUndefined()
    expect(
      failedRemovalRequests.some(
        (args) => args.includes('worktree') && args.includes('list') && args.includes('--porcelain')
      )
    ).toBe(true)
  })
})
