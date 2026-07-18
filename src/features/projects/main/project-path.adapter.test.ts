import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createProjectPathAdapter, normalizeExistingProjectPath } from './project-path.adapter'

describe('createProjectPathAdapter', () => {
  it('creates new projects under the configured Space Zero projects path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spacezero-storage-'))
    const projectsPath = join(root, 'projects')
    const adapter = createProjectPathAdapter({ getProjectsPath: async () => projectsPath })

    try {
      const projectPath = await adapter.createEmptyProjectDirectory('Space Zero')

      expect(projectPath).toBe(join(projectsPath, 'space-zero'))
      expect(existsSync(projectPath)).toBe(true)
      expect(
        execFileSync('git', ['-C', projectPath, 'rev-parse', '--show-toplevel'], {
          encoding: 'utf8'
        }).trim()
      ).toBe(projectPath)
      expect(
        execFileSync('git', ['-C', projectPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      ).toMatch(/^[0-9a-f]{40,64}$/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('normalizeExistingProjectPath', () => {
  it('normalizes a repository subdirectory to its top-level checkout', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spacezero-project-root-'))
    const nestedDirectory = join(directory, 'packages', 'desktop')
    mkdirSync(nestedDirectory, { recursive: true })
    execFileSync('git', ['init', '-b', 'main', directory])
    execFileSync(
      'git',
      [
        '-C',
        directory,
        '-c',
        'user.name=Space Zero Test',
        '-c',
        'user.email=test@spacezero.dev',
        'commit',
        '--allow-empty',
        '-m',
        'initial'
      ],
      { stdio: 'ignore' }
    )

    try {
      expect(normalizeExistingProjectPath(nestedDirectory)).toBe(directory)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('requires an absolute existing directory', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spacezero-project-'))
    const file = join(directory, 'README.md')
    writeFileSync(file, '# Project')

    try {
      expect(normalizeExistingProjectPath(` ${directory} `)).toBe(directory)
      expect(() => normalizeExistingProjectPath('relative/project')).toThrow(
        'Project path must be absolute'
      )
      expect(() => normalizeExistingProjectPath(join(directory, 'missing'))).toThrow(
        'Project path does not exist'
      )
      expect(() => normalizeExistingProjectPath(file)).toThrow('Project path must be a directory')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
