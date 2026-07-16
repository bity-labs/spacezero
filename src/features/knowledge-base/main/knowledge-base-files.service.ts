import { isUtf8 } from 'node:buffer'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'

import type {
  KnowledgeBaseDocument,
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
