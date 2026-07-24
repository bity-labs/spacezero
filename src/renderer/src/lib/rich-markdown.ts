const FRONTMATTER_PATTERN =
  /^(?:\uFEFF)?---[\t ]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[\t ]*(?:(?:\r?\n){1,2}|$)/

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

export function getRichMarkdownLimitation(
  markdown: string,
  { isMdx = false }: { isMdx?: boolean } = {}
): string | null {
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
