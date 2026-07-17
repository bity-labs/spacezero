import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('normalizeExistingProjectPath', () => {
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
