import { z } from 'zod'
import { vi } from 'vitest'

import { InMemoryAgentActivityHistory } from './agent-activity-history'
import type { AgentActivityHistory } from './agent-activity-history'
import { WorkspaceToolRegistry, composeWorkspaceToolRegistry } from './workspace-tool-registry'
import { DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY } from './workspace-tool-safety-policy'
import type { WorkspaceTool, WorkspaceToolHandler } from './workspace-tool.model'
import { WorkspaceToolExecutor, type WorkspaceToolExecutorInit } from './workspace-tool-executor'

function tool(overrides: Partial<WorkspaceTool> & Pick<WorkspaceTool, 'name'>): WorkspaceTool {
  return {
    description: `${overrides.name} tool`,
    safetyLevel: 'read',
    kind: 'app-state',
    domain: 'workspace',
    inputSchema: z.object({}).strict(),
    handler: async () => ({ ok: true, data: { done: true } }),
    ...overrides
  }
}

type BuildExecutorInit = Partial<WorkspaceToolExecutorInit> & {
  now?: () => Date
  id?: () => string
}

function buildExecutor(
  tools: WorkspaceTool[],
  init: BuildExecutorInit = {}
): {
  executor: WorkspaceToolExecutor
  history: AgentActivityHistory
  registry: WorkspaceToolRegistry
} {
  const registry = composeWorkspaceToolRegistry(tools)
  const history =
    init.history ??
    new InMemoryAgentActivityHistory({
      now: init.now ?? (() => new Date('2026-07-06T12:00:00.000Z')),
      id: init.id ?? (() => 'rec-1')
    })
  const executor = new WorkspaceToolExecutor({
    registry,
    policy: init.policy ?? DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY,
    history
  })
  return { executor, history, registry }
}

