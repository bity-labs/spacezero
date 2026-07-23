import { describe, expect, it, vi } from 'vitest'

import { createListFilesDirectoryHandler } from './files.ipc'

describe('Files IPC', () => {
  it('validates renderer input before listing a Session directory', async () => {
    const listDirectory = vi.fn(async () => [])
    const handle = createListFilesDirectoryHandler({ listDirectory })

    await expect(handle({ sessionId: 'session-1', relativePath: 'src' })).resolves.toEqual([])
    expect(listDirectory).toHaveBeenCalledWith({ sessionId: 'session-1', relativePath: 'src' })

    await expect(
      handle({ sessionId: 'session-1', relativePath: '../outside', rootPath: '/tmp' })
    ).rejects.toThrow()
    expect(listDirectory).toHaveBeenCalledTimes(1)
  })
})
