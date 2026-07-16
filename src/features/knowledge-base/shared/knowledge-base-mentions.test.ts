import { describe, expect, it } from 'vitest'

import {
  appendKnowledgeBaseMentionContext,
  parseKnowledgeBaseMentions,
  stripKnowledgeBaseMentionContext
} from './knowledge-base-mentions'

describe('parseKnowledgeBaseMentions', () => {
  it('recognizes file and folder mentions without expanding folder contents', () => {
    expect(
      parseKnowledgeBaseMentions(
        'Compare @kb/decisions/architecture.md with @kb/projects/space-zero/ please.'
      )
    ).toEqual([
      {
        raw: '@kb/decisions/architecture.md',
        relativePath: 'decisions/architecture.md',
        kind: 'file'
      },
      {
        raw: '@kb/projects/space-zero/',
        relativePath: 'projects/space-zero',
        kind: 'folder'
      }
    ])
  })

  it('deduplicates mentions and ignores incomplete paths', () => {
    expect(parseKnowledgeBaseMentions('@kb/ @kb/note.md @kb/note.md')).toEqual([
      { raw: '@kb/note.md', relativePath: 'note.md', kind: 'file' }
    ])
  })
})

describe('Knowledge Base prompt context', () => {
  it('adds soft path hints and strips them back out for transcript display', () => {
    const message = 'Update @kb/decisions/architecture.md'
    const contextualMessage = appendKnowledgeBaseMentionContext(message, [
      {
        mention: {
          raw: '@kb/decisions/architecture.md',
          relativePath: 'decisions/architecture.md',
          kind: 'file'
        },
        absolutePath: '/home/builder/SpaceZero/knowledge-base/decisions/architecture.md'
      }
    ])

    expect(contextualMessage).toContain('soft read/write path hints')
    expect(contextualMessage).toContain(
      '@kb/decisions/architecture.md -> /home/builder/SpaceZero/knowledge-base/decisions/architecture.md'
    )
    expect(stripKnowledgeBaseMentionContext(contextualMessage)).toBe(message)
  })
})
