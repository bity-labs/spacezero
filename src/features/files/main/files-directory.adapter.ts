import { lstat, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import type { FilesEntry } from '../shared'

const naturalNameCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base'
})

export async function readFilesDirectory(
  rootPath: string,
  relativePath: string
): Promise<FilesEntry[]> {
  const normalizedPath = normalizeRelativeDirectoryPath(relativePath)

  try {
    const canonicalRoot = await realpath(rootPath)
    let directoryPath = canonicalRoot
    let directoryDetails = await lstat(directoryPath)

    for (const segment of normalizedPath.split('/').filter(Boolean)) {
      directoryPath = resolve(directoryPath, segment)
      assertInsideRoot(canonicalRoot, directoryPath)
      directoryDetails = await lstat(directoryPath)
      if (directoryDetails.isSymbolicLink()) throw new Error('files.symlinkTraversalDenied')
    }

    if (!directoryDetails.isDirectory()) throw new Error('files.notDirectory')

    const canonicalDirectory = await realpath(directoryPath)
    assertInsideRoot(canonicalRoot, canonicalDirectory)
    const entries = await readdir(canonicalDirectory, { withFileTypes: true })

    return entries
      .filter((entry) => entry.name.toLowerCase() !== '.git')
      .map((entry): FilesEntry => ({
        name: entry.name,
        relativePath: normalizedPath ? `${normalizedPath}/${entry.name}` : entry.name,
        kind: entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'directory' : 'file'
      }))
      .sort(compareEntries)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('files.')) throw error
    throw mapDirectoryReadError(error)
  }
}

function normalizeRelativeDirectoryPath(path: string): string {
  if (path.includes('\0') || path.includes('\\') || isAbsolute(path) || /^[a-z]:/i.test(path)) {
    throw new Error('files.invalidPath')
  }
  const segments = path.split('/').filter((segment) => segment.length > 0 && segment !== '.')
  if (segments.some((segment) => segment === '..')) throw new Error('files.invalidPath')
  if (segments.some((segment) => segment.toLowerCase() === '.git')) {
    throw new Error('files.gitProtected')
  }
  return segments.join('/')
}

function assertInsideRoot(rootPath: string, candidatePath: string): void {
  const relativePath = relative(rootPath, candidatePath)
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('files.invalidPath')
  }
}

function compareEntries(left: FilesEntry, right: FilesEntry): number {
  const leftRank = left.kind === 'directory' ? 0 : 1
  const rightRank = right.kind === 'directory' ? 0 : 1
  if (leftRank !== rightRank) return leftRank - rightRank
  return (
    naturalNameCollator.compare(left.name, right.name) || left.name.localeCompare(right.name, 'en')
  )
}

function mapDirectoryReadError(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
  if (code === 'ENOENT') return new Error('files.directoryNotFound')
  if (code === 'EACCES' || code === 'EPERM') return new Error('files.directoryInaccessible')
  return new Error('files.directoryReadFailed', { cause: error })
}
