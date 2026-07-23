import { describe, expect, it } from 'vitest'

import { resolveFilesIconName } from './files-icon-resolver'

describe('Files icon resolver', () => {
  it('resolves Material Icon Theme filenames, extensions, folder states, and deterministic fallbacks', () => {
    expect(resolveFilesIconName({ name: 'package.json', kind: 'file', expanded: false })).toBe(
      'nodejs'
    )
    expect(resolveFilesIconName({ name: 'component.tsx', kind: 'file', expanded: false })).toBe(
      'react_ts'
    )
    expect(resolveFilesIconName({ name: 'src', kind: 'directory', expanded: false })).toBe(
      'folder-src'
    )
    expect(resolveFilesIconName({ name: 'src', kind: 'directory', expanded: true })).toBe(
      'folder-src-open'
    )
    expect(resolveFilesIconName({ name: 'unknown.spacezero', kind: 'file', expanded: false })).toBe(
      'file'
    )
    expect(
      resolveFilesIconName({ name: 'unknown-folder', kind: 'directory', expanded: false })
    ).toBe('folder')
  })
})
