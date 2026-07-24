import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ResourceDiagnostic } from '@earendil-works/pi-coding-agent'
import { fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux'
import { describe, expect, it } from 'vitest'

import type { AgentTranscriptMessage } from '../shared/agent-session-projection.model'
import { AgentSessionRegistry } from './agent-session-registry'
import {
  createPiAgentRuntime,
  createPiAgentSessionFactory,
  toAgentStreamingEvent,
  toPiToolName
} from './pi-agent-session-factory'

type ToolResultSnapshot = Extract<AgentTranscriptMessage, { role: 'toolResult' }>

function findToolResult(
  transcript: AgentTranscriptMessage[],
  toolName: string
): ToolResultSnapshot | undefined {
  return transcript.find(
    (message): message is ToolResultSnapshot =>
      message.role === 'toolResult' && message.toolName === toolName
  )
}

function readToolResultText(toolResult: ToolResultSnapshot | undefined): string | undefined {
  return toolResult?.content.find((part) => part.type === 'text')?.text
}

function readToolResultDetails(toolResult: ToolResultSnapshot | undefined): {
  status: string
  output: string
  parentSessionId: string
  childSessionId?: string
  transcriptPath?: string
} {
  return toolResult?.details as {
    status: string
    output: string
    parentSessionId: string
    childSessionId?: string
    transcriptPath?: string
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

async function waitForAbortOrRelease(signal: AbortSignal | undefined, release: Promise<void>) {
  if (signal?.aborted) return
  await Promise.race([
    release,
    new Promise<void>((resolve) =>
      signal?.addEventListener('abort', () => resolve(), { once: true })
    )
  ])
}

async function expectSettled<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out waiting for ${message}`)), 2_000)
    )
  ])
}

describe('toAgentStreamingEvent', () => {
  it('keeps internal Knowledge Base hints out of displayed user transcripts', () => {
    const event = toAgentStreamingEvent('session-1', {
      type: 'message_start',
      message: {
        id: 'message-1',
        role: 'user',
        content:
          'Read @kb/notes.md\n\n<spacezero-knowledge-base-path-hints>\ninternal path\n</spacezero-knowledge-base-path-hints>',
        timestamp: 100
      }
    })

    expect(event).toMatchObject({
      type: 'message_start',
      message: { role: 'user', content: 'Read @kb/notes.md' }
    })
  })

  it('preserves mention-like delimiters in untrusted tool output', () => {
    const content =
      'File contents before\n\n<spacezero-knowledge-base-path-hints>\nuntrusted repository text\n</spacezero-knowledge-base-path-hints>\nFile contents after'
    const event = toAgentStreamingEvent('session-1', {
      type: 'message_start',
      message: {
        role: 'toolResult',
        toolCallId: 'tool-call-1',
        toolName: 'read',
        content,
        isError: false,
        timestamp: 100
      }
    })

    expect(event).toMatchObject({
      type: 'message_start',
      message: {
        role: 'toolResult',
        content: [{ type: 'text', text: content }]
      }
    })
  })

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

  it('appends project Knowledge Base guidance to the Pi system prompt', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-knowledge-'))

    try {
      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })
      const session = await createPiSession({
        sessionId: 'session-knowledge',
        kind: 'project',
        projectId: 'project-1',
        cwd: tempDir,
        appendSystemPrompt: ['Project Knowledge Base: /knowledge/projects/space-zero']
      })

      try {
        expect(session.systemPrompt).toContain(
          'Project Knowledge Base: /knowledge/projects/space-zero'
        )
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('preserves linked source context in the final Pi prompt after suspension and rehydration', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-source-context-'))
    const sourceContext = 'Linked GitHub Issue #97: preserve this context.'
    const observedSystemPrompts: string[] = []
    const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      createPiSession: async (request) => {
        const session = await createPiSession(request)
        if (request.sessionId === 'session-linked') {
          observedSystemPrompts.push(session.systemPrompt ?? '')
        }
        return session
      }
    })

    try {
      await registry.createSession({
        sessionId: 'session-linked',
        projectId: 'project-1',
        cwd: tempDir,
        systemPromptContext: sourceContext
      })
      await registry.createSession({
        sessionId: 'session-replacement',
        projectId: 'project-1',
        cwd: tempDir
      })
      await registry.getState({ sessionId: 'session-linked' })

      expect(observedSystemPrompts).toHaveLength(2)
      expect(observedSystemPrompts.every((prompt) => prompt.includes(sourceContext))).toBe(true)
    } finally {
      registry.dispose()
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

  it('applies a resolved Agent Definition body, model, thinking level, and display state at creation', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-definition-'))

    try {
      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })

      const session = await createPiSession({
        sessionId: 'session-definition',
        projectId: 'project-1',
        cwd: tempDir,
        defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
        thinkingLevel: 'medium',
        agentDefinition: {
          id: 'reviewer',
          name: 'Reviewer',
          body: 'You are a careful code reviewer.',
          model: { providerId: 'faux', modelId: 'faux-1' },
          thinkingLevel: 'high'
        }
      })

      try {
        expect(session.systemPrompt).toContain('You are a careful code reviewer.')
        expect(session.modelProvider).toBe('faux')
        expect(session.modelId).toBe('faux-1')
        expect(session.thinkingLevel).toBe('high')
        expect(session.agentDefinition).toEqual({ id: 'reviewer', name: 'Reviewer' })

        await session.setThinkingLevel('low')
        expect(session.thinkingLevel).toBe('low')
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('falls back to requested defaults when a resolved Agent Definition omits model and thinking', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-definition-defaults-'))

    try {
      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })

      const session = await createPiSession({
        sessionId: 'session-definition-defaults',
        projectId: 'project-1',
        cwd: tempDir,
        defaultModel: { providerId: 'faux', modelId: 'faux-1' },
        thinkingLevel: 'medium',
        agentDefinition: {
          id: 'scout',
          name: 'Scout',
          body: 'Scout the codebase.'
        }
      })

      try {
        expect(session.modelProvider).toBe('faux')
        expect(session.modelId).toBe('faux-1')
        expect(session.thinkingLevel).toBe('medium')
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('intersects Agent Definition tools with project and Workspace Tool defaults', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-definition-tools-'))

    try {
      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })

      const session = await createPiSession({
        sessionId: 'session-definition-tools',
        projectId: 'project-1',
        cwd: tempDir,
        workspaceTools: [
          {
            name: 'workspace.getStatus',
            description: 'Read workspace status',
            safetyLevel: 'read',
            kind: 'app-state',
            domain: 'workspace',
            parameters: { type: 'object', properties: {} }
          },
          {
            name: 'knowledgeBase.saveDocument',
            description: 'Save a document',
            safetyLevel: 'write',
            kind: 'app-state',
            domain: 'knowledge-base',
            parameters: { type: 'object', properties: {} }
          }
        ],
        agentDefinition: {
          id: 'read-only',
          name: 'Read Only',
          body: 'Read only.',
          tools: ['read', 'grep', 'workspace.getStatus', 'missing.tool']
        }
      })

      try {
        expect(session.toolNames).toEqual(['read', 'grep', 'workspace_getStatus_0'])
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('fails session creation when an Agent Definition tool allowlist has no effective tools', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-definition-empty-tools-'))

    try {
      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })

      await expect(
        createPiSession({
          sessionId: 'session-definition-empty-tools',
          kind: 'workspace',
          projectId: null,
          cwd: tempDir,
          agentDefinition: {
            id: 'empty',
            name: 'Empty',
            body: 'No tools.',
            tools: ['bash']
          }
        })
      ).rejects.toThrow('agentDefinition.emptyToolAllowlist')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('fails session creation when an Agent Definition selects an unauthenticated model', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-definition-auth-'))

    try {
      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })

      await expect(
        createPiSession({
          sessionId: 'session-definition-auth',
          projectId: 'project-1',
          cwd: tempDir,
          defaultModel: { providerId: 'faux', modelId: 'faux-1' },
          agentDefinition: {
            id: 'needs-auth',
            name: 'Needs Auth',
            body: 'Use a real model.',
            model: { providerId: 'openai', modelId: 'gpt-5' }
          }
        })
      ).rejects.toThrow('agent.modelAuthNotConfigured')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('registers agents.delegate only when visible Agent Definitions are provided and appends their catalog', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-delegate-catalog-'))

    try {
      const createPiSession = createPiAgentSessionFactory({ agentDir: join(tempDir, 'agent') })
      const sessionWithoutDefinitions = await createPiSession({
        sessionId: 'session-no-delegation',
        projectId: 'project-1',
        cwd: tempDir
      })
      const sessionWithDefinitions = await createPiSession({
        sessionId: 'session-with-delegation',
        projectId: 'project-1',
        cwd: tempDir,
        delegationDefinitions: [
          {
            id: 'scout',
            name: 'Scout',
            description: 'Researches the codebase without editing files.',
            body: 'You inspect code.'
          }
        ]
      })

      try {
        expect(sessionWithoutDefinitions.toolNames).not.toContain('agents_delegate_0')
        expect(sessionWithoutDefinitions.systemPrompt).not.toContain(
          'Available Agent Definitions for agents.delegate'
        )
        expect(sessionWithDefinitions.toolNames).toContain('agents_delegate_0')
        expect(sessionWithDefinitions.systemPrompt).toContain(
          'Available Agent Definitions for agents.delegate'
        )
        expect(sessionWithDefinitions.systemPrompt).toContain(
          'scout: Scout — Researches the codebase without editing files.'
        )
      } finally {
        sessionWithoutDefinitions.dispose()
        sessionWithDefinitions.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('runs agents.delegate end-to-end with a fresh faux child session and structured result', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-delegate-e2e-'))

    try {
      const childSystemPrompts: string[] = []
      const childToolNames: string[][] = []
      const childMessageCounts: number[] = []
      const createPiSession = createPiAgentSessionFactory({
        agentDir: join(tempDir, 'agent'),
        configureFauxProvider: (faux) => {
          faux.setResponses([
            fauxAssistantMessage(
              [
                fauxToolCall('agents_delegate_0', {
                  definition: 'scout',
                  task: 'Inspect the repository.'
                })
              ],
              { stopReason: 'toolUse' }
            ),
            (context) => {
              childSystemPrompts.push(context.systemPrompt ?? '')
              childToolNames.push((context.tools ?? []).map((tool) => tool.name))
              childMessageCounts.push(context.messages.length)
              return fauxAssistantMessage([fauxText('Child final report.')])
            },
            fauxAssistantMessage([fauxText('Parent received the child result.')])
          ])
        }
      })

      const session = await createPiSession({
        sessionId: 'parent-session',
        projectId: 'project-1',
        cwd: tempDir,
        delegationDefinitions: [
          {
            id: 'scout',
            name: 'Scout',
            description: 'Researches the codebase without editing files.',
            body: 'You inspect code.',
            tools: ['read', 'grep']
          }
        ]
      })

      try {
        await session.prompt('Delegate this inspection.')

        const snapshot = session.getTranscriptSnapshot()
        expect(JSON.stringify(snapshot)).toContain('agents_delegate_0')
        const toolResult = findToolResult(snapshot, 'agents_delegate_0')
        expect(toolResult).toBeDefined()
        expect(readToolResultText(toolResult)).toBe(
          JSON.stringify({ status: 'completed', output: 'Child final report.' })
        )
        const details = readToolResultDetails(toolResult)
        expect(details).toMatchObject({
          status: 'completed',
          output: 'Child final report.',
          parentSessionId: 'parent-session',
          childSessionId: expect.stringMatching(/^subagent-/),
          transcriptPath: expect.stringContaining(join(tempDir, 'agent', 'sessions'))
        })
        expect(details.transcriptPath).toBeDefined()
        expect(readFileSync(details.transcriptPath!, 'utf8')).toContain(
          '"parentSession":"parent-session"'
        )
        expect(readFileSync(details.transcriptPath!, 'utf8')).toContain(
          '"customType":"spacezero.subagentRun"'
        )
        expect(childSystemPrompts).toEqual([
          expect.stringContaining(
            'You start with a fresh conversation and do not have the parent transcript.'
          )
        ])
        expect(childToolNames).toEqual([expect.arrayContaining(['read', 'grep'])])
        expect(childToolNames[0]).not.toContain('agents_delegate_0')
        expect(childMessageCounts).toEqual([1])
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('returns structured delegation errors for unknown definitions, unauthenticated models, malformed definitions, and empty child tool allowlists', async () => {
    const cases = [
      {
        name: 'unknown-definition',
        kind: undefined,
        definition: 'missing',
        task: 'Run missing agent.',
        definitions: [
          {
            id: 'scout',
            name: 'Scout',
            description: 'Researches the codebase.',
            body: 'Scout.'
          }
        ],
        expectedOutput: 'Unknown Agent Definition: missing'
      },
      {
        name: 'unauthenticated-model',
        kind: undefined,
        definition: 'needs-auth',
        task: 'Use a model without auth.',
        definitions: [
          {
            id: 'needs-auth',
            name: 'Needs Auth',
            description: 'Requires a configured model.',
            body: 'Use a real model.',
            model: { providerId: 'openai', modelId: 'gpt-5' }
          }
        ],
        expectedOutput: 'agent.modelAuthNotConfigured'
      },
      {
        name: 'malformed-definition',
        kind: undefined,
        definition: 'bad-model',
        task: 'Run malformed definition.',
        definitions: [
          {
            id: 'bad-model',
            name: 'Bad Model',
            description: 'Has malformed model frontmatter.',
            body: 'Bad model.',
            resolutionError: 'agentDefinitions.invalidModel'
          }
        ],
        expectedOutput:
          'Agent Definition bad-model cannot be delegated: agentDefinitions.invalidModel'
      },
      {
        name: 'empty-allowlist',
        kind: 'workspace' as const,
        definition: 'empty-tools',
        task: 'Run with no effective tools.',
        definitions: [
          {
            id: 'empty-tools',
            name: 'Empty Tools',
            description: 'Has no effective workspace tools.',
            body: 'No tools.',
            tools: ['bash']
          }
        ],
        expectedOutput: 'agentDefinition.emptyToolAllowlist'
      }
    ]

    for (const testCase of cases) {
      const tempDir = mkdtempSync(join(tmpdir(), `spacezero-agent-delegate-${testCase.name}-`))

      try {
        const createPiSession = createPiAgentSessionFactory({
          agentDir: join(tempDir, 'agent'),
          configureFauxProvider: (faux) => {
            faux.setResponses([
              fauxAssistantMessage(
                [
                  fauxToolCall('agents_delegate_0', {
                    definition: testCase.definition,
                    task: testCase.task
                  })
                ],
                {
                  stopReason: 'toolUse'
                }
              ),
              fauxAssistantMessage([fauxText('Parent handled the error.')])
            ])
          }
        })
        const session = await createPiSession({
          sessionId: `parent-${testCase.name}`,
          kind: testCase.kind,
          projectId: testCase.kind === 'workspace' ? null : 'project-1',
          cwd: tempDir,
          delegationDefinitions: testCase.definitions
        })

        try {
          await session.prompt('Try delegation.')
          const toolResult = findToolResult(session.getTranscriptSnapshot(), 'agents_delegate_0')
          expect(readToolResultText(toolResult)).toBe(
            JSON.stringify({ status: 'error', output: testCase.expectedOutput })
          )
          expect(toolResult?.details).toMatchObject({
            status: 'error',
            output: testCase.expectedOutput,
            parentSessionId: `parent-${testCase.name}`
          })
        } finally {
          session.dispose()
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    }
  })

  it('returns a structured delegation error when the child ends with a provider error', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-delegate-provider-error-'))

    try {
      const createPiSession = createPiAgentSessionFactory({
        agentDir: join(tempDir, 'agent'),
        configureFauxProvider: (faux) => {
          faux.setResponses([
            fauxAssistantMessage(
              [
                fauxToolCall('agents_delegate_0', {
                  definition: 'scout',
                  task: 'Trigger provider failure.'
                })
              ],
              { stopReason: 'toolUse' }
            ),
            fauxAssistantMessage([], {
              stopReason: 'error',
              errorMessage: 'Provider quota exceeded.'
            }),
            fauxAssistantMessage([fauxText('Parent handled the child provider error.')])
          ])
        }
      })
      const session = await createPiSession({
        sessionId: 'parent-provider-error',
        projectId: 'project-1',
        cwd: tempDir,
        delegationDefinitions: [
          {
            id: 'scout',
            name: 'Scout',
            description: 'Researches the codebase.',
            body: 'Scout.'
          }
        ]
      })

      try {
        await session.prompt('Delegate to scout.')
        const toolResult = findToolResult(session.getTranscriptSnapshot(), 'agents_delegate_0')
        expect(readToolResultText(toolResult)).toBe(
          JSON.stringify({ status: 'error', output: 'Provider quota exceeded.' })
        )
        expect(toolResult?.details).toMatchObject({
          status: 'error',
          output: 'Provider quota exceeded.',
          parentSessionId: 'parent-provider-error',
          childSessionId: expect.stringMatching(/^subagent-/)
        })
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('aborts an in-flight delegated child when the parent session is aborted and returns a structured aborted result', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-delegate-parent-abort-'))

    try {
      const childStarted = createDeferred<AbortSignal | undefined>()
      const releaseChild = createDeferred<void>()
      const createPiSession = createPiAgentSessionFactory({
        agentDir: join(tempDir, 'agent'),
        configureFauxProvider: (faux) => {
          faux.setResponses([
            fauxAssistantMessage(
              [
                fauxToolCall('agents_delegate_0', {
                  definition: 'scout',
                  task: 'Wait for parent abort.'
                })
              ],
              { stopReason: 'toolUse' }
            ),
            async (_context, options) => {
              childStarted.resolve(options?.signal)
              await waitForAbortOrRelease(options?.signal, releaseChild.promise)
              return fauxAssistantMessage([
                fauxText('Child should not complete after parent abort.')
              ])
            },
            fauxAssistantMessage([fauxText('Parent observed aborted child.')])
          ])
        }
      })
      const session = await createPiSession({
        sessionId: 'parent-abort-cascade',
        projectId: 'project-1',
        cwd: tempDir,
        delegationDefinitions: [
          {
            id: 'scout',
            name: 'Scout',
            description: 'Researches the codebase.',
            body: 'Scout.'
          }
        ]
      })

      try {
        const promptPromise = session.prompt('Delegate then abort.')
        const childSignal = await expectSettled(childStarted.promise, 'delegated child to start')

        await session.abort()
        expect(childSignal?.aborted).toBe(true)
        releaseChild.resolve()
        await expectSettled(promptPromise, 'parent prompt to settle after abort cascade')

        const toolResult = findToolResult(session.getTranscriptSnapshot(), 'agents_delegate_0')
        expect(readToolResultText(toolResult)).toBe(
          JSON.stringify({ status: 'aborted', output: '' })
        )
        expect(toolResult?.isError).toBe(false)
        expect(toolResult?.details).toMatchObject({
          status: 'aborted',
          output: '',
          parentSessionId: 'parent-abort-cascade',
          childSessionId: expect.stringMatching(/^subagent-/)
        })
      } finally {
        session.dispose()
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('disposes an in-flight delegated child when the parent session is deleted from the registry', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-delegate-parent-delete-'))

    try {
      const childStarted = createDeferred<AbortSignal | undefined>()
      const releaseChild = createDeferred<void>()
      const createPiSession = createPiAgentSessionFactory({
        agentDir: join(tempDir, 'agent'),
        configureFauxProvider: (faux) => {
          faux.setResponses([
            fauxAssistantMessage(
              [
                fauxToolCall('agents_delegate_0', {
                  definition: 'scout',
                  task: 'Wait for parent deletion.'
                })
              ],
              { stopReason: 'toolUse' }
            ),
            async (_context, options) => {
              childStarted.resolve(options?.signal)
              await waitForAbortOrRelease(options?.signal, releaseChild.promise)
              return fauxAssistantMessage([
                fauxText('Child should not complete after parent delete.')
              ])
            }
          ])
        }
      })
      const registry = new AgentSessionRegistry({ createPiSession })
      await registry.createSession({
        sessionId: 'parent-delete-cascade',
        projectId: 'project-1',
        cwd: tempDir,
        delegationDefinitions: [
          {
            id: 'scout',
            name: 'Scout',
            description: 'Researches the codebase.',
            body: 'Scout.'
          }
        ]
      })

      const promptPromise = registry.prompt({
        sessionId: 'parent-delete-cascade',
        message: 'Delegate then delete.'
      })
      const childSignal = await expectSettled(childStarted.promise, 'delegated child to start')

      await registry.deleteSession({ sessionId: 'parent-delete-cascade' })
      expect(childSignal?.aborted).toBe(true)
      releaseChild.resolve()
      await expectSettled(promptPromise, 'parent prompt to settle after delete cascade')
      await expect(registry.listSessions()).resolves.toEqual([])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('fails child write Workspace Tool calls immediately instead of waiting for invisible confirmation', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'spacezero-agent-delegate-child-confirmation-'))
    let workspaceToolRequestParentSessionId: string | undefined

    try {
      const createPiSession = createPiAgentSessionFactory({
        agentDir: join(tempDir, 'agent'),
        executeWorkspaceTool: async (request) => {
          workspaceToolRequestParentSessionId = request.parentSessionId
          return {
            ok: false,
            error: {
              code: 'workspace-tool-confirmation-unsupported-in-child',
              message: `Workspace Tool confirmation is not supported for delegated child sessions: ${request.toolName}`
            }
          }
        },
        configureFauxProvider: (faux) => {
          faux.setResponses([
            fauxAssistantMessage(
              [
                fauxToolCall('agents_delegate_0', {
                  definition: 'writer',
                  task: 'Save a workspace note.'
                })
              ],
              { stopReason: 'toolUse' }
            ),
            fauxAssistantMessage([fauxToolCall('workspace_setNote_0', { note: 'child write' })], {
              stopReason: 'toolUse'
            }),
            fauxAssistantMessage([fauxText('Child saw the Workspace Tool failure.')]),
            fauxAssistantMessage([fauxText('Parent received the child result.')])
          ])
        }
      })
      const session = await createPiSession({
        sessionId: 'parent-child-confirmation',
        projectId: 'project-1',
        cwd: tempDir,
        workspaceTools: [
          {
            name: 'workspace.setNote',
            description: 'Set workspace note',
            safetyLevel: 'write',
            kind: 'app-state',
            domain: 'workspace',
            parameters: {
              type: 'object',
              properties: { note: { type: 'string' } },
              required: ['note'],
              additionalProperties: false
            }
          }
        ],
        delegationDefinitions: [
          {
            id: 'writer',
            name: 'Writer',
            description: 'Writes workspace notes.',
            body: 'Write notes.',
            tools: ['workspace.setNote']
          }
        ]
      })

      try {
        await session.prompt('Delegate writing.')
        expect(workspaceToolRequestParentSessionId).toBe('parent-child-confirmation')
        const delegateResult = findToolResult(session.getTranscriptSnapshot(), 'agents_delegate_0')
        const delegateDetails = readToolResultDetails(delegateResult)
        expect(delegateDetails.status).toBe('completed')
        expect(delegateDetails.transcriptPath).toBeDefined()
        const childTranscript = readFileSync(delegateDetails.transcriptPath!, 'utf8')
        expect(childTranscript).toContain('workspace-tool-confirmation-unsupported-in-child')
        expect(childTranscript).toContain(
          'Workspace Tool confirmation is not supported for delegated child sessions: workspace.setNote'
        )
      } finally {
        session.dispose()
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
      const createPiSession = createPiAgentSessionFactory({
        agentDir: join(tempDir, 'spacezero-agent')
      })

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
          anthropic: {
            type: 'oauth',
            access: 'access-token',
            refresh: 'refresh-token',
            expires: Date.now() + 60_000
          },
          'openai-codex': {
            type: 'oauth',
            access: 'openai-access-token',
            refresh: 'openai-refresh-token',
            expires: Date.now() + 60_000
          }
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
      await expect(
        runtime.loginOAuth('github-copilot', {
          openExternal: async () => undefined,
          waitForCallback: async () => ''
        })
      ).rejects.toThrow('agent.unknownOAuthProvider')
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
        expect.objectContaining({
          providerId: 'anthropic',
          configured: true,
          source: 'stored',
          removable: true
        })
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
