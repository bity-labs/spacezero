import { isUtf8 } from 'node:buffer'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep, win32 } from 'node:path'

import type { FilesSearchResult, SearchFilesRequest } from '../shared'
import { MAX_FILES_TEXT_FILE_BYTES } from './files-document.adapter'

const DEFAULT_MAX_RESULTS = 100
const MAX_SNIPPETS_PER_FILE = 3
const MAX_SNIPPET_CHARS = 160
const COMMON_GENERATED_DIRECTORY_NAMES = new Set([
  '.cache',
  '.next',
  '.nuxt',
  '.parcel-cache',
  '.svelte-kit',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
  'vendor'
])

type IgnoreRule = {
  pattern: string
  directoryOnly: boolean
  anchored: boolean
  negated: boolean
  basePath: string
}

type SearchWalkerState = {
  rootPath: string
  canonicalRoot: string
  query: string
  lowerQuery: string
  includeIgnored: boolean
  maxResults: number
  results: FilesSearchResult[]
  ignoreRules: IgnoreRule[]
  signal?: AbortSignal
}

export async function searchFiles(
  rootPath: string,
  request: Omit<SearchFilesRequest, 'context' | 'requestId'>,
  options: { signal?: AbortSignal } = {}
): Promise<FilesSearchResult[]> {
  try {
    const query = request.query.trim()
    if (!query) return []

    const canonicalRoot = await realpath(rootPath)
    const state: SearchWalkerState = {
      rootPath,
      canonicalRoot,
      query,
      lowerQuery: query.toLowerCase(),
      includeIgnored: request.includeIgnored,
      maxResults: request.maxResults ?? DEFAULT_MAX_RESULTS,
      results: [],
      ignoreRules: [],
      signal: options.signal
    }

    await walkDirectory(state, '')
    return state.results.slice(0, state.maxResults)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('files.')) throw error
    throw new Error('files.searchFailed', { cause: error })
  }
}

async function walkDirectory(state: SearchWalkerState, relativeDirectory: string): Promise<void> {
  throwIfAborted(state)
  if (state.results.length >= state.maxResults) return

  const directoryPath = resolveInsideRoot(state.canonicalRoot, relativeDirectory)
  const previousRuleCount = state.ignoreRules.length
  if (!state.includeIgnored) {
    state.ignoreRules.push(...(await readIgnoreRules(state.canonicalRoot, relativeDirectory)))
  }
  throwIfAborted(state)
  const entries = await readdir(directoryPath, { withFileTypes: true })

  for (const entry of entries) {
    throwIfAborted(state)
    if (state.results.length >= state.maxResults) break
    if (entry.name.toLowerCase() === '.git') continue

    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
    const absolutePath = resolveInsideRoot(state.canonicalRoot, relativePath)
    const details = await lstat(absolutePath)
    if (details.isSymbolicLink()) continue

    const isDirectory = details.isDirectory()
    if (!state.includeIgnored && isIgnoredPath(state, relativePath, isDirectory)) continue

    if (isDirectory) {
      await walkDirectory(state, relativePath)
      continue
    }

    if (!details.isFile()) continue
    addFilenameMatch(state, relativePath)
    await addContentMatches(state, relativePath, absolutePath, details.size)
  }

  state.ignoreRules.splice(previousRuleCount)
}

function addFilenameMatch(state: SearchWalkerState, relativePath: string): void {
  if (state.results.length >= state.maxResults) return
  if (!basename(relativePath).toLowerCase().includes(state.lowerQuery)) return
  state.results.push({
    kind: 'filename',
    relativePath,
    name: basename(relativePath)
  })
}

async function addContentMatches(
  state: SearchWalkerState,
  relativePath: string,
  absolutePath: string,
  size: number
): Promise<void> {
  throwIfAborted(state)
  if (state.results.length >= state.maxResults || size > MAX_FILES_TEXT_FILE_BYTES) return

  const bytes = await readFile(absolutePath)
  throwIfAborted(state)
  if (!isUtf8(bytes) || bytes.includes(0)) return

  const content = bytes.toString('utf8').replace(/^\uFEFF/, '')
  const snippets: NonNullable<Extract<FilesSearchResult, { kind: 'content' }>['snippets']> = []
  let searchFrom = 0
  while (snippets.length < MAX_SNIPPETS_PER_FILE) {
    const index = content.toLowerCase().indexOf(state.lowerQuery, searchFrom)
    if (index < 0) break
    snippets.push(createSnippet(content, index, state.query.length))
    searchFrom = index + Math.max(state.query.length, 1)
  }

  if (snippets.length === 0) return
  state.results.push({
    kind: 'content',
    relativePath,
    name: basename(relativePath),
    snippets
  })
}

