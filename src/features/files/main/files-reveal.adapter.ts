import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path'

export type FilesRevealNativeOperations = {
  revealInFolder: (absolutePath: string) => void | Promise<void>
}

export async function revealFilesEntry(
  rootPath: string,
  relativePath: string,
  nativeOperations: FilesRevealNativeOperations
): Promise<void> {
  try {
    const absolutePath = await resolveRevealPath(rootPath, relativePath)
    await nativeOperations.revealInFolder(absolutePath)
  } catch (error) {
    throw toBoundarySafeFilesError(error)
  }
}

async function resolveRevealPath(rootPath: string, relativePath: string): Promise<string> {
  const normalizedPath = normalizeRelativeEntryPath(relativePath)
  const canonicalRoot = await realpath(rootPath)
  let candidatePath = canonicalRoot
  const segments = normalizedPath.split('/')

  for (const [index, segment] of segments.entries()) {
    candidatePath = resolve(candidatePath, segment)
    assertInsideRoot(canonicalRoot, candidatePath)
    const details = await lstat(candidatePath)
    const isLastSegment = index === segments.length - 1
    if (details.isSymbolicLink()) {
      if (!isLastSegment) throw new Error('files.symlinkTraversalDenied')
      return candidatePath
    }
    if (!isLastSegment && !details.isDirectory()) throw new Error('files.notFound')
  }

  const canonicalEntry = await realpath(candidatePath)
  assertInsideRoot(canonicalRoot, canonicalEntry)
  return canonicalEntry
}

function normalizeRelativeEntryPath(path: string): string {
  if (
    !path ||
    path.includes('\0') ||
    path.includes('\\') ||
    isAbsolute(path) ||
    win32.isAbsolute(path) ||
    /^[a-z]:/i.test(path)
  ) {
    throw new Error('files.invalidPath')
  }

  const segments = path.split('/')
  if (segments.some((segment) => segment.length === 0)) throw new Error('files.invalidPath')
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error('files.invalidPath')
  }
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

function toBoundarySafeFilesError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith('files.')) return error
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
  if (code === 'ENOENT' || code === 'ENOTDIR') return new Error('files.notFound')
  if (code === 'EACCES' || code === 'EPERM') return new Error('files.inaccessible')
  return new Error('files.revealFailed')
}
