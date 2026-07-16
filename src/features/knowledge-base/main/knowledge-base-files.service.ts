import { isUtf8 } from 'node:buffer'
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path'

import type {
  KnowledgeBaseDocument,
  KnowledgeBaseSearchResult,
  KnowledgeBaseTreeItem
} from '../shared/knowledge-base.model'
import type { KnowledgeBaseConfigurationRepository } from './knowledge-base.service'

export const MAX_KNOWLEDGE_BASE_TEXT_FILE_BYTES = 2 * 1024 * 1024

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
  search: (request: { query: string }) => Promise<KnowledgeBaseSearchResult[]>
  createItem: (request: { relativePath: string; kind: 'file' | 'folder' }) => Promise<void>
  renameItem: (request: { relativePath: string; newName: string }) => Promise<void>
  moveItem: (request: { sourcePath: string; destinationPath: string }) => Promise<void>
  deleteItem: (request: { relativePath: string }) => Promise<void>
}

export function createKnowledgeBaseFilesService({
  configurationRepository
}: {
  configurationRepository: KnowledgeBaseConfigurationRepository
}): KnowledgeBaseFilesService {
  return {
    async getTree() {
      const rootPath = await getConfiguredRoot(configurationRepository)
      const canonicalRoot = await realpath(rootPath)
      return readTree(canonicalRoot, '')
    },

    async openDocument(request) {
      const rootPath = await getConfiguredRoot(configurationRepository)
      const { absolutePath, relativePath } = resolveKnowledgeBaseRelativePath(
        rootPath,
        request.relativePath
      )
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
        return { ...baseDocument, contentKind: 'binary' as const, content: undefined }
      }

      const content = await readFile(absolutePath)
      const contentKind = detectContentKind(relativePath, content)
      return contentKind === 'binary'
        ? { ...baseDocument, contentKind, content: undefined }
        : { ...baseDocument, contentKind, content: content.toString('utf8') }
    },

    async search(request) {
      const query = request.query.trim()
      if (!query) return []
      const rootPath = await getConfiguredRoot(configurationRepository)
      const canonicalRoot = await realpath(rootPath)
      return searchDirectory(canonicalRoot, '', query.toLowerCase())
    },

    async createItem(request) {
      const rootPath = await getConfiguredRoot(configurationRepository)
      const { absolutePath } = resolveKnowledgeBaseRelativePath(rootPath, request.relativePath)
      await assertParentPathInsideRoot(rootPath, absolutePath)
      if (await pathExists(absolutePath)) {
        throw new Error('A Knowledge Base item already exists at this path.')
      }

      if (request.kind === 'folder') {
        await mkdir(absolutePath)
      } else {
        await writeFile(absolutePath, '', { encoding: 'utf8', flag: 'wx' })
      }
    },

    async renameItem(request) {
      assertValidItemName(request.newName)
      const relativePath = request.relativePath.trim()
      const parentPath = posix.dirname(relativePath)
      const destinationPath = parentPath === '.' ? request.newName.trim() : `${parentPath}/${request.newName.trim()}`
      await moveKnowledgeBaseItem(configurationRepository, relativePath, destinationPath)
    },

    async moveItem(request) {
      await moveKnowledgeBaseItem(
        configurationRepository,
        request.sourcePath,
        request.destinationPath
      )
    },

    async deleteItem(request) {
      const rootPath = await getConfiguredRoot(configurationRepository)
      const { absolutePath } = resolveKnowledgeBaseRelativePath(rootPath, request.relativePath)
      await lstat(absolutePath)
      await rm(absolutePath, { recursive: true })
    }
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
  if (segments.includes('.git')) throw new Error('Knowledge Base Git internals are protected.')
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

async function getConfiguredRoot(
  repository: KnowledgeBaseConfigurationRepository
): Promise<string> {
  const configuration = await repository.get()
  if (!configuration) throw new Error('Knowledge Base is not configured.')
  return configuration.rootPath
}

async function readTree(rootPath: string, relativeDirectory: string): Promise<KnowledgeBaseTreeItem[]> {
  const directoryPath = relativeDirectory
    ? join(rootPath, ...relativeDirectory.split('/'))
    : rootPath
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const items: KnowledgeBaseTreeItem[] = []

  for (const entry of entries) {
    if (entry.name === '.git') continue
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name
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

async function moveKnowledgeBaseItem(
  configurationRepository: KnowledgeBaseConfigurationRepository,
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  const rootPath = await getConfiguredRoot(configurationRepository)
  const source = resolveKnowledgeBaseRelativePath(rootPath, sourcePath)
  const destination = resolveKnowledgeBaseRelativePath(rootPath, destinationPath)
  await lstat(source.absolutePath)
  await assertExistingPathInsideRoot(rootPath, source.absolutePath)
  await assertParentPathInsideRoot(rootPath, destination.absolutePath)
  if (await pathExists(destination.absolutePath)) {
    throw new Error('A Knowledge Base item already exists at the destination.')
  }
  await rename(source.absolutePath, destination.absolutePath)
}

function assertValidItemName(input: string): void {
  const name = input.trim()
  if (name.includes('/') || name.includes('\\')) {
    throw new Error('Knowledge Base item names cannot contain path separators.')
  }
  if (!name || name === '.' || name === '..' || name.includes('\0')) {
    throw new Error('Knowledge Base item name is invalid.')
  }
  if (name === '.git') throw new Error('Knowledge Base Git internals are protected.')
}

async function assertParentPathInsideRoot(rootPath: string, targetPath: string): Promise<void> {
  const [canonicalRoot, canonicalParent] = await Promise.all([
    realpath(rootPath),
    realpath(dirname(targetPath))
  ])
  if (!isPathWithinRoot(canonicalRoot, canonicalParent)) {
    throw new Error('Knowledge Base path is outside the configured root.')
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

async function searchDirectory(
  rootPath: string,
  relativeDirectory: string,
  normalizedQuery: string
): Promise<KnowledgeBaseSearchResult[]> {
  const directoryPath = relativeDirectory
    ? join(rootPath, ...relativeDirectory.split('/'))
    : rootPath
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const results: KnowledgeBaseSearchResult[] = []

  for (const entry of entries) {
    if (entry.name === '.git' || entry.isSymbolicLink()) continue
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name
    const absolutePath = join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      results.push(...(await searchDirectory(rootPath, relativePath, normalizedQuery)))
      continue
    }
    if (!entry.isFile()) continue

    const details = await lstat(absolutePath)
    if (details.size > MAX_KNOWLEDGE_BASE_TEXT_FILE_BYTES) continue
    const content = await readFile(absolutePath)
    if (detectContentKind(relativePath, content) === 'binary') continue

    const text = content.toString('utf8')
    const contentIndex = text.toLowerCase().indexOf(normalizedQuery)
    if (contentIndex >= 0) {
      results.push({
        name: entry.name,
        relativePath,
        matchType: 'content',
        snippet: createSearchSnippet(text, contentIndex, normalizedQuery.length)
      })
    } else if (entry.name.toLowerCase().includes(normalizedQuery)) {
      results.push({ name: entry.name, relativePath, matchType: 'filename' })
    }
  }

  return results.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

function createSearchSnippet(text: string, matchIndex: number, queryLength: number): string {
  const lineStart = text.lastIndexOf('\n', matchIndex - 1) + 1
  const nextLineBreak = text.indexOf('\n', matchIndex + queryLength)
  const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak
  const line = text.slice(lineStart, lineEnd).trim()
  if (line.length <= 180) return line

  const indexInLine = matchIndex - lineStart
  const start = Math.max(0, indexInLine - 70)
  const end = Math.min(line.length, indexInLine + queryLength + 70)
  return `${start > 0 ? '…' : ''}${line.slice(start, end)}${end < line.length ? '…' : ''}`
}

function detectContentKind(
  relativePath: string,
  content: Buffer
): 'markdown' | 'text' | 'binary' {
  const extensionKind = getContentKindFromExtension(relativePath)
  if (extensionKind === 'markdown') return content.includes(0) || !isUtf8(content) ? 'binary' : 'markdown'
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
  const [canonicalRoot, canonicalTarget] = await Promise.all([realpath(rootPath), realpath(targetPath)])
  if (!isPathWithinRoot(canonicalRoot, canonicalTarget)) {
    throw new Error('Knowledge Base path is outside the configured root.')
  }
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const pathFromRoot = relative(rootPath, targetPath)
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot))
}
