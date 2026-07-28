import { isUtf8 } from 'node:buffer'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  win32
} from 'node:path'

import { MAX_KNOWLEDGE_BASE_IMAGE_BYTES } from '../shared/knowledge-base.model'
import type {
  KnowledgeBaseCreateDocumentResult,
  KnowledgeBaseCreateFolderResult,
  KnowledgeBaseDocument,
  KnowledgeBaseImageImport,
  KnowledgeBaseImagePreview,
  KnowledgeBaseSaveResult,
  KnowledgeBaseTreeItem
} from '../shared/knowledge-base.model'
import type { KnowledgeBaseOperationCoordinator } from './knowledge-base-operation-coordinator'
import type { KnowledgeBaseRootProvider } from './knowledge-base-root.provider'

export const MAX_KNOWLEDGE_BASE_TEXT_FILE_BYTES = 2 * 1024 * 1024

const IMAGE_ASSET_DIRECTORY = 'assets/img'
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx'])
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.csv',
  '.html',
  '.ini',
  '.js',
  '.json',
  '.jsx',
  '.log',
  '.mjs',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml'
])

export type KnowledgeBaseFilesService = {
  getTree: () => Promise<KnowledgeBaseTreeItem[]>
  openDocument: (request: { relativePath: string }) => Promise<KnowledgeBaseDocument>
  createDocument: (request: {
    relativePath: string
    content: string
  }) => Promise<KnowledgeBaseCreateDocumentResult>
  createFolder: (request: { relativePath: string }) => Promise<KnowledgeBaseCreateFolderResult>
  importImage: (request: {
    documentRelativePath: string
    fileName: string
    bytes: Uint8Array
  }) => Promise<KnowledgeBaseImageImport>
  loadImage: (request: {
    documentRelativePath: string
    markdownPath: string
  }) => Promise<KnowledgeBaseImagePreview>
  saveDocument: (request: {
    relativePath: string
    content: string
    expectedRevision: string
  }) => Promise<KnowledgeBaseSaveResult>
}

