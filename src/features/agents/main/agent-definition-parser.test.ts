import { describe, expect, it } from 'vitest'

import { parseAgentDefinitionMarkdown } from './agent-definition-parser'

const baseInput = {
  id: 'reviewer',
  path: '/definitions/reviewer.md',
  scope: 'user' as const
}

describe('parseAgentDefinitionMarkdown', () => {
  it('parses required and optional frontmatter fields from markdown definitions', () => {
    expect(
      parseAgentDefinitionMarkdown({
        ...baseInput,
        markdown: `---
name: Reviewer
description: Reviews code changes.
model: anthropic/claude-sonnet-4-5
thinking: high
tools: [read, grep, find, ls, bash]
spawns: scout, reviewer
---

Review the diff carefully.
`
      })
    ).toMatchObject({
      status: 'valid',
      id: 'reviewer',
      name: 'Reviewer',
      description: 'Reviews code changes.',
      model: 'anthropic/claude-sonnet-4-5',
      thinking: 'high',
      tools: ['read', 'grep', 'find', 'ls', 'bash'],
      spawns: { type: 'list', definitions: ['scout', 'reviewer'] },
      body: 'Review the diff carefully.\n',
      diagnostics: []
    })
  })

  it.each([
    ['absent spawns', '', { type: 'none' }],
    ['wildcard spawns', 'spawns: "*"\n', { type: 'any' }],
    [
      'CSV spawns',
      'spawns: scout, reviewer\n',
      { type: 'list', definitions: ['scout', 'reviewer'] }
    ],
    [
      'array spawns',
      'spawns: [scout, reviewer]\n',
      { type: 'list', definitions: ['scout', 'reviewer'] }
    ]
  ])('parses %s', (_label, spawnsSource, expectedSpawns) => {
    expect(
      parseAgentDefinitionMarkdown({
        ...baseInput,
        markdown: `---
name: Reviewer
description: Reviews code changes.
${spawnsSource}---
Body.
`
      })
    ).toMatchObject({ status: 'valid', spawns: expectedSpawns })
  })

  it('parses tools from CSV and multiline array forms', () => {
    expect(
      parseAgentDefinitionMarkdown({
        ...baseInput,
        markdown: `---
name: Reviewer
description: Reviews code changes.
tools: read, grep, find
---
Body.
`
      })
    ).toMatchObject({ status: 'valid', tools: ['read', 'grep', 'find'] })

    expect(
      parseAgentDefinitionMarkdown({
        ...baseInput,
        markdown: `---
name: Reviewer
description: Reviews code changes.
tools:
  - read
  - grep
  - find
---
Body.
`
      })
    ).toMatchObject({ status: 'valid', tools: ['read', 'grep', 'find'] })
  })

  it('rejects missing required fields with diagnostics', () => {
    const parsed = parseAgentDefinitionMarkdown({
      ...baseInput,
      markdown: `---
name: Reviewer
---
Body.
`
    })

    expect(parsed.status).toBe('invalid')
    expect(parsed.diagnostics).toContainEqual({
      severity: 'error',
      code: 'agentDefinitions.descriptionRequired',
      message: 'Agent Definition description is required.'
    })
  })

  it('reports malformed frontmatter without throwing', () => {
    const parsed = parseAgentDefinitionMarkdown({
      ...baseInput,
      markdown: `---
name: [Reviewer
description: Reviews code changes.
---
Body.
`
    })

    expect(parsed.status).toBe('invalid')
    expect(parsed.diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'agentDefinitions.malformedFrontmatter'
    })
  })

  it('ignores unknown fields with a soft diagnostic', () => {
    const parsed = parseAgentDefinitionMarkdown({
      ...baseInput,
      markdown: `---
name: Reviewer
description: Reviews code changes.
temperature: 0.2
---
Body.
`
    })

    expect(parsed.status).toBe('valid')
    expect(parsed.diagnostics).toEqual([
      {
        severity: 'warning',
        code: 'agentDefinitions.unknownField',
        message: 'Unknown frontmatter field "temperature" was ignored.'
      }
    ])
  })

  it.each(['output', 'blocking'])(
    'rejects reserved %s field with an explicit diagnostic',
    (field) => {
      const parsed = parseAgentDefinitionMarkdown({
        ...baseInput,
        markdown: `---
name: Reviewer
description: Reviews code changes.
${field}: true
---
Body.
`
      })

      expect(parsed.status).toBe('invalid')
      expect(parsed.diagnostics).toContainEqual({
        severity: 'error',
        code: 'agentDefinitions.reservedFieldNotSupported',
        message: `Frontmatter field "${field}" is reserved and not yet supported.`
      })
    }
  )
})