describe('WorkspaceToolExecutor', () => {
  describe('successful execution', () => {
    it('resolves, validates, executes a read tool and returns structured data', async () => {
      const handler = vi.fn(async ({ name }: { name: string }) => ({
        ok: true,
        data: { created: name }
      })) as unknown as WorkspaceToolHandler
      const tools = [
        tool({
          name: 'projects.create',
          safetyLevel: 'write',
          inputSchema: z.object({ name: z.string() }).strict(),
          handler
        })
      ]
      const policy = {
        allowWriteWithoutConfirmation: true,
        allowDangerousWithoutConfirmation: false
      }
      const { executor, history } = buildExecutor(tools, { policy })

      const result = await executor.execute('projects.create', { name: 'spacezero' })

      expect(result).toEqual({ ok: true, data: { created: 'spacezero' } })
      expect(handler).toHaveBeenCalledWith({ name: 'spacezero' })
      expect(history.list()[0]).toMatchObject({
        toolName: 'projects.create',
        outcome: 'success',
        safetyLevel: 'write',
        kind: 'app-state',
        domain: 'workspace'
      })
    })

    it('returns structured data only and never a polished summary', async () => {
      const tools = [
        tool({
          name: 'projects.list',
          handler: async () => ({ ok: true, data: { projects: [] } })
        })
      ]
      const { executor } = buildExecutor(tools)

      const result = await executor.execute('projects.list', {})

      expect(result).toEqual({ ok: true, data: { projects: [] } })
      expect(result).not.toHaveProperty('summary')
      expect(result).not.toHaveProperty('message')
    })
  })

  describe('unknown tool', () => {
    it('rejects calls to tools that are not registered', async () => {
      const { executor, history } = buildExecutor([])

      const result = await executor.execute('projects.unknown', { x: 1 })

      expect(result.ok).toBe(false)
      expect(result.error?.code).toBe('unknown-tool')
      expect(history.list()[0]).toMatchObject({
        toolName: 'projects.unknown',
        outcome: 'rejected'
      })
    })
  })

  describe('invalid input', () => {
    it('validates input against the tool schema before calling the handler', async () => {
      const handler = vi.fn(async () => ({ ok: true }))
      const tools = [
        tool({
          name: 'projects.create',
          safetyLevel: 'write',
          inputSchema: z.object({ name: z.string() }).strict(),
          handler
        })
      ]
      const policy = {
        allowWriteWithoutConfirmation: true,
        allowDangerousWithoutConfirmation: false
      }
      const { executor, history } = buildExecutor(tools, { policy })

      const result = await executor.execute('projects.create', { name: 123 })

      expect(handler).not.toHaveBeenCalled()
      expect(result.ok).toBe(false)
      expect(result.error?.code).toBe('invalid-input')
      expect(history.list()[0]).toMatchObject({
        toolName: 'projects.create',
        outcome: 'rejected',
        safetyLevel: 'write'
      })
    })
  })

  describe('safety policy behavior', () => {
    it('does not execute a write tool when confirmation is required by policy', async () => {
      const handler = vi.fn(async () => ({ ok: true }))
      const tools = [
        tool({
          name: 'projects.create',
          safetyLevel: 'write',
          inputSchema: z.object({ name: z.string() }),
          handler
        })
      ]
      // default policy requires confirmation for writes
      const { executor, history } = buildExecutor(tools)

      const result = await executor.execute('projects.create', { name: 'spacezero' })

      expect(handler).not.toHaveBeenCalled()
      expect(result.ok).toBe(false)
      expect(result.error?.code).toBe('confirmation-required')
      expect(history.list()[0]).toMatchObject({
        toolName: 'projects.create',
        outcome: 'confirmation-required',
        safetyLevel: 'write'
      })
    })

    it('executes a read tool without confirmation regardless of policy', async () => {
      const handler = vi.fn(async () => ({ ok: true, data: { ok: true } }))
      const tools = [tool({ name: 'projects.list', safetyLevel: 'read', handler })]
      const { executor } = buildExecutor(tools)

      const result = await executor.execute('projects.list', {})

      expect(handler).toHaveBeenCalledOnce()
      expect(result.ok).toBe(true)
    })

    it('blocks dangerous tools under the default policy and allows them when opted in', async () => {
      const handler = vi.fn(async () => ({ ok: true }))
      const dangerousTool = tool({
        name: 'projects.delete',
        safetyLevel: 'dangerous',
        inputSchema: z.object({ id: z.string() }),
        handler
      })

      const blocked = buildExecutor([dangerousTool]).executor
      const blockedResult = await blocked.execute('projects.delete', { id: 'p1' })
      expect(handler).not.toHaveBeenCalled()
      expect(blockedResult.error?.code).toBe('confirmation-required')

      const allowed = buildExecutor([dangerousTool], {
        policy: { allowWriteWithoutConfirmation: false, allowDangerousWithoutConfirmation: true }
      }).executor
      const allowedResult = await allowed.execute('projects.delete', { id: 'p1' })
      expect(handler).toHaveBeenCalledOnce()
      expect(allowedResult.ok).toBe(true)
    })
  })

  describe('activity history recording', () => {
    it('records every outcome but never tool input or output payloads', async () => {
      const handler = vi.fn(async ({ value }: { value: string }) => ({
        ok: true,
        data: { echoed: value }
      })) as unknown as WorkspaceToolHandler
      const tools = [
        tool({
          name: 'workspace.echo',
          safetyLevel: 'read',
          inputSchema: z.object({ value: z.string() }),
          handler
        })
      ]
      const { executor, history } = buildExecutor(tools)

      await executor.execute('workspace.echo', { value: '-sensitive-input-' })

      const record = history.list()[0]
      expect(record.outcome).toBe('success')
      expect(record).not.toHaveProperty('input')
      expect(record).not.toHaveProperty('output')
      expect(JSON.stringify(record)).not.toContain('sensitive-input')
    })

    it('records an error outcome when a handler throws', async () => {
      const handler = vi.fn(async () => {
        throw new Error('boom')
      })
      const tools = [
        tool({
          name: 'workspace.broken',
          safetyLevel: 'read',
          inputSchema: z.object({}).strict(),
          handler
        })
      ]
      const { executor, history } = buildExecutor(tools)

      const result = await executor.execute('workspace.broken', {})

      expect(result.ok).toBe(false)
      expect(result.error?.code).toBe('handler-error')
      expect(history.list()[0]).toMatchObject({
        toolName: 'workspace.broken',
        outcome: 'error'
      })
    })

    it('records an error outcome when a handler returns a structured failure', async () => {
      const handler = vi.fn(async () => ({
        ok: false,
        error: { code: 'not-found', message: 'no' }
      }))
      const tools = [
        tool({
          name: 'workspace.fail',
          safetyLevel: 'read',
          inputSchema: z.object({}).strict(),
          handler
        })
      ]
      const { executor, history } = buildExecutor(tools)

      const result = await executor.execute('workspace.fail', {})

      expect(result.ok).toBe(false)
      expect(result.error?.code).toBe('not-found')
      const record = history.list()[0]
      expect(record.outcome).toBe('error')
      expect(record.error?.code).toBe('not-found')
    })
  })
})