export function createKnowledgeBaseFilesService({
  rootProvider,
  operations = { runExclusive: (operation) => operation() }
}: {
  rootProvider: Pick<KnowledgeBaseRootProvider, 'getVerifiedRoot'>
  operations?: KnowledgeBaseOperationCoordinator
}): KnowledgeBaseFilesService {
  const service: KnowledgeBaseFilesService = {
    async getTree() {
      const rootPath = await rootProvider.getVerifiedRoot()
      const canonicalRoot = await realpath(rootPath)
      return readTree(canonicalRoot, '')
    },

    async openDocument(request) {
      const rootPath = await rootProvider.getVerifiedRoot()
      return openKnowledgeBaseDocument(rootPath, request.relativePath)
    },

    async createDocument(request) {
      const rootPath = await rootProvider.getVerifiedRoot()
      const { absolutePath, relativePath } = resolveKnowledgeBaseRelativePath(
        rootPath,
        request.relativePath
      )
      await assertParentDirectoryAllowed(rootPath, absolutePath)

      try {
        await writeFile(absolutePath, request.content, { encoding: 'utf8', flag: 'wx' })
      } catch (error) {
        if (isNodeError(error) && error.code === 'EEXIST') {
          return { status: 'collision', relativePath }
        }
        throw error
      }

      await assertExistingPathInsideRoot(rootPath, absolutePath)
      return {
        status: 'created',
        document: await openKnowledgeBaseDocument(rootPath, relativePath)
      }
    },

    async createFolder(request) {
      const rootPath = await rootProvider.getVerifiedRoot()
      const { absolutePath, relativePath } = resolveKnowledgeBaseRelativePath(
        rootPath,
        request.relativePath
      )
      await assertParentDirectoryAllowed(rootPath, absolutePath)

      try {
        await mkdir(absolutePath)
      } catch (error) {
        if (isNodeError(error) && error.code === 'EEXIST') {
          return { status: 'collision', relativePath }
        }
        throw error
      }

      const details = await lstat(absolutePath)
      if (details.isSymbolicLink() || !details.isDirectory()) {
        throw new Error('Knowledge Base path is not a folder.')
      }
      await assertExistingPathInsideRoot(rootPath, absolutePath)
      return { status: 'created', relativePath, kind: 'folder' }
    },

    async importImage(request) {
      if (request.bytes.byteLength > MAX_KNOWLEDGE_BASE_IMAGE_BYTES) {
        throw new Error('Knowledge Base image is too large.')
      }

      const rootPath = await rootProvider.getVerifiedRoot()
      const document = await openKnowledgeBaseDocument(rootPath, request.documentRelativePath)
      if (document.contentKind !== 'markdown') {
        throw new Error('Images can only be imported for Markdown documents.')
      }
      const imageFormat = detectImageFormat(request.bytes)
      if (!imageFormat) throw new Error('Unsupported image type.')

      const altText = createImageAltText(request.fileName)
      const assetRelativePath = await writeImageAsset({
        rootPath,
        stem: createAssetStem(request.fileName),
        extension: imageFormat.extension,
        bytes: request.bytes
      })

      return {
        assetRelativePath,
        markdownPath: posix.relative(posix.dirname(document.relativePath), assetRelativePath),
        altText
      }
    },

    async loadImage(request) {
      const rootPath = await rootProvider.getVerifiedRoot()
      const document = await openKnowledgeBaseDocument(rootPath, request.documentRelativePath)
      if (document.contentKind !== 'markdown') {
        throw new Error('Images can only be loaded for Markdown documents.')
      }
      if (
        request.markdownPath.startsWith('/') ||
        request.markdownPath.includes('\\') ||
        /^[a-z][a-z\d+.-]*:/i.test(request.markdownPath)
      ) {
        throw new Error('Knowledge Base image path is invalid.')
      }

      const documentDirectory = posix.dirname(document.relativePath)
      const imageRelativePath = posix.normalize(posix.join(documentDirectory, request.markdownPath))
      if (!imageRelativePath.startsWith(`${IMAGE_ASSET_DIRECTORY}/`)) {
        throw new Error(`Knowledge Base images must be stored under ${IMAGE_ASSET_DIRECTORY}.`)
      }

      const { absolutePath } = resolveKnowledgeBaseRelativePath(rootPath, imageRelativePath)
      const details = await lstat(absolutePath)
      if (details.isSymbolicLink()) {
        throw new Error('Symbolic links cannot be loaded as Knowledge Base images.')
      }
      if (!details.isFile()) throw new Error('Knowledge Base image path is not a file.')
      if (details.size > MAX_KNOWLEDGE_BASE_IMAGE_BYTES) {
        throw new Error('Knowledge Base image is too large.')
      }
      await assertExistingPathInsideRoot(rootPath, absolutePath)

      const bytes = await readFile(absolutePath)
      const imageFormat = detectImageFormat(bytes)
      if (!imageFormat) throw new Error('Unsupported image type.')
      return {
        dataUrl: `data:${imageFormat.mediaType};base64,${bytes.toString('base64')}`
      }
    },

    async saveDocument(request) {
      const rootPath = await rootProvider.getVerifiedRoot()
      const currentDocument = await openKnowledgeBaseDocument(rootPath, request.relativePath)
      if (currentDocument.contentKind === 'binary') {
        throw new Error('This Knowledge Base file is not text-editable.')
      }
      if (currentDocument.revision !== request.expectedRevision) {
        return { status: 'conflict', document: currentDocument }
      }

      const { absolutePath } = resolveKnowledgeBaseRelativePath(rootPath, request.relativePath)
      await assertExistingPathInsideRoot(rootPath, absolutePath)
      await writeFile(absolutePath, request.content, 'utf8')
      return {
        status: 'saved',
        document: await openKnowledgeBaseDocument(rootPath, request.relativePath)
      }
    }
  }

  return {
    ...service,
    createDocument: (request) => operations.runExclusive(() => service.createDocument(request)),
    createFolder: (request) => operations.runExclusive(() => service.createFolder(request)),
    importImage: (request) => operations.runExclusive(() => service.importImage(request)),
    saveDocument: (request) => operations.runExclusive(() => service.saveDocument(request))
  }
}

