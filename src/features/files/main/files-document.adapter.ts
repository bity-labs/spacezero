import { isUtf8 } from 'node:buffer'
import { createHash } from 'node:crypto'
import { lstat, open, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep, win32 } from 'node:path'

import type { FilesDocument, SaveFilesDocumentRequest, SaveFilesDocumentResult } from '../shared'

export const MAX_FILES_TEXT_FILE_BYTES = 2 * 1024 * 1024
export const MAX_FILES_IMAGE_FILE_BYTES = 10 * 1024 * 1024

type SupportedImageSignature = {
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
}

type TextMetadata = {
  hasBom: boolean
  lineEnding: 'lf' | 'crlf'
  content: string
}

type SaveLockKey = string

const saveLocks = new Map<SaveLockKey, Promise<void>>()

export async function openFilesDocument(
  rootPath: string,
  relativePath: string
): Promise<FilesDocument> {
  try {
    return await openFilesDocumentUnsafe(rootPath, relativePath)
  } catch (error) {
    throw toBoundarySafeFilesError(error, 'read')
  }
}

export async function saveFilesDocument(
  rootPath: string,
  request: Omit<SaveFilesDocumentRequest, 'context'>
): Promise<SaveFilesDocumentResult> {
  try {
    const lockKey = await createSaveLockKey(rootPath, request.relativePath)
    return await withSaveLock(lockKey, () => saveFilesDocumentUnsafe(rootPath, request))
  } catch (error) {
    throw toBoundarySafeFilesError(error, 'write')
  }
}

async function openFilesDocumentUnsafe(
  rootPath: string,
  relativePath: string
): Promise<FilesDocument> {
  const { absolutePath, normalizedPath } = await resolveRegularFilePath(rootPath, relativePath)
  const details = await lstat(absolutePath)
  const baseDocument = {
    name: basename(absolutePath),
    relativePath: normalizedPath,
    size: details.size,
    modifiedAt: details.mtime.toISOString()
  }

  const metadataRevision = hashRevision(`${details.size}:${details.mtimeMs}`)
  const imageSignature = await readSupportedImageSignature(absolutePath)
  if (imageSignature && details.size > MAX_FILES_IMAGE_FILE_BYTES) {
    return {
      ...baseDocument,
      contentKind: 'oversized',
      classification: 'oversized-image',
      revision: metadataRevision
    }
  }

  if (details.size > MAX_FILES_TEXT_FILE_BYTES && !imageSignature) {
    return {
      ...baseDocument,
      contentKind: 'oversized',
      classification: 'oversized-text',
      revision: metadataRevision
    }
  }

  const bytes = await readFile(absolutePath)
  const revision = hashRevision(bytes)
  if (imageSignature) {
    return {
      ...baseDocument,
      contentKind: 'image',
      classification: 'image',
      mediaType: imageSignature.mediaType,
      dataUrl: `data:${imageSignature.mediaType};base64,${bytes.toString('base64')}`,
      revision
    }
  }

  const text = decodeEditableUtf8(bytes)
  if (!text) {
    return {
      ...baseDocument,
      contentKind: 'binary',
      classification: 'binary',
      revision
    }
  }

  return {
    ...baseDocument,
    contentKind: 'text',
    revision,
    content: text.content,
    hasBom: text.hasBom,
    lineEnding: text.lineEnding
  }
}

async function saveFilesDocumentUnsafe(
  rootPath: string,
  request: Omit<SaveFilesDocumentRequest, 'context'>
): Promise<SaveFilesDocumentResult> {
  const currentDocument = await openFilesDocumentUnsafe(rootPath, request.relativePath)
  if (currentDocument.contentKind !== 'text') throw new Error('files.notEditableText')
  if (currentDocument.revision !== request.expectedRevision) {
    return { status: 'conflict', document: currentDocument }
  }

  const bytes = encodeEditableUtf8(request.content, currentDocument)
  if (bytes.byteLength > MAX_FILES_TEXT_FILE_BYTES) {
    throw new Error('files.contentTooLarge')
  }

  const { absolutePath } = await resolveRegularFilePath(rootPath, request.relativePath)
  await writeFile(absolutePath, bytes)
  const document = await openFilesDocumentUnsafe(rootPath, request.relativePath)
  if (document.contentKind !== 'text') throw new Error('files.writeFailed')
  return { status: 'saved', document }
}

