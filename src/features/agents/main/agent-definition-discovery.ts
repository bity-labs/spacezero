import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'

import type {
  AgentDefinitionCatalogEntry,
  AgentDefinitionSource,
  BundledAgentDefinitionSource
} from '../shared/agent-definition.model'
import { parseAgentDefinitionMarkdown } from './agent-definition-parser'

const SCOPE_PRECEDENCE = {
  project: 0,
  spacezero: 1,
  user: 2,
  bundled: 3
} as const

type InternalCatalogEntry = AgentDefinitionCatalogEntry & { sourceOrder?: number }

export async function discoverGlobalAgentDefinitions({
  sources
}: {
  sources: AgentDefinitionSource[]
}): Promise<AgentDefinitionCatalogEntry[]> {
  const entries = (
    await Promise.all(sources.map((source, index) => readSourceEntries(source, index)))
  ).flat()
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

  const winningEntryById = new Map<string, AgentDefinitionCatalogEntry>()

  for (const [id, definitions] of validEntriesById.entries()) {
    const [winner] = definitions.sort(
      (a, b) =>
        SCOPE_PRECEDENCE[a.scope] - SCOPE_PRECEDENCE[b.scope] ||
        ((a as InternalCatalogEntry).sourceOrder ?? 0) -
          ((b as InternalCatalogEntry).sourceOrder ?? 0) ||
        a.path.localeCompare(b.path)
    )
    if (winner) winningEntryById.set(id, winner)
  }

  return entries
    .map((entry) => {
      const publicEntry = { ...(entry as InternalCatalogEntry) }
      delete publicEntry.sourceOrder
      if (entry.status !== 'valid') return publicEntry

      const winningEntry = winningEntryById.get(entry.id)
      if (!winningEntry || winningEntry === entry) return publicEntry
      return { ...publicEntry, shadowedBy: winningEntry.scope }
    })
    .sort((a, b) => Number(Boolean(a.shadowedBy)) - Number(Boolean(b.shadowedBy)))
}

async function readSourceEntries(
  source: AgentDefinitionSource,
  sourceOrder: number
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
        return {
          ...parseAgentDefinitionMarkdown({
            id: basename(filename, extname(filename)),
            scope: source.scope,
            path: definitionPath,
            markdown: await readFile(definitionPath, 'utf8')
          }),
          sourceOrder
        }
      } catch {
        return {
          id: basename(filename, extname(filename)),
          scope: source.scope,
          path: definitionPath,
          status: 'invalid' as const,
          sourceOrder,
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