export function resolveKnowledgeBaseRelativePath(
  rootPath: string,
  inputPath: string
): { absolutePath: string; relativePath: string } {
  const trimmedPath = inputPath.trim()
  if (!trimmedPath) throw new Error('Knowledge Base path is required.')
  if (isAbsolute(trimmedPath) || win32.isAbsolute(trimmedPath) || trimmedPath.includes('\\')) {
    throw new Error('Knowledge Base paths must be relative.')
  }

  const segments = trimmedPath.split('/')
  if (segments.some((segment) => segment.toLowerCase() === '.git')) {
    throw new Error('Knowledge Base Git internals are protected.')
  }
  if (segments.some((segment) => segment === '..')) {
    throw new Error('Knowledge Base path is outside the configured root.')
  }
  if (segments.some((segment) => !segment || segment === '.' || segment.includes('\0'))) {
    throw new Error('Knowledge Base path is invalid.')
  }

  const absoluteRoot = resolve(rootPath)
  const absolutePath = resolve(absoluteRoot, ...segments)
  if (!isPathWithinRoot(absoluteRoot, absolutePath)) {
    throw new Error('Knowledge Base path is outside the configured root.')
  }

  return { absolutePath, relativePath: segments.join('/') }
}

async function writeImageAsset({
  rootPath,
  stem,
  extension,
  bytes
}: {
  rootPath: string
  stem: string
  extension: SupportedImageFormat['extension']
  bytes: Uint8Array
}): Promise<string> {
  const assetDirectoryPath = await ensureAssetImageDirectory(rootPath)
  let sequence = 1

  while (true) {
    const suffix = sequence === 1 ? '' : `-${sequence}`
    const assetRelativePath = `${IMAGE_ASSET_DIRECTORY}/${stem}${suffix}.${extension}`
    const absolutePath = join(assetDirectoryPath, basename(assetRelativePath))

    try {
      await writeFile(absolutePath, bytes, { flag: 'wx' })
      return assetRelativePath
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'EEXIST') throw error
      sequence += 1
    }
  }
}

async function ensureAssetImageDirectory(rootPath: string): Promise<string> {
  const canonicalRoot = await realpath(rootPath)
  let directoryPath = canonicalRoot

  for (const segment of IMAGE_ASSET_DIRECTORY.split('/')) {
    const candidatePath = join(directoryPath, segment)

    try {
      const details = await lstat(candidatePath)
      if (details.isSymbolicLink()) {
        throw new Error('Knowledge Base asset directories cannot be symbolic links.')
      }
      if (!details.isDirectory()) {
        throw new Error('Knowledge Base asset path is not a directory.')
      }
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') throw error
      await mkdir(candidatePath)
    }

    directoryPath = await realpath(candidatePath)
    await assertKnowledgeBaseCanonicalPathAllowed(canonicalRoot, directoryPath)
  }

  return directoryPath
}

async function openKnowledgeBaseDocument(
  rootPath: string,
  requestedPath: string
): Promise<KnowledgeBaseDocument> {
  const { absolutePath, relativePath } = resolveKnowledgeBaseRelativePath(rootPath, requestedPath)
  const details = await lstat(absolutePath)
  if (details.isSymbolicLink()) {
    throw new Error('Symbolic links cannot be opened from the Knowledge Base.')
  }
  if (!details.isFile()) throw new Error('Knowledge Base path is not a file.')

  await assertExistingPathInsideRoot(rootPath, absolutePath)
  const baseDocument = {
    name: basename(absolutePath),
    relativePath,
    size: details.size,
    modifiedAt: details.mtime.toISOString()
  }

  if (details.size > MAX_KNOWLEDGE_BASE_TEXT_FILE_BYTES) {
    return {
      ...baseDocument,
      contentKind: 'binary',
      revision: hashRevision(`${details.size}:${details.mtimeMs}`),
      content: undefined
    }
  }

  const content = await readFile(absolutePath)
  const contentKind = detectContentKind(relativePath, content)
  const revision = hashRevision(content)
  return contentKind === 'binary'
    ? { ...baseDocument, contentKind, revision, content: undefined }
    : { ...baseDocument, contentKind, revision, content: content.toString('utf8') }
}

type SupportedImageFormat = {
  extension: 'gif' | 'jpg' | 'png' | 'webp'
  mediaType: string
}

