import { isMap, parseDocument } from 'yaml'

import type {
  AgentDefinitionCatalogEntry,
  AgentDefinitionDiagnostic,
  AgentDefinitionScope,
  AgentDefinitionSpawns
} from '../shared/agent-definition.model'

const KNOWN_FIELDS = new Set(['name', 'description', 'model', 'thinking', 'tools', 'spawns'])
const RESERVED_FIELDS = new Set(['output', 'blocking'])

export type ParseAgentDefinitionInput = {
  id: string
  scope: AgentDefinitionScope
  path: string
  markdown: string
}

export function parseAgentDefinitionMarkdown({
  id,
  scope,
  path,
  markdown
}: ParseAgentDefinitionInput): AgentDefinitionCatalogEntry {
  const frontmatter = extractFrontmatter(markdown)

  if (!frontmatter.ok) {
    return createInvalidEntry(id, scope, path, [frontmatter.diagnostic])
  }

  const parsedFrontmatter = parseFrontmatter(frontmatter.source)

  if (!parsedFrontmatter.ok) {
    return createInvalidEntry(id, scope, path, [parsedFrontmatter.diagnostic])
  }

  const diagnostics: AgentDefinitionDiagnostic[] = []
  const values = parsedFrontmatter.values

  for (const key of Object.keys(values).sort()) {
    if (RESERVED_FIELDS.has(key)) {
      diagnostics.push({
        severity: 'error',
        code: 'agentDefinitions.reservedFieldNotSupported',
        message: `Frontmatter field "${key}" is reserved and not yet supported.`
      })
      continue
    }

    if (!KNOWN_FIELDS.has(key)) {
      diagnostics.push({
        severity: 'warning',
        code: 'agentDefinitions.unknownField',
        message: `Unknown frontmatter field "${key}" was ignored.`
      })
    }
  }

  const name = readRequiredString(values, 'name')
  const description = readRequiredString(values, 'description')

  if (!name) {
    diagnostics.push({
      severity: 'error',
      code: 'agentDefinitions.nameRequired',
      message: 'Agent Definition name is required.'
    })
  }

  if (!description) {
    diagnostics.push({
      severity: 'error',
      code: 'agentDefinitions.descriptionRequired',
      message: 'Agent Definition description is required.'
    })
  }

  const model = readOptionalString(values, 'model')
  const thinking = readOptionalString(values, 'thinking')
  let tools: string[] | undefined
  let spawns: AgentDefinitionSpawns

  try {
    tools = readOptionalList(values, 'tools')
    spawns = parseSpawns(values.spawns)
  } catch {
    diagnostics.push({
      severity: 'error',
      code: 'agentDefinitions.malformedFrontmatter',
      message: 'Agent Definition frontmatter could not be parsed.'
    })
    spawns = { type: 'none' }
  }

  const entry = {
    id,
    scope,
    path,
    diagnostics,
    name: name || undefined,
    description: description || undefined,
    model,
    thinking,
    tools,
    spawns,
    body: frontmatter.body,
    status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'invalid' : 'valid'
  } satisfies AgentDefinitionCatalogEntry

  return entry
}

function createInvalidEntry(
  id: string,
  scope: AgentDefinitionScope,
  path: string,
  diagnostics: AgentDefinitionDiagnostic[]
): AgentDefinitionCatalogEntry {
  return { id, scope, path, status: 'invalid', diagnostics }
}

function extractFrontmatter(
  markdown: string
):
  | { ok: true; source: string; body: string }
  | { ok: false; diagnostic: AgentDefinitionDiagnostic } {
  const normalized = markdown.replace(/\r\n/g, '\n')

  if (!normalized.startsWith('---\n')) {
    return {
      ok: false,
      diagnostic: {
        severity: 'error',
        code: 'agentDefinitions.missingFrontmatter',
        message: 'Agent Definition frontmatter is required.'
      }
    }
  }

  const closingMatch = normalized.slice(4).match(/^---\s*$/m)
  if (!closingMatch?.index && closingMatch?.index !== 0) {
    return {
      ok: false,
      diagnostic: {
        severity: 'error',
        code: 'agentDefinitions.malformedFrontmatter',
        message: 'Agent Definition frontmatter could not be parsed.'
      }
    }
  }

  const frontmatterEnd = 4 + closingMatch.index
  const closingLineEnd = normalized.indexOf('\n', frontmatterEnd)

  return {
    ok: true,
    source: normalized.slice(4, frontmatterEnd),
    body: closingLineEnd === -1 ? '' : normalized.slice(closingLineEnd + 1).replace(/^\n/, '')
  }
}

function parseFrontmatter(
  source: string
):
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; diagnostic: AgentDefinitionDiagnostic } {
  try {
    const document = parseDocument(source)

    if (document.errors.length > 0) throw new Error('invalid YAML')

    if (document.contents === null) return { ok: true, values: {} }
    if (!isMap(document.contents)) throw new Error('frontmatter must be a mapping')

    const values = document.toJS() as unknown
    if (!isRecord(values)) throw new Error('frontmatter must be a mapping')

    return { ok: true, values }
  } catch {
    return {
      ok: false,
      diagnostic: {
        severity: 'error',
        code: 'agentDefinitions.malformedFrontmatter',
        message: 'Agent Definition frontmatter could not be parsed.'
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseScalar(value: string): string {
  const trimmedValue = value.trim()
  const quote = trimmedValue.at(0)

  if (quote === '"' || quote === "'") {
    if (!trimmedValue.endsWith(quote) || trimmedValue.length === 1)
      throw new Error('unterminated quote')
    return trimmedValue.slice(1, -1).trim()
  }

  return trimmedValue
}

function readRequiredString(values: Record<string, unknown>, key: string): string | undefined {
  const value = values[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readOptionalString(values: Record<string, unknown>, key: string): string | undefined {
  return readRequiredString(values, key)
}

function readOptionalList(values: Record<string, unknown>, key: string): string[] | undefined {
  const value = values[key]
  if (value === undefined) return undefined
  if (Array.isArray(value)) {
    if (!value.every((item): item is string => typeof item === 'string')) {
      throw new Error('list items must be strings')
    }
    return value.map((item) => item.trim()).filter(Boolean)
  }
  if (typeof value !== 'string') throw new Error('list must be a string or string array')
  return splitCsv(value)
    .map((item) => parseScalar(item).trim())
    .filter(Boolean)
}

function parseSpawns(value: unknown): AgentDefinitionSpawns {
  if (value === undefined) return { type: 'none' }

  const spawns = Array.isArray(value)
    ? readStringArray(value)
    : typeof value === 'string'
      ? splitCsv(value)
          .map((item) => parseScalar(item).trim())
          .filter(Boolean)
      : undefined

  if (!spawns) throw new Error('spawns must be a string or string array')

  if (spawns.length === 1 && spawns[0] === '*') return { type: 'any' }
  if (spawns.length === 0) return { type: 'none' }
  return { type: 'list', definitions: spawns }
}

function readStringArray(value: unknown[]): string[] {
  if (!value.every((item): item is string => typeof item === 'string')) {
    throw new Error('list items must be strings')
  }
  return value.map((item) => item.trim()).filter(Boolean)
}

function splitCsv(value: string): string[] {
  const values: string[] = []
  let current = ''
  let quote: string | null = null

  for (const character of value) {
    if ((character === '"' || character === "'") && quote === null) {
      quote = character
      current += character
      continue
    }

    if (character === quote) {
      quote = null
      current += character
      continue
    }

    if (character === ',' && quote === null) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  if (quote !== null) throw new Error('unterminated quote')
  values.push(current.trim())
  return values.filter(Boolean)
}
