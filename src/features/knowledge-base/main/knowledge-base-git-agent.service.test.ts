import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
  await runGit(root, ['checkout', '-B', 'main'])
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

  it('uses literal whole-file paths when staging and unstaging', async () => {
    const root = await createRepo()
    try {
      const service = createService(root)
      await writeFile(join(root, 'ordinary.md'), 'ordinary\n', 'utf8')
      await writeFile(join(root, 'unrelated.md'), 'unrelated\n', 'utf8')

      await expect(service.stageFiles({ relativePaths: ['ordinary.md'] })).resolves.toEqual({
        stagedPaths: ['ordinary.md']
      })
      await expect(runGit(root, ['diff', '--cached', '--name-only'])).resolves.toMatchObject({
        stdout: 'ordinary.md\n'
      })

      await expect(
        service.stageFiles({ relativePaths: [':(top,glob)**'] })
      ).rejects.toThrow()
      await expect(runGit(root, ['diff', '--cached', '--name-only'])).resolves.toMatchObject({
        stdout: 'ordinary.md\n'
      })

      await runGit(root, ['add', 'unrelated.md'])
      await expect(
        service.unstageFiles({ relativePaths: [':(top,glob)**'] })
      ).rejects.toThrow()
      await expect(runGit(root, ['diff', '--cached', '--name-only'])).resolves.toMatchObject({
        stdout: 'ordinary.md\nunrelated.md\n'
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects directory-wide staging selectors', async () => {
    const root = await createRepo()
    try {
      const service = createService(root)
      await mkdir(join(root, 'notes'))
      await writeFile(join(root, 'notes', 'one.md'), 'one\n', 'utf8')

      await expect(service.stageFiles({ relativePaths: ['notes'] })).rejects.toThrow(
        'must name a whole file'
      )
      await expect(runGit(root, ['diff', '--cached', '--name-only'])).resolves.toMatchObject({
        stdout: ''
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects absent directories that would stage multiple tracked deletions', async () => {
    const root = await createRepo()
    try {
      const service = createService(root)
      await mkdir(join(root, 'notes'))
      await writeFile(join(root, 'notes', 'one.md'), 'one\n', 'utf8')
      await writeFile(join(root, 'notes', 'two.md'), 'two\n', 'utf8')
      await runGit(root, ['add', 'notes/one.md', 'notes/two.md'])
      await runGit(root, ['commit', '-m', 'Add notes'])
      await rm(join(root, 'notes'), { recursive: true })

      await expect(service.stageFiles({ relativePaths: ['notes'] })).rejects.toThrow(
        'must name a whole file'
      )
      await expect(runGit(root, ['diff', '--cached', '--name-only'])).resolves.toMatchObject({
        stdout: ''
      })

      await expect(service.stageFiles({ relativePaths: ['notes/one.md'] })).resolves.toEqual({
        stagedPaths: ['notes/one.md']
      })
      await expect(runGit(root, ['diff', '--cached', '--name-only'])).resolves.toMatchObject({
        stdout: 'notes/one.md\n'
      })

      await expect(service.unstageFiles({ relativePaths: ['notes'] })).rejects.toThrow(
        'must name a whole file'
      )
      await expect(runGit(root, ['diff', '--cached', '--name-only'])).resolves.toMatchObject({
        stdout: 'notes/one.md\n'
      })

      await expect(service.unstageFiles({ relativePaths: ['notes/one.md'] })).resolves.toEqual({
        unstagedPaths: ['notes/one.md']
      })
      await expect(runGit(root, ['diff', '--cached', '--name-only'])).resolves.toMatchObject({
        stdout: ''
      })
      await expect(service.stageFiles({ relativePaths: ['notes/two.md'] })).resolves.toEqual({
        stagedPaths: ['notes/two.md']
      })
      await expect(runGit(root, ['diff', '--cached', '--name-only'])).resolves.toMatchObject({
        stdout: 'notes/two.md\n'
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('accepts only sanitized HTTPS and SSH origin URLs', async () => {
    const root = await createRepo()
    try {
      const service = createService(root)

      await expect(
        service.configureOrigin({ gitUrl: 'https://example.com/org/kb.git' })
      ).resolves.toEqual({ configured: true, url: 'https://example.com/org/kb.git' })
      await expect(runGit(root, ['remote', 'get-url', 'origin'])).resolves.toMatchObject({
        stdout: 'https://example.com/org/kb.git\n'
      })

      await expect(
        service.configureOrigin({ gitUrl: 'ssh://git@example.com/org/kb.git' })
      ).resolves.toEqual({ configured: true, url: 'ssh://example.com/org/kb.git' })
      await expect(runGit(root, ['remote', 'get-url', 'origin'])).resolves.toMatchObject({
        stdout: 'ssh://git@example.com/org/kb.git\n'
      })
      await expect(
        service.configureOrigin({ gitUrl: 'git@example.com:org/kb.git' })
      ).resolves.toEqual({ configured: true, url: 'example.com:org/kb.git' })
      await expect(runGit(root, ['remote', 'get-url', 'origin'])).resolves.toMatchObject({
        stdout: 'git@example.com:org/kb.git\n'
      })

      await runGit(root, ['remote', 'set-url', 'origin', 'https://token@example.invalid/org/kb.git'])
      await expect(service.push()).rejects.toThrow('https://example.invalid/org/kb.git')
      await expect(service.push()).rejects.not.toThrow('token@')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects local, helper, credential-bearing, and query-bearing origin URLs', async () => {
    const root = await createRepo()
    try {
      const service = createService(root)
      for (const gitUrl of [
        '/tmp/target.git',
        'file:///tmp/target.git',
        'ext::sh -c whoami',
        'foo::bar',
        'https://token@example.com/org/kb.git',
        'https://example.com/org/kb.git?secret=yes',
        'ssh://git@example.com/org/kb.git?secret=yes',
        'ssh://git:secret@example.com/org/kb.git'
      ]) {
        await expect(service.configureOrigin({ gitUrl })).rejects.toThrow(
          'Origin must be an HTTPS or SSH Git remote URL'
        )
      }
      await expect(runGit(root, ['remote'])).resolves.toMatchObject({ stdout: '' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('pushes to the configured origin remote without accepting an arbitrary push target', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'spacezero-issue-176-kb-git-push-'))
    const root = join(fixture, 'knowledge-base')
    const origin = join(fixture, 'origin.git')
    try {
      await mkdir(dirname(root), { recursive: true })
      await runGit(fixture, ['init', '--bare', origin])
      await runGit(fixture, ['init', root])
      await runGit(root, ['config', 'user.email', 'builder@example.com'])
      await runGit(root, ['config', 'user.name', 'Builder'])
      await writeFile(join(root, 'README.md'), '# Knowledge Base\n', 'utf8')
      await runGit(root, ['add', 'README.md'])
      await runGit(root, ['commit', '-m', 'Initial commit'])
      await runGit(root, ['remote', 'add', 'origin', origin])

      const service = createService(root)
      await expect(service.push()).resolves.toMatchObject({
        branch: expect.any(String),
        origin,
        output: expect.stringContaining('branch')
      })
      await expect(runGit(root, ['remote', 'get-url', 'origin'])).resolves.toMatchObject({
        stdout: `${origin}\n`
      })
    } finally {
      await rm(fixture, { recursive: true, force: true })
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

  it('discovers conflicted paths and the supported interrupted operation', async () => {
    const root = await createRepo()
    try {
      await writeFile(join(root, 'note.md'), 'base\n', 'utf8')
      await runGit(root, ['add', 'note.md'])
      await runGit(root, ['commit', '-m', 'Add note'])
      await runGit(root, ['checkout', '-b', 'incoming'])
      await writeFile(join(root, 'note.md'), 'incoming\n', 'utf8')
      await runGit(root, ['commit', '-am', 'Incoming note'])
      await runGit(root, ['checkout', 'main'])
      await writeFile(join(root, 'note.md'), 'local\n', 'utf8')
      await runGit(root, ['commit', '-am', 'Local note'])

      await expect(runGit(root, ['merge', 'incoming'])).rejects.toThrow()

      await expect(createService(root).inspectRepository()).resolves.toMatchObject({
        interruptedOperation: 'merge',
        hasConflicts: true,
        conflictedFiles: [{ relativePath: 'note.md', contentType: 'text' }],
        porcelainStatus: expect.stringContaining('UU note.md')
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('surfaces binary conflicts without pretending document tools can resolve them as text', async () => {
    const root = await createRepo()
    try {
      await writeFile(join(root, 'image.bin'), new Uint8Array([0, 1, 2, 3]))
      await runGit(root, ['add', 'image.bin'])
      await runGit(root, ['commit', '-m', 'Add binary fixture'])
      await runGit(root, ['checkout', '-b', 'incoming'])
      await writeFile(join(root, 'image.bin'), new Uint8Array([0, 1, 9, 3]))
      await runGit(root, ['commit', '-am', 'Incoming binary'])
      await runGit(root, ['checkout', 'main'])
      await writeFile(join(root, 'image.bin'), new Uint8Array([0, 1, 8, 3]))
      await runGit(root, ['commit', '-am', 'Local binary'])

      await expect(runGit(root, ['merge', 'incoming'])).rejects.toThrow()

      await expect(createService(root).inspectRepository()).resolves.toMatchObject({
        interruptedOperation: 'merge',
        hasConflicts: true,
        conflictedFiles: [{ relativePath: 'image.bin', contentType: 'binary' }]
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('continues supported conflict operations after resolved files are staged', async () => {
    const root = await createRepo()
    try {
      await writeFile(join(root, 'note.md'), 'base\n', 'utf8')
      await runGit(root, ['add', 'note.md'])
      await runGit(root, ['commit', '-m', 'Add note'])
      await runGit(root, ['checkout', '-b', 'incoming'])
      await writeFile(join(root, 'note.md'), 'incoming\n', 'utf8')
      await runGit(root, ['commit', '-am', 'Incoming note'])
      const incomingCommit = (await runGit(root, ['rev-parse', 'HEAD'])).stdout.trim()
      await runGit(root, ['checkout', 'main'])
      await writeFile(join(root, 'note.md'), 'local\n', 'utf8')
      await runGit(root, ['commit', '-am', 'Local note'])

      await expect(runGit(root, ['cherry-pick', incomingCommit])).rejects.toThrow()
      await writeFile(join(root, 'note.md'), 'resolved\n', 'utf8')
      await createService(root).stageFiles({ relativePaths: ['note.md'] })

      await expect(createService(root).continueConflictResolution({})).resolves.toMatchObject({
        operation: 'cherry-pick'
      })
      await expect(createService(root).inspectRepository()).resolves.toMatchObject({
        interruptedOperation: null,
        hasConflicts: false,
        conflictedFiles: []
      })
      await expect(readFile(join(root, 'note.md'), 'utf8')).resolves.toBe('resolved\n')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('aborts supported conflict operations without accepting arbitrary Git arguments', async () => {
    const root = await createRepo()
    try {
      await writeFile(join(root, 'note.md'), 'base\n', 'utf8')
      await runGit(root, ['add', 'note.md'])
      await runGit(root, ['commit', '-m', 'Add note'])
      await runGit(root, ['checkout', '-b', 'incoming'])
      await writeFile(join(root, 'note.md'), 'incoming\n', 'utf8')
      await runGit(root, ['commit', '-am', 'Incoming note'])
      await runGit(root, ['checkout', 'main'])
      await writeFile(join(root, 'note.md'), 'local\n', 'utf8')
      await runGit(root, ['commit', '-am', 'Local note'])

      await expect(runGit(root, ['merge', 'incoming'])).rejects.toThrow()
      await expect(
        createService(root).abortConflictResolution({ unexpected: '--hard' } as never)
      ).rejects.toThrow()
      await expect(createService(root).abortConflictResolution({})).resolves.toMatchObject({
        operation: 'merge'
      })
      await expect(createService(root).inspectRepository()).resolves.toMatchObject({
        interruptedOperation: null,
        hasConflicts: false,
        conflictedFiles: []
      })
      await expect(readFile(join(root, 'note.md'), 'utf8')).resolves.toBe('local\n')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects continue and abort when no supported interrupted operation exists', async () => {
    const root = await createRepo()
    try {
      const service = createService(root)

      await expect(service.continueConflictResolution({})).rejects.toThrow(
        'no supported interrupted operation'
      )
      await expect(service.abortConflictResolution({})).rejects.toThrow(
        'no supported interrupted operation'
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
