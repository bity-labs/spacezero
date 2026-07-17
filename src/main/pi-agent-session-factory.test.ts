import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ResourceDiagnostic } from '@earendil-works/pi-coding-agent'
import { describe, expect, it } from 'vitest'

import {
  createPiAgentRuntime,
  createPiAgentSessionFactory,
  toAgentStreamingEvent,
  toPiToolName
} from './pi-agent-session-factory'

describe('toAgentStreamingEvent', () => {
  it('preserves thinking parts from live message updates', () => {
    const event = toAgentStreamingEvent('session-1', {
      type: 'message_update',
      message: {
        id: 'message-1',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'I should inspect the workspace.', redacted: false },
          { type: 'text', text: 'I will check that.' }
        ],
        timestamp: 100
      },
      assistantMessageEvent: {
        type: 'thinking_delta',
        contentIndex: 0,
        delta: 'workspace.'
      }
    })

    expect(event).toEqual({
      type: 'message_update',
      sessionId: 'session-1',
      messageId: 'message-1',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'I should inspect the workspace.', redacted: false },
          { type: 'text', text: 'I will check that.' }
        ],
        timestamp: 100,
        stopReason: undefined,
        errorMessage: undefined
      }
    })
  })

  it('preserves skill-shaped tool result text verbatim', () => {
    const toolOutput = '<skill name="example" location="/private/SKILL.md">\noutput\n</skill>'
    const event = toAgentStreamingEvent('session-1', {
      type: 'message_end',
      message: {
        id: 'message-1',
        role: 'toolResult',
        toolCallId: 'tool-call-1',
        toolName: 'bash',
        content: [{ type: 'text', text: toolOutput }],
        isError: false,
        timestamp: 100
      }
    })

    expect(event).toEqual({
      type: 'message_end',
      sessionId: 'session-1',
      messageId: 'message-1',
      message: {
        role: 'toolResult',
        toolCallId: 'tool-call-1',
        toolName: 'bash',
        content: [{ type: 'text', text: toolOutput }],
        isError: false,
        details: undefined,
        timestamp: 100
      }
    })
  })

  it('fails closed for an unparseable skill-shaped user message', () => {
    const expandedSkill =
      '<skill name="review"private" location="/private/SKILL.md">\nPRIVATE BODY\n</skill>'
    const event = toAgentStreamingEvent('session-1', {
      type: 'message_end',
      message: {
        id: 'message-1',
        role: 'user',
        content: [{ type: 'text', text: expandedSkill }],
        timestamp: 100
      }
    })

    expect(event).toEqual({
      type: 'message_end',
      sessionId: 'session-1',
      messageId: 'message-1',
      message: {
        role: 'user',
        content: [{ type: 'text', text: '/skill' }],
        timestamp: 100
      }
    })
  })
})