function detectImageFormat(bytes: Uint8Array): SupportedImageFormat | null {
  if (hasBytePrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { extension: 'png', mediaType: 'image/png' }
  }
  if (hasBytePrefix(bytes, [0xff, 0xd8, 0xff])) {
    return { extension: 'jpg', mediaType: 'image/jpeg' }
  }
  if (
    hasBytePrefix(bytes, [0x47, 0x49, 0x46, 0x38]) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { extension: 'gif', mediaType: 'image/gif' }
  }
  if (
    hasBytePrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { extension: 'webp', mediaType: 'image/webp' }
  }
  return null
}

function hasBytePrefix(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte)
}

function createImageAltText(fileName: string): string {
  return (
    basename(fileName, extname(fileName))
      .replace(/[-_]+/g, ' ')
      .replace(/[[\]{}<>\\`*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Image'
  )
}

function createAssetStem(fileName: string): string {
  const sanitized = basename(fileName, extname(fileName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return sanitized.slice(0, 80).replace(/-+$/g, '') || 'image'
}

function hashRevision(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

async function readTree(
  rootPath: string,
  relativeDirectory: string
): Promise<KnowledgeBaseTreeItem[]> {
  const directoryPath = relativeDirectory
    ? join(rootPath, ...relativeDirectory.split('/'))
    : rootPath
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const items: KnowledgeBaseTreeItem[] = []

  for (const entry of entries) {
    if (entry.name.toLowerCase() === '.git' || entry.isSymbolicLink()) continue
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
    const absolutePath = join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      items.push({
        name: entry.name,
        relativePath,
        kind: 'folder',
        contentKind: 'folder',
        children: await readTree(rootPath, relativePath)
      })
      continue
    }

    const details = await lstat(absolutePath)
    items.push({
      name: entry.name,
      relativePath,
      kind: 'file',
      contentKind: getContentKindFromExtension(relativePath),
      size: details.size,
      modifiedAt: details.mtime.toISOString()
    })
  }

  return items.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
    return left.name.localeCompare(right.name)
  })
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function detectContentKind(relativePath: string, content: Buffer): 'markdown' | 'text' | 'binary' {
  const extensionKind = getContentKindFromExtension(relativePath)
  if (extensionKind === 'markdown')
    return content.includes(0) || !isUtf8(content) ? 'binary' : 'markdown'
  if (content.includes(0) || !isUtf8(content)) return 'binary'
  return extensionKind === 'text' || content.length === 0 ? 'text' : 'text'
}

function getContentKindFromExtension(relativePath: string): 'markdown' | 'text' | 'binary' {
  const extension = extname(relativePath).toLowerCase()
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown'
  if (TEXT_EXTENSIONS.has(extension)) return 'text'
  return 'binary'
}

async function assertExistingPathInsideRoot(rootPath: string, targetPath: string): Promise<void> {
  const [canonicalRoot, canonicalTarget] = await Promise.all([
    realpath(rootPath),
    realpath(targetPath)
  ])
  await assertKnowledgeBaseCanonicalPathAllowed(canonicalRoot, canonicalTarget)
}

async function assertParentDirectoryAllowed(rootPath: string, targetPath: string): Promise<void> {
  const parentPath = dirname(targetPath)
  const details = await lstat(parentPath)
  if (details.isSymbolicLink()) {
    await assertExistingPathInsideRoot(rootPath, parentPath)
    throw new Error('Knowledge Base path is outside the configured root.')
  }
  if (!details.isDirectory()) {
    throw new Error('Knowledge Base parent path is not a folder.')
  }
  await assertExistingPathInsideRoot(rootPath, parentPath)
}

export async function assertKnowledgeBaseCanonicalPathAllowed(
  canonicalRoot: string,
  canonicalTarget: string
): Promise<void> {
  if (!isPathWithinRoot(canonicalRoot, canonicalTarget)) {
    throw new Error('Knowledge Base path is outside the configured root.')
  }

  const canonicalGitPath = await getCanonicalGitPath(canonicalRoot)
  if (canonicalGitPath && isPathWithinRoot(canonicalGitPath, canonicalTarget)) {
    throw new Error('Knowledge Base Git internals are protected.')
  }
}

async function getCanonicalGitPath(canonicalRoot: string): Promise<string | undefined> {
  try {
    return await realpath(join(canonicalRoot, '.git'))
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return undefined
    throw error
  }
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const pathFromRoot = relative(rootPath, targetPath)
  return (
    pathFromRoot === '' ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot))
  )
}
