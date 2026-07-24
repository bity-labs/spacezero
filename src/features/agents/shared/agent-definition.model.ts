export type AgentDefinitionScope = 'spacezero' | 'user' | 'bundled'

export type OpenAgentDefinitionsFolderScope = Extract<AgentDefinitionScope, 'spacezero' | 'user'>

export type AgentDefinitionSpawns =
  { type: 'none' } | { type: 'any' } | { type: 'list'; definitions: string[] }

export type AgentDefinitionDiagnostic = {
  severity: 'warning' | 'error'
  code: string
  message: string
}

export type AgentDefinitionCatalogEntry = {
  id: string
  scope: AgentDefinitionScope
  path: string
  status: 'valid' | 'invalid'
  diagnostics: AgentDefinitionDiagnostic[]
  shadowedBy?: AgentDefinitionScope
  name?: string
  description?: string
  model?: string
  thinking?: string
  tools?: string[]
  spawns?: AgentDefinitionSpawns
  body?: string
}

export type AgentDefinitionDirectorySource = {
  scope: Extract<AgentDefinitionScope, 'spacezero' | 'user'>
  path: string
}

export type BundledAgentDefinitionSource = {
  id: string
  path: string
  markdown: string
}

export type AgentDefinitionBundledSource = {
  scope: 'bundled'
  definitions: BundledAgentDefinitionSource[]
}

export type AgentDefinitionSource = AgentDefinitionDirectorySource | AgentDefinitionBundledSource

export type OpenAgentDefinitionsFolderRequest = {
  scope: OpenAgentDefinitionsFolderScope
}
