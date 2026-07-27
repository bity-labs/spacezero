import { mkdir, lstat, realpath, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep, win32 } from 'node:path'

import type {
  CreateFilesEntryRequest,
  MoveFilesEntryRequest,
  TrashFilesEntryRequest
} from '../shared'

export type FilesTrashNativeOperations = {
  trashItem: (absolutePath: string) => Promise<void>
}

export type FilesMutationRaceSeams = {
  beforeCreateMutation?: (absolutePath: string) => Promise<void> | void
  beforeMoveMutation?: (sourcePath: string, destinationPath: string) => Promise<void> | void
}

export async function createFilesEntry(
  rootPath: string,
  request: Omit<CreateFilesEntryRequest, 'context'>,
  raceSeams: FilesMutationRaceSeams = {}
): Promise<void> {
  try {
    const { absolutePath, canonicalRoot } = await resolveNewEntryPath(
      rootPath,
      request.relativePath
    )
    const parentPath = dirname(absolutePath)
    await assertExistingDirectory(canonicalRoot, parentPath)
    await assertMissing(absolutePath)
    await raceSeams.beforeCreateMutation?.(absolutePath)
    await assertExistingDirectory(canonicalRoot, parentPath)
    if (request.kind === 'folder') await mkdir(absolutePath)
    else await writeFile(absolutePath, '', { flag: 'wx' })
  } catch (error) {
    throw toBoundarySafeFilesError(error, 'create')
  }
}

export async function moveFilesEntry(
  rootPath: string,
  request: Omit<MoveFilesEntryRequest, 'context'>,
  raceSeams: FilesMutationRaceSeams = {}
): Promise<void> {
  try {
    const source = await resolveMutableExistingPath(rootPath, request.sourcePath)
    const destination = await resolveNewEntryPath(rootPath, request.destinationPath)
    if (source.normalizedPath === destination.normalizedPath)
      throw new Error('files.invalidDestination')
    if (
      source.details.isDirectory() &&
      isSameOrDescendant(source.absolutePath, destination.absolutePath)
    ) {
      throw new Error('files.directoryMoveIntoSelf')
    }
    const destinationParent = dirname(destination.absolutePath)
    await assertExistingDirectory(destination.canonicalRoot, destinationParent)
    await assertMissing(destination.absolutePath)
    await raceSeams.beforeMoveMutation?.(source.absolutePath, destination.absolutePath)
    await assertExistingDirectory(destination.canonicalRoot, destinationParent)
    await assertMissing(destination.absolutePath)
    await rename(source.absolutePath, destination.absolutePath)
  } catch (error) {
    throw toBoundarySafeFilesError(error, 'move')
  }
}

export async function trashFilesEntry(
  rootPath: string,
  request: Omit<TrashFilesEntryRequest, 'context'>,
  nativeOperations: FilesTrashNativeOperations
): Promise<void> {
  try {
    const source = await resolveMutableExistingPath(rootPath, request.relativePath)
    await nativeOperations.trashItem(source.absolutePath)
  } catch (error) {
    throw toBoundarySafeFilesError(error, 'trash')
  }
}

async function resolveMutableExistingPath(rootPath: string, relativePath: string) {
  const normalizedPath = normalizeRelativeEntryPath(relativePath)
  const canonicalRoot = await realpath(rootPath)
  let candidatePath = canonicalRoot
  for (const segment of normalizedPath.split('/')) {
    candidatePath = resolve(candidatePath, segment)
    assertInsideRoot(canonicalRoot, candidatePath)
    const details = await lstat(candidatePath)
    if (details.isSymbolicLink()) throw new Error('files.symlinkOperationDenied')
  }
  const details = await lstat(candidatePath)
  if (!details.isFile() && !details.isDirectory()) throw new Error('files.unsupportedEntry')
  const canonicalEntry = await realpath(candidatePath)
  assertInsideRoot(canonicalRoot, canonicalEntry)
  return { absolutePath: canonicalEntry, canonicalRoot, normalizedPath, details }
}

async function resolveNewEntryPath(rootPath: string, relativePath: string) {
  const normalizedPath = normalizeRelativeEntryPath(relativePath)
  const canonicalRoot = await realpath(rootPath)
  const absolutePath = resolve(canonicalRoot, ...normalizedPath.split('/'))
  assertInsideRoot(canonicalRoot, absolutePath)
  return { absolutePath, canonicalRoot, normalizedPath }
}

async function assertExistingDirectory(canonicalRoot: string, absolutePath: string): Promise<void> {
  assertInsideRoot(canonicalRoot, absolutePath)
  const relativeParent = relative(canonicalRoot, absolutePath)
  let cursor = canonicalRoot
  for (const segment of relativeParent.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment)
    assertInsideRoot(canonicalRoot, cursor)
    const details = await lstat(cursor)
    if (details.isSymbolicLink()) throw new Error('files.symlinkTraversalDenied')
  }
  const details = await lstat(absolutePath)
  if (!details.isDirectory()) throw new Error('files.invalidDestination')
}

async function assertMissing(absolutePath: string): Promise<void> {
  try {
    await lstat(absolutePath)
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT')) return
    throw error
  }
  throw new Error('files.collision')
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
  if (segments.some(isGitProtectedSegment)) throw new Error('files.gitProtected')
  if (segments.some((segment) => segment.includes(':'))) throw new Error('files.invalidPath')
  return segments.join('/')
}

function isGitProtectedSegment(segment: string): boolean {
  return segment.toLowerCase().replace(/[ .]+$/u, '') === '.git'
}

function assertInsideRoot(rootPath: string, candidatePath: string): void {
  const relativePath = relative(rootPath, candidatePath)
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('files.invalidPath')
  }
}

function isSameOrDescendant(parentPath: string, candidatePath: string): boolean {
  const relativePath = relative(parentPath, candidatePath)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  )
}

function toBoundarySafeFilesError(error: unknown, operation: 'create' | 'move' | 'trash'): Error {
  if (error instanceof Error && error.message.startsWith('files.')) return error
  if (isNodeErrorCode(error, 'ENOENT') || isNodeErrorCode(error, 'ENOTDIR')) {
    return new Error('files.notFound')
  }
  if (isNodeErrorCode(error, 'EEXIST')) return new Error('files.collision')
  if (isNodeErrorCode(error, 'EACCES') || isNodeErrorCode(error, 'EPERM')) {
    return new Error('files.inaccessible')
  }
  return new Error(`files.${operation}Failed`)
}
