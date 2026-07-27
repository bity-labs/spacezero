import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { withTemporaryFile } from './temporary-file.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('withTemporaryFile', () => {
  it('restores an existing file after the operation succeeds', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, 'github-app.json')
    await writeFile(filePath, 'developer config\n')

    await withTemporaryFile(filePath, 'test config\n', async () => {
      await expect(readFile(filePath, 'utf8')).resolves.toBe('test config\n')
    })

    await expect(readFile(filePath, 'utf8')).resolves.toBe('developer config\n')
  })

  it('restores an existing file after the operation fails', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, 'github-app.json')
    await writeFile(filePath, 'developer config\n')

    await expect(
      withTemporaryFile(filePath, 'test config\n', async () => {
        throw new Error('packaging failed')
      })
    ).rejects.toThrow('packaging failed')

    await expect(readFile(filePath, 'utf8')).resolves.toBe('developer config\n')
  })

  it('removes the temporary file when no file existed before the operation', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, 'github-app.json')

    await withTemporaryFile(filePath, 'test config\n', async () => undefined)

    await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'spacezero-temporary-file-'))
  temporaryDirectories.push(directory)
  return directory
}
