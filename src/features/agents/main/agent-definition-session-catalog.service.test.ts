import { describe, expect, it, vi } from 'vitest'

import type { AgentDefinitionSource } from '../shared'
import { listAgentDefinitionsForSession } from './agent-definition-session-catalog.service'

describe('listAgentDefinitionsForSession', () => {
  it('fails closed to global sources when the stored Project is untrusted', async () => {
    const discoverDefinitions = vi.fn(async ({ sources }) =>
      sources.map((source, index) => ({
        id: `source-${index}`,
        scope: source.scope,
        path: source.scope === 'bundled' ? 'bundled://agents/test.md' : source.path,
        status: 'valid' as const,
        diagnostics: []
      }))
    )

    await listAgentDefinitionsForSession('session-1', {
      repository: {
        findSessionById: async () => ({
          id: 'session-1',
          projectId: 'project-1',
          title: 'Session 1',
          status: 'idle',
          createdAt: new Date(0),
          updatedAt: new Date(0),
          worktreePath: '/worktrees/session-1',
          worktreeBranch: 'spacezero/session-1',
          worktreeBaseRevision: 'abc123'
        }),
        findProjectById: async () => ({
          id: 'project-1',
          path: '/repo',
          agentResourcesTrusted: false
        })
      },
      worktrees: { validate: vi.fn(async () => true) },
      discoverDefinitions,
      resolveSourcesForSession: async () => [
        { scope: 'spacezero', path: '/SpaceZero/agents' },
        { scope: 'user', path: '/home/.agents/agents' },
        { scope: 'bundled', definitions: [] }
      ]
    })

    expect(discoverDefinitions.mock.calls[0][0].sources.map((source) => source.scope)).toEqual([
      'spacezero',
      'user',
      'bundled'
    ])
  })

  it('uses validated managed worktree cwd for trusted Project Session project definitions', async () => {
    const validate = vi.fn(async () => true)
    const discoverDefinitions = vi.fn(async (_request: { sources: AgentDefinitionSource[] }) => [])

    await listAgentDefinitionsForSession('session-1', {
      repository: {
        findSessionById: async () => ({
          id: 'session-1',
          projectId: 'project-1',
          title: 'Session 1',
          status: 'idle',
          createdAt: new Date(0),
          updatedAt: new Date(0),
          worktreePath: '/worktrees/session-1',
          worktreeBranch: 'spacezero/session-1',
          worktreeBaseRevision: 'abc123'
        }),
        findProjectById: async () => ({
          id: 'project-1',
          path: '/repo',
          agentResourcesTrusted: true
        })
      },
      worktrees: { validate },
      discoverDefinitions,
      resolveSourcesForSession: async ({ cwd, kind, projectTrusted }) => [
        ...(kind === 'project' && projectTrusted
          ? [{ scope: 'project' as const, path: `${cwd}/.agents/agents` }]
          : []),
        { scope: 'spacezero', path: '/SpaceZero/agents' },
        { scope: 'user', path: '/home/.agents/agents' },
        { scope: 'bundled', definitions: [] }
      ]
    })

    expect(validate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: '/repo',
        projectId: 'project-1',
        sessionId: 'session-1',
        worktree: expect.objectContaining({ path: '/worktrees/session-1' })
      })
    )
    expect(discoverDefinitions.mock.calls[0][0].sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: 'project', path: '/worktrees/session-1/.agents/agents' })
      ])
    )
  })
})