describe('createPiAgentSessionFactory', () => {
  it('normalizes Workspace Tool names for providers with strict tool-name validation', () => {
    expect(toPiToolName('workspace.getStatus')).toBe('workspace_getStatus_0')
    expect(toPiToolName('workspace.update-project', 1)).toBe('workspace_update-project_1')
    expect(toPiToolName('workspace tool', 2)).toBe('workspace_tool_2')
  })

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
        expect(session.thinkingLevel).toBe('off')
        expect(session.sessionFile).toContain(join(tempDir, 'agent', 'sessions'))
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('loads skill metadata from the configured skill paths', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-skills-'))
    const skillDir = join(tempDir, 'skills', 'code-review')

    try {
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        `---\nname: code-review\ndescription: Review code changes for correctness and regressions.\n---\n\n# Code Review\n\nReview the change.\n`
      )

      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })
      const session = await createPiSession({
        sessionId: 'session-1',
        projectId: 'project-1',
        cwd: tempDir,
        skillPaths: [{ path: join(tempDir, 'skills'), scope: 'spacezero' }]
      })

      try {
        expect(session.skills).toEqual([
          {
            name: 'code-review',
            description: 'Review code changes for correctness and regressions.',
            scope: 'spacezero'
          }
        ])
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('lists discovered skills with their source paths for global settings', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-skill-list-'))
    const skillDir = join(tempDir, 'skills', 'code-review')
    const skillPath = join(skillDir, 'SKILL.md')

    try {
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(
        skillPath,
        `---\nname: code-review\ndescription: Review code changes.\n---\n\n# Code Review\n`
      )

      const runtime = createPiAgentRuntime({ agentDir: join(tempDir, 'agent') })

      await expect(
        runtime.listSkills([{ path: join(tempDir, 'skills'), scope: 'spacezero' }])
      ).resolves.toEqual([
        {
          name: 'code-review',
          description: 'Review code changes.',
          scope: 'spacezero',
          path: skillPath
        }
      ])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('reports malformed and colliding skill diagnostics', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-skill-diagnostics-'))
    const firstRoot = join(tempDir, 'first')
    const secondRoot = join(tempDir, 'second')
    const malformedSkillPath = join(firstRoot, 'malformed', 'SKILL.md')

    try {
      mkdirSync(join(firstRoot, 'review'), { recursive: true })
      mkdirSync(join(secondRoot, 'review'), { recursive: true })
      mkdirSync(join(firstRoot, 'malformed'), { recursive: true })
      writeFileSync(
        join(firstRoot, 'review', 'SKILL.md'),
        `---\nname: review\ndescription: Review from the first source.\n---\n\n# Review\n`
      )
      writeFileSync(
        join(secondRoot, 'review', 'SKILL.md'),
        `---\nname: review\ndescription: Review from the second source.\n---\n\n# Review\n`
      )
      writeFileSync(malformedSkillPath, `---\nname: malformed\n---\n\n# Missing description\n`)
      const diagnostics: ResourceDiagnostic[] = []
      const runtime = createPiAgentRuntime({
        agentDir: join(tempDir, 'agent'),
        onSkillDiagnostics: (entries) => diagnostics.push(...entries)
      })

      await runtime.listSkills([
        { path: firstRoot, scope: 'spacezero' },
        { path: secondRoot, scope: 'user' }
      ])

      expect(diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'warning', path: malformedSkillPath }),
          expect.objectContaining({
            type: 'collision',
            collision: expect.objectContaining({ resourceType: 'skill', name: 'review' })
          })
        ])
      )
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('does not load disabled global skills into the Pi session', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-disabled-skill-'))
    const skillsRoot = join(tempDir, 'skills')
    const disabledSkillPath = join(skillsRoot, 'code-review', 'SKILL.md')
    const enabledSkillPath = join(skillsRoot, 'debug', 'SKILL.md')

    try {
      mkdirSync(join(skillsRoot, 'code-review'), { recursive: true })
      mkdirSync(join(skillsRoot, 'debug'), { recursive: true })
      writeFileSync(
        disabledSkillPath,
        `---\nname: code-review\ndescription: Review code changes.\n---\n\n# Code Review\n`
      )
      writeFileSync(
        enabledSkillPath,
        `---\nname: debug\ndescription: Investigate behavior.\n---\n\n# Debug\n`
      )

      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })
      const session = await createPiSession({
        sessionId: 'session-1',
        projectId: 'project-1',
        cwd: tempDir,
        skillPaths: [{ path: skillsRoot, scope: 'spacezero' }],
        disabledGlobalSkillPaths: [disabledSkillPath]
      })

      try {
        expect(session.skills).toEqual([
          { name: 'debug', description: 'Investigate behavior.', scope: 'spacezero' }
        ])
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps expanded skill instructions inside Pi while restoring a safe display command', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-skill-command-'))
    const skillDir = join(tempDir, 'skills', 'code-review')
    const skillPath = join(skillDir, 'SKILL.md')

    try {
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(
        skillPath,
        `---\nname: code-review\ndescription: Review code changes.\n---\n\n# Code Review\n\nReview the change.\n`
      )

      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })
      const sessionRequest = {
        sessionId: 'session-1',
        projectId: 'project-1',
        cwd: tempDir,
        skillPaths: [{ path: join(tempDir, 'skills'), scope: 'spacezero' as const }]
      }
      const session = await createPiSession(sessionRequest)
      let transcriptPath: string | undefined

      try {
        await session.prompt('/skill:code-review inspect privacy')

        const snapshot = session.getTranscriptSnapshot()
        expect(snapshot[0]).toEqual(
          expect.objectContaining({
            role: 'user',
            content: [{ type: 'text', text: '/skill:code-review inspect privacy' }]
          })
        )
        expect(JSON.stringify(snapshot)).not.toContain(skillPath)
        expect(JSON.stringify(snapshot)).not.toContain('Review the change.')

        transcriptPath = session.sessionFile
        expect(readFileSync(transcriptPath!, 'utf8')).toContain(skillPath)
        expect(readFileSync(transcriptPath!, 'utf8')).toContain('Review the change.')
      } finally {
        session.dispose()
      }

      if (!transcriptPath) throw new Error('Expected Pi to persist the transcript')
      const restoredSession = await createPiSession({ ...sessionRequest, transcriptPath })

      try {
        const restoredSnapshot = restoredSession.getTranscriptSnapshot()
        expect(restoredSnapshot[0]).toEqual(
          expect.objectContaining({
            role: 'user',
            content: [{ type: 'text', text: '/skill:code-review inspect privacy' }]
          })
        )
        expect(JSON.stringify(restoredSnapshot)).not.toContain(skillPath)
        expect(JSON.stringify(restoredSnapshot)).not.toContain('Review the change.')
      } finally {
        restoredSession.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('fails closed when an expanded skill body contains a closing skill delimiter', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-skill-delimiter-'))
    const skillDir = join(tempDir, 'skills', 'code-review')
    const privateInstructions = 'PRIVATE INSTRUCTIONS AFTER EMBEDDED DELIMITER'

    try {
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        `---\nname: code-review\ndescription: Review code changes.\n---\n\n# Code Review\n\nExample markup:\n\n</skill>\n\n${privateInstructions}\n`
      )

      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })
      const session = await createPiSession({
        sessionId: 'session-1',
        projectId: 'project-1',
        cwd: tempDir,
        skillPaths: [{ path: join(tempDir, 'skills'), scope: 'spacezero' }]
      })

      try {
        await session.prompt('/skill:code-review inspect privacy')

        const snapshot = session.getTranscriptSnapshot()
        expect(snapshot[0]).toEqual(
          expect.objectContaining({
            role: 'user',
            content: [{ type: 'text', text: '/skill:code-review' }]
          })
        )
        expect(JSON.stringify(snapshot)).not.toContain(privateInstructions)
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps malformed but loadable skill expansions private before and after restore', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-malformed-skill-'))
    const skillDir = join(tempDir, 'skills', 'review')
    const skillPath = join(skillDir, 'SKILL.md')
    const privateInstructions = 'PRIVATE MALFORMED SKILL BODY'

    try {
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(
        skillPath,
        `---\nname: 'review"private'\ndescription: Malformed but loadable skill.\n---\n\n${privateInstructions}\n`
      )

      const createPiSession = createPiAgentSessionFactory({
        agentDir: join(tempDir, 'agent'),
        onSkillDiagnostics: () => undefined
      })
      const sessionRequest = {
        sessionId: 'session-1',
        projectId: 'project-1',
        cwd: tempDir,
        skillPaths: [{ path: join(tempDir, 'skills'), scope: 'spacezero' as const }]
      }
      const session = await createPiSession(sessionRequest)
      let transcriptPath: string | undefined

      try {
        await session.prompt('/skill:review"private')

        const snapshot = session.getTranscriptSnapshot()
        expect(snapshot[0]).toEqual(
          expect.objectContaining({
            role: 'user',
            content: [{ type: 'text', text: '/skill' }]
          })
        )
        expect(JSON.stringify(snapshot)).not.toContain(skillPath)
        expect(JSON.stringify(snapshot)).not.toContain(privateInstructions)
        transcriptPath = session.sessionFile
      } finally {
        session.dispose()
      }

      if (!transcriptPath) throw new Error('Expected Pi to persist the transcript')
      const restoredSession = await createPiSession({ ...sessionRequest, transcriptPath })

      try {
        const restoredSnapshot = restoredSession.getTranscriptSnapshot()
        expect(restoredSnapshot[0]).toEqual(
          expect.objectContaining({
            role: 'user',
            content: [{ type: 'text', text: '/skill' }]
          })
        )
        expect(JSON.stringify(restoredSnapshot)).not.toContain(skillPath)
        expect(JSON.stringify(restoredSnapshot)).not.toContain(privateInstructions)
      } finally {
        restoredSession.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('uses the requested default thinking level when creating a new session', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-thinking-'))

    try {
      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })

      const session = await createPiSession({
        sessionId: 'session-1',
        projectId: 'project-1',
        cwd: tempDir,
        thinkingLevel: 'high'
      })

      try {
        expect(session.thinkingLevel).toBe('high')
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps Space Zero session model selection isolated from the terminal Pi config', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-isolation-'))
    const terminalPiAgentDir = join(tempDir, 'terminal-pi-agent')
    const previousPiAgentDir = process.env.PI_CODING_AGENT_DIR

    try {
      process.env.PI_CODING_AGENT_DIR = terminalPiAgentDir
      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'spacezero-agent') })

      const session = await createPiSession({
        sessionId: 'session-1',
        projectId: 'project-1',
        cwd: tempDir
      })

      try {
        await session.setModel({ provider: 'faux', modelId: 'faux-1' })
      } finally {
        session.dispose()
      }

      expect(existsSync(join(terminalPiAgentDir, 'settings.json'))).toBe(false)
    } finally {
      if (previousPiAgentDir === undefined) {
        delete process.env.PI_CODING_AGENT_DIR
      } else {
        process.env.PI_CODING_AGENT_DIR = previousPiAgentDir
      }
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

describe('createPiAgentRuntime auth', () => {
  it('reports OAuth credentials as configured and logout clears them without exposing tokens', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-oauth-'))
    const agentDir = join(tempDir, 'agent')

    try {
      mkdirSync(agentDir, { recursive: true })
      writeFileSync(
        join(agentDir, 'auth.json'),
        JSON.stringify({
          anthropic: { type: 'oauth', access: 'access-token', refresh: 'refresh-token', expires: Date.now() + 60_000 },
          'openai-codex': { type: 'oauth', access: 'openai-access-token', refresh: 'openai-refresh-token', expires: Date.now() + 60_000 }
        }),
        { mode: 0o600 }
      )
      const runtime = createPiAgentRuntime({ agentDir })

      const status = await runtime.getAuthStatus()
      expect(status.subscriptions.connected).toContainEqual(
        expect.objectContaining({
          providerId: 'anthropic',
          configured: true,
          removable: true,
          displayLabel: undefined
        })
      )
      expect(status.apiKeys.configured).not.toContainEqual(
        expect.objectContaining({ providerId: 'openai-codex' })
      )
      expect(JSON.stringify(status)).not.toContain('access-token')
      expect(JSON.stringify(status)).not.toContain('refresh-token')

      await runtime.logoutOAuth('anthropic')
      expect((await runtime.getAuthStatus()).subscriptions.connected).not.toContainEqual(
        expect.objectContaining({ providerId: 'anthropic' })
      )
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('derives API-key and subscription provider options from Pi runtime metadata', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-provider-options-'))
    const agentDir = join(tempDir, 'agent')

    try {
      mkdirSync(agentDir, { recursive: true })
      writeFileSync(
        join(agentDir, 'models.json'),
        JSON.stringify({
          providers: {
            'acme-ai': {
              name: 'Acme AI',
              baseUrl: 'https://models.example.test/v1',
              api: 'openai-responses',
              apiKey: '$ACME_API_KEY',
              models: [{ id: 'acme-1', name: 'Acme 1' }]
            }
          }
        })
      )

      const runtime = createPiAgentRuntime({ agentDir })
      const status = await runtime.getAuthStatus()

      expect(status.apiKeys.availableProviders).toContainEqual(
        expect.objectContaining({ providerId: 'acme-ai' })
      )
      expect(status.subscriptions.availableProviders).toContainEqual(
        expect.objectContaining({
          providerId: 'openai-codex',
          label: 'ChatGPT Plus/Pro (Codex Subscription)'
        })
      )
      expect(status.subscriptions.availableProviders).not.toContainEqual(
        expect.objectContaining({ providerId: 'github-copilot' })
      )
      await expect(runtime.loginOAuth('github-copilot', {
        openExternal: async () => undefined,
        waitForCallback: async () => ''
      })).rejects.toThrow('agent.unknownOAuthProvider')
      await expect(runtime.addApiKey('acme-ai', 'sk-acme-secret')).resolves.toBeUndefined()
      expect(JSON.stringify(await runtime.getAuthStatus())).not.toContain('sk-acme-secret')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('persists API-key auth under the Space Zero agent dir with 0600 permissions and returns sanitized status', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-auth-'))
    const agentDir = join(tempDir, 'agent')

    try {
      const runtime = createPiAgentRuntime({ agentDir })

      await expect(runtime.getAuthStatus()).resolves.toMatchObject({ apiKeys: { configured: [] } })
      await expect(runtime.getAvailableModels()).resolves.toEqual([])

      await runtime.addApiKey('anthropic', 'sk-secret')

      const authStatus = await runtime.getAuthStatus()
      expect(authStatus.apiKeys.configured).toContainEqual(
        expect.objectContaining({ providerId: 'anthropic', configured: true, source: 'stored', removable: true })
      )
      expect(JSON.stringify(authStatus)).not.toContain('sk-secret')
      expect(statSync(join(agentDir, 'auth.json')).mode & 0o777).toBe(0o600)
      await expect(runtime.testAuth('anthropic')).resolves.toEqual({ ok: true })

      const availableModels = await runtime.getAvailableModels()
      expect(availableModels.every((model) => model.providerId === 'anthropic')).toBe(true)
      const [anthropicModel] = availableModels.filter((model) => model.providerId === 'anthropic')
      expect(anthropicModel).toBeDefined()

      const session = await runtime.createSession({
        sessionId: 'session-anthropic',
        projectId: 'project-1',
        cwd: tempDir,
        defaultModel: { providerId: anthropicModel!.providerId, modelId: anthropicModel!.modelId },
        thinkingLevel: 'high'
      })
      try {
        expect(session.modelProvider).toBe('anthropic')
        expect(session.modelId).toBe(anthropicModel!.modelId)
        expect(session.thinkingLevel).toBe('high')
        await expect(session.setModel({ provider: 'openai', modelId: 'gpt-5' })).rejects.toThrow(
          'agent.modelAuthNotConfigured'
        )
        await session.setThinkingLevel('low')
        expect(session.thinkingLevel).toBe('low')
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
