import { describe, expect, it } from 'vitest'

import { createFilesDocumentCacheKey } from './files-document-identity'

describe('Files Diffs document identity', () => {
  it('isolates equal canonical relative paths by workspace context and baseline', () => {
    expect(createFilesDocumentCacheKey('session-1', 'src/app name-😀.ts', 'baseline-1')).toBe(
      'spacezero-files:session-1:document:src/app%20name-%F0%9F%98%80.ts:baseline-1'
    )
    expect(createFilesDocumentCacheKey('session-2', 'src/app name-😀.ts', 'baseline-1')).not.toBe(
      createFilesDocumentCacheKey('session-1', 'src/app name-😀.ts', 'baseline-1')
    )
    expect(createFilesDocumentCacheKey('session-1', 'src/app name-😀.ts', 'baseline-2')).not.toBe(
      createFilesDocumentCacheKey('session-1', 'src/app name-😀.ts', 'baseline-1')
    )
  })
})
