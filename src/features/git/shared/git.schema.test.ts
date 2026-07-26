import { describe, expect, it } from 'vitest'

import { getGitReviewSchema } from './git.schema'

describe('Git IPC schemas', () => {
  it('accepts the stable Knowledge Base context key without a renderer-supplied root', () => {
    expect(
      getGitReviewSchema.parse({
        context: { kind: 'knowledge-base', contextKey: 'knowledge-base' },
        filter: 'staged'
      })
    ).toEqual({
      context: { kind: 'knowledge-base', contextKey: 'knowledge-base' },
      filter: 'staged'
    })
  })

  it('rejects forged Knowledge Base roots and ordinary Workspace Session contexts', () => {
    expect(() =>
      getGitReviewSchema.parse({
        context: { kind: 'knowledge-base', contextKey: 'knowledge-base', rootPath: '/tmp/repo' }
      })
    ).toThrow()
    expect(() =>
      getGitReviewSchema.parse({
        context: { kind: 'workspace-session', sessionId: 'workspace-1' }
      })
    ).toThrow()
  })
})
