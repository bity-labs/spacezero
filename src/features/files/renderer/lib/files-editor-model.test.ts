import { describe, expect, it } from 'vitest'

import { createFilesMonacoModelPath, getFilesEditorLanguage } from './files-editor-model'

describe('Files editor model helpers', () => {
  it('routes recognized filenames and extensions to Monaco languages with a plain-text fallback', () => {
    expect(getFilesEditorLanguage('package.json')).toBe('json')
    expect(getFilesEditorLanguage('src/component.tsx')).toBe('typescript')
    expect(getFilesEditorLanguage('README.md')).toBe('markdown')
    expect(getFilesEditorLanguage('notes.mdx')).toBe('mdx')
    expect(getFilesEditorLanguage('Dockerfile')).toBe('dockerfile')
    expect(getFilesEditorLanguage('.gitconfig')).toBe('ini')
    expect(getFilesEditorLanguage('scripts/build.py')).toBe('python')
    expect(getFilesEditorLanguage('cmd/server.go')).toBe('go')
    expect(getFilesEditorLanguage('crates/app/src/main.rs')).toBe('rust')
    expect(getFilesEditorLanguage('infra/main.tf')).toBe('hcl')
    expect(getFilesEditorLanguage('config/settings.ini')).toBe('ini')
    expect(getFilesEditorLanguage('Makefile')).toBe('plaintext')
    expect(getFilesEditorLanguage('unknown.custom')).toBe('plaintext')
  })

  it('scopes Monaco model paths by Files context and relative path', () => {
    expect(createFilesMonacoModelPath('session-1', 'src/index.ts')).toBe(
      'spacezero-files://session-1/src/index.ts'
    )
    expect(createFilesMonacoModelPath('session-2', 'src/index.ts')).toBe(
      'spacezero-files://session-2/src/index.ts'
    )
  })
})
