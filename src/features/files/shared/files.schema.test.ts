import { describe, expect, it } from 'vitest'

import { listFilesDirectoryRequestSchema } from './files.schema'

describe('Files IPC schemas', () => {
  it('accepts only a Project Session id and a bounded context-relative directory path', () => {
    expect(
      listFilesDirectoryRequestSchema.parse({
        sessionId: 'session-1',
        relativePath: 'src/features'
      })
    ).toEqual({ sessionId: 'session-1', relativePath: 'src/features' })

    for (const input of [
      { sessionId: '', relativePath: '' },
      { sessionId: 'session-1', relativePath: '../outside' },
      { sessionId: 'session-1', relativePath: '/absolute' },
      { sessionId: 'session-1', relativePath: 'C:/absolute' },
      { sessionId: 'session-1', relativePath: 'src\\features' },
      { sessionId: 'session-1', relativePath: '.git/objects' },
      { sessionId: 'session-1', relativePath: '.GIT/objects' },
      { sessionId: 'session-1', relativePath: 'a'.repeat(4097) },
      { sessionId: 'session-1', relativePath: '', rootPath: '/arbitrary' }
    ]) {
      expect(() => listFilesDirectoryRequestSchema.parse(input)).toThrow()
    }
  })
})
