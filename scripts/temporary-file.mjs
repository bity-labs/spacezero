import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function withTemporaryFile(filePath, temporaryContents, operation) {
  const previous = await readPreviousFile(filePath)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, temporaryContents, { mode: 0o600 })

  try {
    return await operation()
  } finally {
    if (!previous) {
      await rm(filePath, { force: true })
    } else {
      await writeFile(filePath, previous.contents)
      await chmod(filePath, previous.mode)
    }
  }
}

async function readPreviousFile(filePath) {
  try {
    const [contents, metadata] = await Promise.all([readFile(filePath), stat(filePath)])
    return { contents, mode: metadata.mode }
  } catch (error) {
    if (isFileMissing(error)) return undefined
    throw error
  }
}

function isFileMissing(error) {
  return typeof error === 'object' && error !== null && error.code === 'ENOENT'
}
