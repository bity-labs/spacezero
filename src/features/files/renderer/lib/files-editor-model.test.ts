import { describe, expect, it } from 'vitest'

import { createFilesMonacoModelPath, getFilesEditorLanguage } from './files-editor-model'

describe('Files editor model helpers', () => {
  it('routes recognized filenames and extensions to Monaco languages with a plain-text fallback', () => {
    expect(getFilesEditorLanguage('package.json')).toBe('json')
    expect(getFilesEditorLanguage('src/component.tsx')).toBe('typescript')
    expect(getFilesEditorLanguage('README.md')).toBe('markdown')
    expect(getFilesEditorLanguage('Dockerfile')).toBe('dockerfile')
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
