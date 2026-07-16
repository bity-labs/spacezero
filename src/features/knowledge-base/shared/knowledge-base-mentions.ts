export const KNOWLEDGE_BASE_CONTEXT_START = '\n\n<spacezero-knowledge-base-path-hints>'
export const KNOWLEDGE_BASE_CONTEXT_END = '</spacezero-knowledge-base-path-hints>'

export type KnowledgeBaseMention = {
  raw: string
  relativePath: string
  kind: 'file' | 'folder'
}

export type ResolvedKnowledgeBaseMention = {
  mention: KnowledgeBaseMention
  absolutePath: string
}

export function parseKnowledgeBaseMentions(message: string): KnowledgeBaseMention[] {
  const mentions: KnowledgeBaseMention[] = []
  const seen = new Set<string>()
  const pattern = /(?:^|\s)(@kb\/[^\s]+)/g

  for (const match of message.matchAll(pattern)) {
    const raw = match[1]
    if (!raw) continue
    const mentionedPath = raw.slice('@kb/'.length)
    const kind = mentionedPath.endsWith('/') ? 'folder' : 'file'
    const relativePath = kind === 'folder' ? mentionedPath.slice(0, -1) : mentionedPath
    if (!relativePath || seen.has(raw)) continue
    seen.add(raw)
    mentions.push({ raw, relativePath, kind })
  }

  return mentions
}

export function getActiveKnowledgeBaseMentionQuery(
  message: string
): { start: number; query: string } | undefined {
  const match = /@kb\/([^\s]*)$/.exec(message)
  if (!match || match.index < 0) return undefined
  return { start: match.index, query: match[1] ?? '' }
}

export function appendKnowledgeBaseMentionContext(
  message: string,
  mentions: ResolvedKnowledgeBaseMention[]
): string {
  if (mentions.length === 0) return message
  const paths = mentions
    .map(
      ({ mention, absolutePath }) =>
        `- ${mention.raw} -> ${absolutePath} (${mention.kind})`
    )
    .join('\n')

  return `${message}${KNOWLEDGE_BASE_CONTEXT_START}\nThe user supplied these as soft read/write path hints for the current task:\n${paths}\nResolve @kb paths against the absolute paths above. Stay focused on the mentioned scope. Do not automatically read every file in a mentioned folder or treat the hints as a hard permission sandbox.\n${KNOWLEDGE_BASE_CONTEXT_END}`
}

export function stripKnowledgeBaseMentionContext(message: string): string {
  const contextStart = message.indexOf(KNOWLEDGE_BASE_CONTEXT_START)
  return contextStart === -1 ? message : message.slice(0, contextStart)
}
