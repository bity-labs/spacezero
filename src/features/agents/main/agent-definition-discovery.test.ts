import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { discoverGlobalAgentDefinitions } from './agent-definition-discovery'

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
        {
          scope: 'bundled',
          definitions: [
            {
              id: 'scout',
              path: 'bundled://agents/scout.md',
              markdown:
                '---\nname: Bundled Scout\ndescription: Bundled scout definition.\n---\nScout.\n'
            },
            {
              id: 'reviewer',
              path: 'bundled://agents/reviewer.md',
              markdown:
                '---\nname: Bundled Reviewer\ndescription: Bundled reviewer definition.\n---\nReview.\n'
            }
          ]
        }
      ]
    })

    expect(catalog.map((entry) => [entry.id, entry.scope, entry.shadowedBy])).toEqual([
      ['scout', 'user', undefined],
      ['reviewer', 'bundled', undefined],
      ['scout', 'bundled', 'user']
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
