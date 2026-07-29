import { isMap, isScalar, parseDocument } from 'yaml'

const FRONTMATTER_PATTERN =
  /^(?:\uFEFF)?---[\t ]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[\t ]*(?:(?:\r?\n){1,2}|$)/
const FRONTMATTER_PARTS_PATTERN =
  /^(?:\uFEFF)?---[\t ]*(\r?\n)([\s\S]*?)\r?\n(?:---|\.\.\.)[\t ]*(?:(?:\r?\n){1,2}|$)/
const FRONTMATTER_OPENING_PATTERN = /^(?:\uFEFF)?---[\t ]*(?:\r?\n|$)/

const RAW_HTML_OR_MDX_PATTERN =
  /<!--|<![A-Za-z[]|<>|<\/>|<\/?[A-Za-z_$][\w$-]*(?:[.:][A-Za-z_$][\w$-]*)*(?:\s+[^>]*|\/?)>/
const MDX_ESM_PATTERN =
  /^(?:import\s+(?:[\w*{]|['"])|export\s+(?:default|const|let|var|(?:async\s+)?function|class|type|interface|enum|namespace|\{|\*))/m
const MDX_EXPRESSION_PATTERN = /\{[\s\S]*?\}/
const FOOTNOTE_PATTERN = /(?:^|[^\\])\[\^[^\]\r\n]+\]/m
const HTML_ENTITY_PATTERN = /&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i
const INLINE_OR_BLOCK_MATH_PATTERN = /(?:^|[^\\])(?:\$\$[\s\S]+?\$\$|\$(?!\$)[^\r\n$]+?\$)/m
const LOSSY_BACKSLASH_PATTERN = /\\/
const GITHUB_ALERT_PATTERN = /^ {0,3}>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/im
const REFERENCE_DEFINITION_PATTERN = /^ {0,3}\[[^\]\r\n]+\]:[\t ]+\S+/m
const WIKI_LINK_PATTERN = /\[\[[^\]\r\n]+\]\]/

export const RICH_MARKDOWN_LIMITATION =
  'This document contains MDX or raw HTML that rich mode cannot preserve.'
export const RICH_MARKDOWN_FOOTNOTE_LIMITATION =
  'This document contains footnotes that rich mode cannot preserve. Use source mode to edit it safely.'
export const RICH_MARKDOWN_SYNTAX_LIMITATION =
  'This document contains Markdown syntax that rich mode cannot preserve. Use source mode to edit it safely.'
export const RICH_MARKDOWN_FRONTMATTER_LIMITATION =
  'This document contains frontmatter that the properties editor cannot preserve. Use source mode to edit it safely.'

export function splitMarkdownDocument(markdown: string): {
  frontmatter: string
  body: string
} {
  const match = markdown.match(FRONTMATTER_PATTERN)

  if (!match) return { frontmatter: '', body: markdown }

  return {
    frontmatter: match[0],
    body: markdown.slice(match[0].length)
  }
}

export type MarkdownProperty = { key: string; value: string }

export type MarkdownPropertiesResult =
  | { status: 'none'; properties: [] }
  | { status: 'supported'; properties: MarkdownProperty[] }
  | { status: 'unsupported'; properties: [] }

export function parseMarkdownProperties(markdown: string): MarkdownPropertiesResult {
  const frontmatter = markdown.match(FRONTMATTER_PARTS_PATTERN)
  if (!frontmatter) {
    return FRONTMATTER_OPENING_PATTERN.test(markdown)
      ? { status: 'unsupported', properties: [] }
      : { status: 'none', properties: [] }
  }

  try {
    const document = parseDocument(frontmatter[2], { uniqueKeys: true })
    if (
      document.errors.length > 0 ||
      !isMap(document.contents) ||
      document.contents.anchor ||
      document.contents.tag
    ) {
      return { status: 'unsupported', properties: [] }
    }

    const properties: MarkdownProperty[] = []
    for (const pair of document.contents.items) {
      if (
        !isScalar(pair.key) ||
        !isScalar(pair.value) ||
        pair.key.anchor ||
        pair.key.tag ||
        pair.value.anchor ||
        pair.value.tag ||
        typeof pair.key.value !== 'string' ||
        typeof pair.value.value !== 'string'
      ) {
        return { status: 'unsupported', properties: [] }
      }
      properties.push({ key: pair.key.value, value: pair.value.value })
    }

    return { status: 'supported', properties }
  } catch {
    return { status: 'unsupported', properties: [] }
  }
}

export function addMarkdownProperty(markdown: string): { key: string; markdown: string } | null {
  const parsed = parseMarkdownProperties(markdown)
  if (parsed.status === 'unsupported') return null

  const lineEnding = markdown.includes('\r\n') ? '\r\n' : '\n'
  const existingKeys = new Set(parsed.properties.map(({ key }) => key))
  let key = 'property'
  let suffix = 2
  while (existingKeys.has(key)) key = `property-${suffix++}`

  if (parsed.status === 'none') {
    const bom = markdown.startsWith('\uFEFF') ? '\uFEFF' : ''
    const body = bom ? markdown.slice(1) : markdown
    return {
      key,
      markdown: `${bom}---${lineEnding}${key}: ""${lineEnding}---${lineEnding}${lineEnding}${body}`
    }
  }

  const frontmatter = markdown.match(FRONTMATTER_PARTS_PATTERN)
  if (!frontmatter) return null
  const document = parseDocument(frontmatter[2], { uniqueKeys: true })
  document.set(key, '')

  return {
    key,
    markdown: replaceFrontmatterSource(markdown, frontmatter, String(document), frontmatter[1])
  }
}

export type MarkdownPropertyUpdateResult =
  { ok: true; markdown: string } | { ok: false; error: string }

export function updateMarkdownProperty(
  markdown: string,
  currentKey: string,
  property: MarkdownProperty
): MarkdownPropertyUpdateResult {
  const parsed = parseMarkdownProperties(markdown)
  if (!property.key.trim()) return { ok: false, error: 'Property keys cannot be empty.' }
  if (
    parsed.status === 'supported' &&
    property.key !== currentKey &&
    parsed.properties.some(({ key }) => key === property.key)
  ) {
    return { ok: false, error: `A property named "${property.key}" already exists.` }
  }

  const frontmatter = markdown.match(FRONTMATTER_PARTS_PATTERN)
  if (parsed.status !== 'supported' || !frontmatter) {
    return { ok: false, error: 'These frontmatter properties cannot be edited in rich mode.' }
  }

  const document = parseDocument(frontmatter[2], { uniqueKeys: true })
  if (!isMap(document.contents)) {
    return { ok: false, error: 'These frontmatter properties cannot be edited in rich mode.' }
  }

  const pair = document.contents.items.find(
    (item) => isScalar(item.key) && item.key.value === currentKey
  )
  if (!pair || !isScalar(pair.key) || !isScalar(pair.value)) {
    return { ok: false, error: 'This property no longer exists.' }
  }

  pair.key.value = property.key
  pair.value.value = property.value
  return {
    ok: true,
    markdown: replaceFrontmatterSource(markdown, frontmatter, String(document), frontmatter[1])
  }
}

function replaceFrontmatterSource(
  markdown: string,
  frontmatter: RegExpMatchArray,
  source: string,
  lineEnding: string
): string {
  const normalizedSource = source.replace(/\n$/, '').replace(/\n/g, lineEnding)
  const sourceStart = frontmatter[0].indexOf(
    frontmatter[2],
    frontmatter[0].indexOf(frontmatter[1]) + frontmatter[1].length
  )
  const rewrittenFrontmatter = `${frontmatter[0].slice(0, sourceStart)}${normalizedSource}${frontmatter[0].slice(sourceStart + frontmatter[2].length)}`
  return `${rewrittenFrontmatter}${markdown.slice(frontmatter[0].length)}`
}

export function getRichMarkdownLimitation(
  markdown: string,
  { isMdx = false }: { isMdx?: boolean } = {}
): string | null {
  if (parseMarkdownProperties(markdown).status === 'unsupported') {
    return RICH_MARKDOWN_FRONTMATTER_LIMITATION
  }

  const { body } = splitMarkdownDocument(markdown)
  const prose = maskMarkdownCode(body)
  const containsUnsupportedMdx =
    isMdx && (MDX_ESM_PATTERN.test(prose) || MDX_EXPRESSION_PATTERN.test(prose))

  if (RAW_HTML_OR_MDX_PATTERN.test(prose) || containsUnsupportedMdx) {
    return RICH_MARKDOWN_LIMITATION
  }
  if (FOOTNOTE_PATTERN.test(prose)) return RICH_MARKDOWN_FOOTNOTE_LIMITATION
  if (
    INLINE_OR_BLOCK_MATH_PATTERN.test(prose) ||
    HTML_ENTITY_PATTERN.test(prose) ||
    LOSSY_BACKSLASH_PATTERN.test(prose) ||
    GITHUB_ALERT_PATTERN.test(prose) ||
    REFERENCE_DEFINITION_PATTERN.test(prose) ||
    WIKI_LINK_PATTERN.test(prose)
  ) {
    return RICH_MARKDOWN_SYNTAX_LIMITATION
  }

  return null
}

function maskMarkdownCode(markdown: string): string {
  let fence: { character: string; length: number } | null = null
  let listContexts: Array<{ markerIndent: number; contentIndent: number; codeIndent: number }> = []

  return markdown
    .split('\n')
    .map((line) => {
      if (fence) {
        const closingFence = line.match(/^ {0,3}(`+|~+)[\t ]*\r?$/)?.[1]
        if (closingFence?.[0] === fence.character && closingFence.length >= fence.length) {
          fence = null
        }
        return ''
      }

      const openingFence = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1]
      if (openingFence) {
        fence = { character: openingFence[0], length: openingFence.length }
        return ''
      }

      if (/^\s*$/.test(line)) return line

      const indent = countLeadingIndentColumns(line)
      const listItem = parseMarkdownListItem(line, listContexts.at(-1))
      if (listItem) {
        listContexts = listContexts.filter(
          (context) => context.markerIndent < listItem.markerIndent
        )
        listContexts.push(listItem)
      } else {
        listContexts = listContexts.filter((context) => indent >= context.contentIndent)
      }

      if (isIndentedCodeLine(line, indent, listContexts.at(-1))) return ''

      return maskInlineCode(line)
    })
    .join('\n')
}

function countLeadingIndentColumns(line: string): number {
  let columns = 0

  for (const character of line) {
    if (character === ' ') {
      columns += 1
      continue
    }
    if (character === '\t') {
      columns += 4 - (columns % 4)
      continue
    }
    break
  }

  return columns
}

function parseMarkdownListItem(
  line: string,
  activeListContext: { codeIndent: number } | undefined
): { markerIndent: number; contentIndent: number; codeIndent: number } | null {
  const match = line.match(/^( *)(?:[-+*]|\d{1,9}[.)])([\t ]+|$)/)
  if (!match) return null

  const markerIndent = match[1].length
  if (!activeListContext && markerIndent > 3) return null
  if (activeListContext && markerIndent >= activeListContext.codeIndent) return null

  const markerPrefix = match[0].slice(0, match[0].length - match[2].length)
  const markerEndColumn = countVisualColumns(markerPrefix)
  const markerWithPaddingColumn = countVisualColumns(match[0])
  const followingPadding = markerWithPaddingColumn - markerEndColumn
  const contentIndent =
    markerEndColumn + (followingPadding > 0 && followingPadding < 5 ? followingPadding : 1)

  return {
    markerIndent,
    contentIndent,
    codeIndent: contentIndent + 4
  }
}

function countVisualColumns(value: string): number {
  let columns = 0

  for (const character of value) {
    if (character === '\t') {
      columns += 4 - (columns % 4)
      continue
    }
    columns += 1
  }

  return columns
}

function isIndentedCodeLine(
  line: string,
  indent: number,
  activeListContext: { codeIndent: number } | undefined
): boolean {
  if (/^\t/.test(line)) return !activeListContext || indent >= activeListContext.codeIndent
  if (!/^ {4}/.test(line)) return false

  return activeListContext ? indent >= activeListContext.codeIndent : true
}

function maskInlineCode(line: string): string {
  let masked = ''
  let cursor = 0

  while (cursor < line.length) {
    if (line[cursor] !== '`') {
      masked += line[cursor]
      cursor += 1
      continue
    }

    const openingStart = cursor
    while (line[cursor] === '`') cursor += 1
    const delimiterLength = cursor - openingStart
    const closingStart = findBacktickRun(line, cursor, delimiterLength)

    if (closingStart === -1) {
      masked += line.slice(openingStart, cursor)
      continue
    }

    const closingEnd = closingStart + delimiterLength
    masked += ' '.repeat(closingEnd - openingStart)
    cursor = closingEnd
  }

  return masked
}

function findBacktickRun(line: string, from: number, expectedLength: number): number {
  let cursor = from

  while (cursor < line.length) {
    const runStart = line.indexOf('`', cursor)
    if (runStart === -1) return -1

    cursor = runStart
    while (line[cursor] === '`') cursor += 1
    if (cursor - runStart === expectedLength) return runStart
  }

  return -1
}