async function resolveRegularFilePath(
  rootPath: string,
  relativePath: string
): Promise<{ absolutePath: string; normalizedPath: string }> {
  const normalizedPath = normalizeRelativeFilePath(relativePath)
  const canonicalRoot = await realpath(rootPath)
  let candidatePath = canonicalRoot
  let details = await lstat(candidatePath)

  for (const segment of normalizedPath.split('/')) {
    candidatePath = resolve(candidatePath, segment)
    assertInsideRoot(canonicalRoot, candidatePath)
    details = await lstat(candidatePath)
    if (details.isSymbolicLink()) throw new Error('files.symlinkTraversalDenied')
  }

  if (!details.isFile()) throw new Error('files.notFile')
  const canonicalFile = await realpath(candidatePath)
  assertInsideRoot(canonicalRoot, canonicalFile)
  return { absolutePath: canonicalFile, normalizedPath }
}

function normalizeRelativeFilePath(path: string): string {
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

async function createSaveLockKey(rootPath: string, relativePath: string): Promise<SaveLockKey> {
  const canonicalRoot = await realpath(rootPath)
  return `${canonicalRoot}\0${normalizeRelativeFilePath(relativePath)}`
}

async function withSaveLock<T>(key: SaveLockKey, operation: () => Promise<T>): Promise<T> {
  const previous = saveLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolveRelease) => {
    release = resolveRelease
  })
  const chained = previous.then(
    () => current,
    () => current
  )
  saveLocks.set(key, chained)

  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release()
    if (saveLocks.get(key) === chained) saveLocks.delete(key)
  }
}

async function readSupportedImageSignature(absolutePath: string): Promise<SupportedImageSignature | null> {
  const file = await open(absolutePath, 'r')
  try {
    const header = Buffer.alloc(32)
    const { bytesRead } = await file.read(header, 0, header.byteLength, 0)
    return detectSupportedImageSignature(header.subarray(0, bytesRead))
  } finally {
    await file.close()
  }
}

function detectSupportedImageSignature(bytes: Buffer): SupportedImageSignature | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mediaType: 'image/png' }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mediaType: 'image/jpeg' }
  }
  if (
    bytes.length >= 6 &&
    bytes.subarray(0, 6).equals(Buffer.from('GIF87a', 'ascii'))
  ) {
    return { mediaType: 'image/gif' }
  }
  if (
    bytes.length >= 6 &&
    bytes.subarray(0, 6).equals(Buffer.from('GIF89a', 'ascii'))
  ) {
    return { mediaType: 'image/gif' }
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).equals(Buffer.from('RIFF', 'ascii')) &&
    bytes.subarray(8, 12).equals(Buffer.from('WEBP', 'ascii'))
  ) {
    return { mediaType: 'image/webp' }
  }
  return null
}

function decodeEditableUtf8(bytes: Buffer): TextMetadata | null {
  if (!isUtf8(bytes) || bytes.includes(0)) return null
  const hasBom = hasUtf8Bom(bytes)
  const rawContent = bytes.toString('utf8')
  const content = hasBom && rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent
  return {
    hasBom,
    lineEnding: detectLineEnding(content),
    content
  }
}

function encodeEditableUtf8(
  content: string,
  metadata: Pick<TextMetadata, 'hasBom' | 'lineEnding'>
): Buffer {
  const normalizedContent =
    metadata.lineEnding === 'crlf'
      ? content.replace(/\r\n|\r|\n/g, '\r\n')
      : content.replace(/\r\n|\r/g, '\n')
  return Buffer.from(`${metadata.hasBom ? '\uFEFF' : ''}${normalizedContent}`, 'utf8')
}

function detectLineEnding(content: string): 'lf' | 'crlf' {
  if (!content.includes('\r\n')) return 'lf'
  return content.replace(/\r\n/g, '').includes('\n') ? 'lf' : 'crlf'
}

function hasUtf8Bom(bytes: Buffer): boolean {
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
}

function hashRevision(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex')
}

function toBoundarySafeFilesError(error: unknown, operation: 'read' | 'write'): Error {
  if (error instanceof Error && error.message.startsWith('files.')) return error
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
  if (code === 'ENOENT' || code === 'ENOTDIR') return new Error('files.notFound')
  if (code === 'EACCES' || code === 'EPERM') return new Error('files.inaccessible')
  return new Error(operation === 'write' ? 'files.writeFailed' : 'files.readFailed')
}
