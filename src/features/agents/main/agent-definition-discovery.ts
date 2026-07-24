import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'

import type {
  AgentDefinitionCatalogEntry,
  AgentDefinitionSource,
  BundledAgentDefinitionSource
} from '../shared/agent-definition.model'
import { parseAgentDefinitionMarkdown } from './agent-definition-parser'

const SCOPE_PRECEDENCE = {
  spacezero: 0,
  user: 1,
  bundled: 2
} as const

export async function discoverGlobalAgentDefinitions({
  sources
}: {
  sources: AgentDefinitionSource[]
}): Promise<AgentDefinitionCatalogEntry[]> {
  const entries = (await Promise.all(sources.map(readSourceEntries))).flat()
  return applyAgentDefinitionShadowing(entries)
}

export function applyAgentDefinitionShadowing(
  entries: AgentDefinitionCatalogEntry[]
): AgentDefinitionCatalogEntry[] {
  const validEntriesById = new Map<string, AgentDefinitionCatalogEntry[]>()

  for (const entry of entries) {
    if (entry.status !== 'valid') continue
    const existing = validEntriesById.get(entry.id) ?? []
    existing.push(entry)
    validEntriesById.set(entry.id, existing)
  }

  const winningScopeById = new Map<string, AgentDefinitionCatalogEntry['scope']>()

  for (const [id, definitions] of validEntriesById.entries()) {
    const [winner] = definitions.sort(
      (a, b) =>
        SCOPE_PRECEDENCE[a.scope] - SCOPE_PRECEDENCE[b.scope] || a.path.localeCompare(b.path)
    )
    if (winner) winningScopeById.set(id, winner.scope)
  }

  return entries
    .map((entry) => {
      if (entry.status !== 'valid') return entry

      const winningScope = winningScopeById.get(entry.id)
      if (!winningScope || winningScope === entry.scope) return entry
      return { ...entry, shadowedBy: winningScope }
    })
    .sort((a, b) => Number(Boolean(a.shadowedBy)) - Number(Boolean(b.shadowedBy)))
}

async function readSourceEntries(
  source: AgentDefinitionSource
): Promise<AgentDefinitionCatalogEntry[]> {
  if (source.scope === 'bundled') return readBundledEntries(source.definitions)

  const directory = resolve(source.path)
  let filenames: string[]

  try {
    filenames = await readdir(directory)
  } catch {
    return []
  }

  const markdownFilenames = filenames
    .filter((filename) => extname(filename).toLowerCase() === '.md')
    .sort((a, b) => a.localeCompare(b))

  const entries = await Promise.all(
    markdownFilenames.map(async (filename) => {
      const definitionPath = join(directory, filename)
      try {
        return parseAgentDefinitionMarkdown({
          id: basename(filename, extname(filename)),
          scope: source.scope,
          path: definitionPath,
          markdown: await readFile(definitionPath, 'utf8')
        })
      } catch {
        return {
          id: basename(filename, extname(filename)),
          scope: source.scope,
          path: definitionPath,
          status: 'invalid' as const,
          diagnostics: [
            {
              severity: 'error' as const,
              code: 'agentDefinitions.fileReadFailed',
              message: 'Agent Definition file could not be read.'
            }
          ]
        }
      }
    })
  )

  return entries
}

function readBundledEntries(
  definitions: BundledAgentDefinitionSource[]
): AgentDefinitionCatalogEntry[] {
  return [...definitions]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((definition) =>
      parseAgentDefinitionMarkdown({
        id: definition.id,
        scope: 'bundled',
        path: definition.path,
        markdown: definition.markdown
      })
    )
}
