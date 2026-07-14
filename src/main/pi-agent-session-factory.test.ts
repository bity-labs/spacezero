import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createPiAgentRuntime, createPiAgentSessionFactory } from './pi-agent-session-factory'

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

describe('createPiAgentRuntime auth', () => {
  it('persists API-key auth under the Space Zero agent dir with 0600 permissions and returns sanitized status', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-auth-'))
    const agentDir = join(tempDir, 'agent')

    try {
      const runtime = createPiAgentRuntime({ agentDir })

      await expect(runtime.getAuthStatus()).resolves.toMatchObject({ apiKeys: { configured: [] } })

      await runtime.addApiKey('anthropic', 'sk-secret')

      const authStatus = await runtime.getAuthStatus()
      expect(authStatus.apiKeys.configured).toContainEqual(
        expect.objectContaining({ providerId: 'anthropic', configured: true, source: 'stored', removable: true })
      )
      expect(JSON.stringify(authStatus)).not.toContain('sk-secret')
      expect(statSync(join(agentDir, 'auth.json')).mode & 0o777).toBe(0o600)
      await expect(runtime.testAuth('anthropic')).resolves.toEqual({ ok: true })

      const session = await runtime.createSession({
        sessionId: 'session-anthropic',
        projectId: 'project-1',
        cwd: tempDir
      })
      try {
        expect(session.modelProvider).toBe('anthropic')
      } finally {
        session.dispose()
      }

      await runtime.removeApiKey('anthropic')

      expect((await runtime.getAuthStatus()).apiKeys.configured).not.toContainEqual(
        expect.objectContaining({ providerId: 'anthropic' })
      )
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
