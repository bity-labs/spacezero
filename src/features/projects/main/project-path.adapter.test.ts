import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { normalizeExistingProjectPath } from './project-path.adapter'

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