function createSnippet(
  content: string,
  index: number,
  matchLength: number
): { line: number; column: number; text: string } {
  const beforeMatch = content.slice(0, index)
  const line = beforeMatch.split('\n').length
  const lineStart = content.lastIndexOf('\n', index - 1) + 1
  const nextLineEnd = content.indexOf('\n', index)
  const lineEnd = nextLineEnd < 0 ? content.length : nextLineEnd
  const column = index - lineStart + 1
  const lineText = content.slice(lineStart, lineEnd).replace(/\s+/g, ' ').trim()
  const halfWindow = Math.max(0, Math.floor((MAX_SNIPPET_CHARS - matchLength) / 2))
  const snippetStart = Math.max(0, column - 1 - halfWindow)
  const snippet = lineText.slice(snippetStart, snippetStart + MAX_SNIPPET_CHARS)
  return {
    line,
    column,
    text: `${snippetStart > 0 ? '…' : ''}${snippet}${snippet.length + snippetStart < lineText.length ? '…' : ''}`
  }
}

async function readIgnoreRules(
  canonicalRoot: string,
  relativeDirectory: string
): Promise<IgnoreRule[]> {
  try {
    const gitignore = await readFile(
      resolve(canonicalRoot, relativeDirectory, '.gitignore'),
      'utf8'
    )
    return gitignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => parseIgnoreRule(line, relativeDirectory))
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined
    if (code === 'ENOENT') return []
    throw error
  }
}

function parseIgnoreRule(rawPattern: string, basePath: string): IgnoreRule {
  const negated = rawPattern.startsWith('!')
  const unnegated = negated ? rawPattern.slice(1) : rawPattern
  const anchored = unnegated.startsWith('/')
  const withoutAnchor = anchored ? unnegated.slice(1) : unnegated
  const directoryOnly = withoutAnchor.endsWith('/')
  return {
    pattern: directoryOnly ? withoutAnchor.slice(0, -1) : withoutAnchor,
    directoryOnly,
    anchored,
    negated,
    basePath
  }
}

function isIgnoredPath(
  state: SearchWalkerState,
  relativePath: string,
  isDirectory: boolean
): boolean {
  const segments = relativePath.split('/')
  if (segments.some((segment) => COMMON_GENERATED_DIRECTORY_NAMES.has(segment))) return true

  let ignored = false
  for (const rule of state.ignoreRules) {
    if (rule.directoryOnly && !isDirectory) continue
    if (matchesIgnoreRule(rule, relativePath)) ignored = !rule.negated
  }
  return ignored
}

function matchesIgnoreRule(rule: IgnoreRule, relativePath: string): boolean {
  const pathFromRuleBase = rule.basePath
    ? relativePath === rule.basePath
      ? ''
      : relativePath.startsWith(`${rule.basePath}/`)
        ? relativePath.slice(rule.basePath.length + 1)
        : null
    : relativePath
  if (pathFromRuleBase === null || pathFromRuleBase.length === 0) return false

  const patternRegex = globToRegex(rule.pattern)
  if (rule.anchored || rule.pattern.includes('/')) return patternRegex.test(pathFromRuleBase)
  return pathFromRuleBase.split('/').some((segment) => patternRegex.test(segment))
}

function throwIfAborted(state: SearchWalkerState): void {
  if (state.signal?.aborted) throw new Error('files.searchCanceled')
}

function globToRegex(pattern: string): RegExp {
  const doubleStarToken = '\u0000DOUBLE_STAR\u0000'
  const escaped = pattern
    .replace(/\*\*/g, doubleStarToken)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replaceAll(doubleStarToken, '.*')
  return new RegExp(`^${escaped}$`)
}

function resolveInsideRoot(canonicalRoot: string, relativePath: string): string {
  if (relativePath.includes('\0') || isAbsolute(relativePath) || win32.isAbsolute(relativePath)) {
    throw new Error('files.invalidPath')
  }
  const candidatePath = resolve(canonicalRoot, relativePath)
  const relativeCandidate = relative(canonicalRoot, candidatePath)
  if (
    relativeCandidate === '..' ||
    relativeCandidate.startsWith(`..${sep}`) ||
    isAbsolute(relativeCandidate)
  ) {
    throw new Error('files.invalidPath')
  }
  return candidatePath
}
