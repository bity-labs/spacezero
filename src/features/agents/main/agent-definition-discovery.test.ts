import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { discoverGlobalAgentDefinitions } from './agent-definition-discovery'
import { BUNDLED_AGENT_DEFINITIONS } from './bundled-agent-definitions'

const tempRoots: string[] = []

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'spacezero-agent-definitions-'))
  tempRoots.push(root)
  return root
}

async function writeDefinition(
  directory: string,
  filename: string,
  frontmatter: string,
  body = 'Instructions.\n'
): Promise<void> {
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, filename), `---\n${frontmatter}---\n${body}`, 'utf8')
}

describe('discoverGlobalAgentDefinitions', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('discovers the shipped scout and reviewer definitions through the parser path', async () => {
    const catalog = await discoverGlobalAgentDefinitions({
      sources: [{ scope: 'bundled', definitions: BUNDLED_AGENT_DEFINITIONS }]
    })

    expect(catalog.map((entry) => [entry.id, entry.scope, entry.status, entry.path])).toEqual([
      ['reviewer', 'bundled', 'valid', 'bundled://agents/reviewer.md'],
      ['scout', 'bundled', 'valid', 'bundled://agents/scout.md']
    ])
    expect(catalog.every((entry) => entry.diagnostics.length === 0)).toBe(true)

    expect(catalog.find((entry) => entry.id === 'scout')).toMatchObject({
      name: 'Scout',
      description: expect.stringContaining('Researches the codebase'),
      tools: ['read', 'grep', 'find', 'ls'],
      body: expect.stringContaining('Report format:')
    })
    expect(catalog.find((entry) => entry.id === 'reviewer')).toMatchObject({
      name: 'Reviewer',
      description: expect.stringContaining('Reviews completed changes'),
      tools: expect.arrayContaining(['read', 'grep', 'find', 'ls']),
      body: expect.stringContaining('diff')
    })
  })

  it('discovers only spacezero, user, and bundled definitions with global precedence and shadowing', async () => {
    const root = await createTempRoot()
    const spaceZeroAgentsPath = join(root, 'SpaceZero', 'agents')
    const userAgentsPath = join(root, 'home', '.agents', 'agents')
    const projectAgentsPath = join(root, 'project', '.agents', 'agents')

    await writeDefinition(
      spaceZeroAgentsPath,
      'reviewer.md',
      'name: Space Reviewer\ndescription: Space Zero definition.\n'
    )
    await writeDefinition(
      userAgentsPath,
      'reviewer.md',
      'name: User Reviewer\ndescription: User definition.\n'
    )
    await writeDefinition(
      projectAgentsPath,
      'project-only.md',
      'name: Project Only\ndescription: Must not be scanned globally.\n'
    )

    const catalog = await discoverGlobalAgentDefinitions({
      sources: [
        { scope: 'spacezero', path: spaceZeroAgentsPath },
        { scope: 'user', path: userAgentsPath },
        { scope: 'bundled', definitions: [] }
      ]
    })

    expect(catalog.map((entry) => [entry.id, entry.scope, entry.status, entry.shadowedBy])).toEqual(
      [
        ['reviewer', 'spacezero', 'valid', undefined],
        ['reviewer', 'user', 'valid', 'spacezero']
      ]
    )
    expect(catalog.some((entry) => entry.id === 'project-only')).toBe(false)
  })

  it('applies contextual project precedence and keeps invalid project diagnostics visible', async () => {
    const root = await createTempRoot()
    const projectAgentsPath = join(root, 'project', '.agents', 'agents')
    const spaceZeroAgentsPath = join(root, 'SpaceZero', 'agents')
    const userAgentsPath = join(root, 'home', '.agents', 'agents')

    await writeDefinition(
      projectAgentsPath,
      'reviewer.md',
      'name: Project Reviewer\ndescription: Project definition.\n'
    )
    await writeDefinition(projectAgentsPath, 'broken.md', 'name: Broken Project\n')
    await writeDefinition(
      spaceZeroAgentsPath,
      'reviewer.md',
      'name: Space Reviewer\ndescription: Space Zero definition.\n'
    )
    await writeDefinition(
      userAgentsPath,
      'reviewer.md',
      'name: User Reviewer\ndescription: User definition.\n'
    )

    const catalog = await discoverGlobalAgentDefinitions({
      sources: [
        { scope: 'project', path: projectAgentsPath },
        { scope: 'spacezero', path: spaceZeroAgentsPath },
        { scope: 'user', path: userAgentsPath },
        { scope: 'bundled', definitions: [] }
      ]
    })

    expect(catalog.map((entry) => [entry.id, entry.scope, entry.status, entry.shadowedBy])).toEqual(
      [
        ['broken', 'project', 'invalid', undefined],
        ['reviewer', 'project', 'valid', undefined],
        ['reviewer', 'spacezero', 'valid', 'project'],
        ['reviewer', 'user', 'valid', 'project']
      ]
    )
    expect(catalog[0].diagnostics[0]).toMatchObject({
      code: 'agentDefinitions.descriptionRequired'
    })
  })

  it('keeps bundled definitions as fallback entries and marks them shadowed by higher scopes', async () => {
    const root = await createTempRoot()
    const userAgentsPath = join(root, 'home', '.agents', 'agents')

    await writeDefinition(
      userAgentsPath,
      'scout.md',
      'name: User Scout\ndescription: User scout definition.\n'
    )

    const catalog = await discoverGlobalAgentDefinitions({
      sources: [
        { scope: 'spacezero', path: join(root, 'SpaceZero', 'agents') },
        { scope: 'user', path: userAgentsPath },
        { scope: 'bundled', definitions: BUNDLED_AGENT_DEFINITIONS }
      ]
    })

    expect(catalog.map((entry) => [entry.id, entry.scope, entry.shadowedBy])).toEqual([
      ['scout', 'user', undefined],
      ['reviewer', 'bundled', undefined],
      ['scout', 'bundled', 'user']
    ])
  })

  it('marks bundled definitions shadowed by Space Zero definitions', async () => {
    const root = await createTempRoot()
    const spaceZeroAgentsPath = join(root, 'SpaceZero', 'agents')

    await writeDefinition(
      spaceZeroAgentsPath,
      'reviewer.md',
      'name: Space Zero Reviewer\ndescription: Space Zero reviewer definition.\n'
    )

    const catalog = await discoverGlobalAgentDefinitions({
      sources: [
        { scope: 'spacezero', path: spaceZeroAgentsPath },
        { scope: 'user', path: join(root, 'home', '.agents', 'agents') },
        { scope: 'bundled', definitions: BUNDLED_AGENT_DEFINITIONS }
      ]
    })

    expect(catalog.map((entry) => [entry.id, entry.scope, entry.shadowedBy])).toEqual([
      ['reviewer', 'spacezero', undefined],
      ['scout', 'bundled', undefined],
      ['reviewer', 'bundled', 'spacezero']
    ])
  })

  it('includes invalid files with parse diagnostics and lets lower valid definitions remain active', async () => {
    const root = await createTempRoot()
    const spaceZeroAgentsPath = join(root, 'SpaceZero', 'agents')
    const userAgentsPath = join(root, 'home', '.agents', 'agents')

    await writeDefinition(spaceZeroAgentsPath, 'reviewer.md', 'name: Broken\n')
    await writeDefinition(
      userAgentsPath,
      'reviewer.md',
      'name: User Reviewer\ndescription: User definition.\n'
    )

    const catalog = await discoverGlobalAgentDefinitions({
      sources: [
        { scope: 'spacezero', path: spaceZeroAgentsPath },
        { scope: 'user', path: userAgentsPath },
        { scope: 'bundled', definitions: [] }
      ]
    })

    expect(catalog.map((entry) => [entry.id, entry.scope, entry.status, entry.shadowedBy])).toEqual(
      [
        ['reviewer', 'spacezero', 'invalid', undefined],
        ['reviewer', 'user', 'valid', undefined]
      ]
    )
    expect(catalog[0].diagnostics).toContainEqual({
      severity: 'error',
      code: 'agentDefinitions.descriptionRequired',
      message: 'Agent Definition description is required.'
    })
  })
})
