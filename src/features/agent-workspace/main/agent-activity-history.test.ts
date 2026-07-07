import { InMemoryAgentActivityHistory } from './agent-activity-history'

describe('InMemoryAgentActivityHistory', () => {
  it('records activity metadata with an id and timestamp', () => {
    const history = new InMemoryAgentActivityHistory({
      now: () => new Date('2026-07-06T12:00:00.000Z'),
      id: () => 'rec-1'
    })

    const record = history.record({
      toolName: 'projects.list',
      outcome: 'success',
      safetyLevel: 'read',
      kind: 'app-state',
      domain: 'projects'
    })

    expect(record).toEqual({
      id: 'rec-1',
      toolName: 'projects.list',
      outcome: 'success',
      recordedAt: '2026-07-06T12:00:00.000Z',
      safetyLevel: 'read',
      kind: 'app-state',
      domain: 'projects'
    })
  })

  it('records rejected and confirmation-required outcomes without payloads', () => {
    const history = new InMemoryAgentActivityHistory()

    history.record({ toolName: 'unknown.tool', outcome: 'rejected' })
    history.record({ toolName: 'projects.delete', outcome: 'confirmation-required' })

    expect(history.list().map((r) => r.outcome)).toEqual(['rejected', 'confirmation-required'])
  })

  it('records error metadata for failed tool calls', () => {
    const history = new InMemoryAgentActivityHistory()

    history.record({
      toolName: 'projects.create',
      outcome: 'error',
      error: { code: 'handler-error', message: 'boom' }
    })

    expect(history.list()[0].error).toEqual({ code: 'handler-error', message: 'boom' })
  })

  it('does not store tool input or output payloads', () => {
    const history = new InMemoryAgentActivityHistory()

    // The record entry surface has no payload field, and runtime callers may
    // still pass extra properties through casts or JavaScript. History keeps an
    // explicit metadata allowlist so sensitive payloads cannot be smuggled in.
    history.record({
      toolName: 'projects.create',
      outcome: 'success',
      input: { path: '-sensitive-input-' },
      output: { id: '-sensitive-output-' },
      data: '-sensitive-data-'
    } as Parameters<InMemoryAgentActivityHistory['record']>[0])

    expect(history.list()[0]).not.toHaveProperty('input')
    expect(history.list()[0]).not.toHaveProperty('output')
    expect(history.list()[0]).not.toHaveProperty('data')
    expect(JSON.stringify(history.list()[0])).not.toContain('sensitive')
  })

  it('returns readonly defensive copies that cannot mutate internal state', () => {
    const history = new InMemoryAgentActivityHistory()
    const record = history.record({ toolName: 'projects.list', outcome: 'success' })

    expect(() => ((record as Record<string, unknown>).toolName = 'injected')).toThrow()

    const snapshot = history.list()
    expect(() => (snapshot as Array<unknown>).push('injected')).toThrow()
    expect(() => ((snapshot[0] as Record<string, unknown>).toolName = 'injected')).toThrow()
    expect(history.list()[0].toolName).toBe('projects.list')
  })
})
