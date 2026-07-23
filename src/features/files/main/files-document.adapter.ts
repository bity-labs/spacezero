import { isUtf8 } from 'node:buffer'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep, win32 } from 'node:path'

import type { FilesDocument, SaveFilesDocumentRequest, SaveFilesDocumentResult } from '../shared'

export const MAX_FILES_TEXT_FILE_BYTES = 2 * 1024 * 1024

type TextMetadata = {
  hasBom: boolean
  lineEnding: 'lf' | 'crlf'
  content: string
}

export async function openFilesDocument(rootPath: string, relativePath: string): Promise<FilesDocument> {
  const { absolutePath, normalizedPath } = await resolveRegularFilePath(rootPath, relativePath)
  const details = await lstat(absolutePath)
  const baseDocument = {
    name: basename(absolutePath),
    relativePath: normalizedPath,
    size: details.size,
    modifiedAt: details.mtime.toISOString()
  }

  if (details.size > MAX_FILES_TEXT_FILE_BYTES) {
    return {
      ...baseDocument,
      contentKind: 'oversized',
      revision: hashRevision(`${details.size}:${details.mtimeMs}`)
    }
  }

  const bytes = await readFile(absolutePath)
  const revision = hashRevision(bytes)
  const text = decodeEditableUtf8(bytes)
  if (!text) {
    return {
      ...baseDocument,
      contentKind: 'binary',
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

export async function saveFilesDocument(
  rootPath: string,
  request: Omit<SaveFilesDocumentRequest, 'sessionId'>
): Promise<SaveFilesDocumentResult> {
  const currentDocument = await openFilesDocument(rootPath, request.relativePath)
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
  const document = await openFilesDocument(rootPath, request.relativePath)
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
  const trimmedPath = path.trim()
  if (
    !trimmedPath ||
    trimmedPath.includes('\0') ||
    trimmedPath.includes('\\') ||
    isAbsolute(trimmedPath) ||
    win32.isAbsolute(trimmedPath) ||
    /^[a-z]:/i.test(trimmedPath)
  ) {
    throw new Error('files.invalidPath')
  }

  const segments = trimmedPath.split('/').filter((segment) => segment.length > 0)
  if (segments.length === 0) throw new Error('files.invalidPath')
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
