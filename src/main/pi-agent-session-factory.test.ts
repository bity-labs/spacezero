import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createPiAgentSessionFactory } from './pi-agent-session-factory'

describe('createPiAgentSessionFactory', () => {
  it('creates an idle faux Pi session with project tools and a transcript under the Space Zero agent dir', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-'))

    try {
      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })

      const session = await createPiSession({
        sessionId: 'session-1',
        projectId: 'project-1',
        cwd: tempDir
      })

      try {
        expect(session.isStreaming).toBe(false)
        expect(session.modelProvider).toBe('faux')
        expect(session.modelId).toBe('faux-1')
        expect(session.sessionFile).toContain(join(tempDir, 'agent', 'sessions'))
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
