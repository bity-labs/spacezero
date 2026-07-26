import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { createKnowledgeBaseOperationCoordinator } from './knowledge-base-operation-coordinator'
import { createKnowledgeBaseGitAgentService } from './knowledge-base-git-agent.service'

const execFileAsync = promisify(execFile)

async function runGit(cwd: string, args: readonly string[]) {
  const { stdout, stderr } = await execFileAsync('git', [...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  })
  return { stdout, stderr }
}

async function createRepo() {
  const root = await mkdtemp(join(tmpdir(), 'spacezero-issue-176-kb-git-'))
  await runGit(root, ['init'])
  await runGit(root, ['config', 'user.email', 'builder@example.com'])
  await runGit(root, ['config', 'user.name', 'Builder'])
  await writeFile(join(root, 'README.md'), '# Knowledge Base\n', 'utf8')
  await runGit(root, ['add', 'README.md'])
  await runGit(root, ['commit', '-m', 'Initial commit'])
  return root
}

function createService(root: string) {
  return createKnowledgeBaseGitAgentService({
    rootProvider: { getVerifiedRoot: async () => root },
    host: { runGit },
    operations: createKnowledgeBaseOperationCoordinator()
  })
}

describe('createKnowledgeBaseGitAgentService', () => {
  it('resolves the verified root for each call and stages, unstages, and commits whole files', async () => {
    const root = await createRepo()
    try {
      const service = createService(root)
      await mkdir(join(root, 'notes'))
      await writeFile(join(root, 'notes', 'today.md'), 'Today\n', 'utf8')

      await expect(service.inspectRepository()).resolves.toMatchObject({
        branch: expect.any(String),
        origin: { configured: false },
        porcelainStatus: expect.stringContaining('notes/today.md')
      })

      await service.stageFiles({ relativePaths: ['notes/today.md'] })
      await expect(runGit(root, ['diff', '--cached', '--name-only'])).resolves.toMatchObject({
        stdout: 'notes/today.md\n'
      })

      await service.unstageFiles({ relativePaths: ['notes/today.md'] })
      await expect(runGit(root, ['diff', '--cached', '--name-only'])).resolves.toMatchObject({
        stdout: ''
      })

      await service.stageFiles({ relativePaths: ['notes/today.md'] })
      await expect(service.createCommit({ message: 'Add today note' })).resolves.toMatchObject({
        output: expect.stringContaining('Add today note')
      })
      await expect(readFile(join(root, 'notes', 'today.md'), 'utf8')).resolves.toBe('Today\n')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('sanitizes origin URLs in results and redacts secrets from Git errors', async () => {
    const root = await createRepo()
    try {
      const service = createService(root)

      await expect(
        service.configureOrigin({ gitUrl: 'https://token@example.com/org/kb.git?secret=yes' })
      ).resolves.toEqual({ configured: true, url: 'https://example.com/org/kb.git' })
      await expect(service.getOriginRemote()).resolves.toEqual({
        configured: true,
        url: 'https://example.com/org/kb.git'
      })

      await runGit(root, ['remote', 'set-url', 'origin', 'https://token@example.invalid/org/kb.git'])
      await expect(service.push()).rejects.toThrow('https://example.invalid/org/kb.git')
      await expect(service.push()).rejects.not.toThrow('token@')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports a local-only Knowledge Base when push is requested without origin', async () => {
    const root = await createRepo()
    try {
      const service = createService(root)

      await expect(service.getOriginRemote()).resolves.toEqual({ configured: false })
      await expect(service.push()).rejects.toThrow('origin remote is not configured')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
