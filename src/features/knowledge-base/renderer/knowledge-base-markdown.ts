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
const LOSSY_BACKSLASH_PATTERN = /\\[a-z0-9]/i

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
    LOSSY_BACKSLASH_PATTERN.test(prose)
  ) {
    return RICH_MARKDOWN_SYNTAX_LIMITATION
  }

  return null
}

function maskMarkdownCode(markdown: string): string {
  let fence: { character: string; length: number } | null = null

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

      if (/^(?: {4}|\t)/.test(line)) return ''

      return maskInlineCode(line)
    })
    .join('\n')
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
