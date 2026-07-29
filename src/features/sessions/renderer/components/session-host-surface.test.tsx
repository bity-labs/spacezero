import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Project } from '../../../projects/shared'
import type { ProjectSession, WorkspaceSession } from '../../shared'
import type { AgentSessionProjectionEvent } from '../../../../shared/agent-session-projection.model'
import type { AgentSessionState } from '../../../../shared/agent-protocol'
import type { AgentToolExecutionEvent } from '../../../../shared/workspace-tool-protocol'
import { GitTool } from '../../../git/renderer/components/git-tool'
import { resetToolPaneStore, useToolPaneStore } from '../../../tool-pane/renderer'
import { ProjectSessionHostSurface, WorkspaceSessionHostSurface } from './session-host-surface'

const project: Project = {
  id: 'project-1',
  name: 'Space Zero',
  path: '/Users/tiby/ws/dev/spacezero',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

const session: ProjectSession = {
  id: 'session-1',
  kind: 'project',
  projectId: 'project-1',
  title: 'Session 1',
  status: 'idle',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

const workspaceSession: WorkspaceSession = {
  id: 'workspace-session-1',
  kind: 'workspace',
  title: 'Workspace Session',
  status: 'idle',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

beforeEach(() => {
  resetToolPaneStore()
})

describe('ProjectSessionHostSurface', () => {
  it('does not mount the owner agent or enable prompts while the current Chat Context is loading', async () => {
    const currentContext = deferred<{
      id: string
      workspaceContext: { kind: 'project-session'; projectSessionId: string }
      agentSessionId: string
      createdAt: string
      updatedAt: string
    }>()
    const getState = vi.fn(async ({ sessionId }) => ({
      sessionId,
      kind: 'project' as const,
      projectId: project.id,
      cwd: project.path,
      status: 'idle' as const,
      live: true,
      transcriptPath: `/tmp/${sessionId}.jsonl`,
      modelProvider: undefined,
      modelId: undefined,
      thinkingLevel: 'medium' as const
    }))
    const prompt = vi.fn(async () => undefined)
    window.spacezero.sessions.getCurrentProjectChatContext = vi.fn(() => currentContext.promise)
    window.spacezero.agent.getState = getState
    window.spacezero.agent.prompt = prompt

    render(<ProjectSessionHostSurface project={project} session={session} />)

    expect(screen.getByText('Restoring Project Session chat…')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Agent prompt' })).not.toBeInTheDocument()
    expect(getState).not.toHaveBeenCalled()
    expect(prompt).not.toHaveBeenCalled()

    currentContext.resolve({
      id: 'chat-context-2',
      workspaceContext: { kind: 'project-session', projectSessionId: session.id },
      agentSessionId: 'agent-session-2',
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString()
    })

    expect(await screen.findByRole('textbox', { name: 'Agent prompt' })).toBeInTheDocument()
    await waitFor(() => expect(getState).toHaveBeenCalledWith({ sessionId: 'agent-session-2' }))
    expect(getState).not.toHaveBeenCalledWith({ sessionId: session.id })
  })

  it('does not let an older deferred lookup overwrite a newer /clear result', async () => {
    const oldLookup = deferred<{
      id: string
      workspaceContext: { kind: 'project-session'; projectSessionId: string }
      agentSessionId: string
      createdAt: string
      updatedAt: string
    }>()
    const nextSession = { ...session, id: 'session-2', title: 'Session 2' }
    const ownerContext = {
      id: 'chat-context-owner',
      workspaceContext: {
        kind: 'project-session' as const,
        projectSessionId: nextSession.id
      },
      agentSessionId: nextSession.id,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    }
    const freshContext = {
      ...ownerContext,
      id: 'chat-context-fresh',
      agentSessionId: 'agent-session-fresh'
    }
    window.spacezero.sessions.getCurrentProjectChatContext = vi
      .fn()
      .mockImplementationOnce(() => oldLookup.promise)
      .mockResolvedValueOnce(ownerContext)
    window.spacezero.sessions.clearProjectChat = vi.fn(async () => freshContext)
    window.spacezero.agent.getState = vi.fn(async ({ sessionId }) => ({
      sessionId,
      kind: 'project' as const,
      projectId: project.id,
      cwd: project.path,
      status: 'idle' as const,
      live: true,
      transcriptPath: `/tmp/${sessionId}.jsonl`,
      modelProvider: undefined,
      modelId: undefined,
      thinkingLevel: 'medium' as const
    }))

    const { rerender } = render(<ProjectSessionHostSurface project={project} session={session} />)
    rerender(<ProjectSessionHostSurface project={project} session={nextSession} />)

    const input = await screen.findByRole('textbox', { name: 'Agent prompt' })
    await userEvent.type(input, '/clear{Enter}')
    await waitFor(() =>
      expect(window.spacezero.agent.getState).toHaveBeenCalledWith({
        sessionId: freshContext.agentSessionId
      })
    )

    oldLookup.resolve({
      id: 'stale-chat-context',
      workspaceContext: { kind: 'project-session', projectSessionId: session.id },
      agentSessionId: 'stale-agent-session',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    })
    await act(async () => undefined)

    expect(window.spacezero.agent.getState).not.toHaveBeenCalledWith({
      sessionId: 'stale-agent-session'
    })
    expect(screen.getByRole('textbox', { name: 'Agent prompt' })).toBeInTheDocument()
  })

  it('shows /clear and switches to a fresh Chat Context without changing stable Tool Pane state', async () => {
    const originalContext = {
      id: 'chat-context-1',
      workspaceContext: {
        kind: 'project-session' as const,
        projectSessionId: session.id
      },
      agentSessionId: session.id,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    }
    const freshContext = {
      ...originalContext,
      id: 'chat-context-2',
      agentSessionId: 'agent-session-2',
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString()
    }
    const clearProjectChat = vi.fn(async () => freshContext)
    window.spacezero.sessions.getCurrentProjectChatContext = vi.fn(async () => originalContext)
    window.spacezero.sessions.clearProjectChat = clearProjectChat
    window.spacezero.agent.getState = vi.fn(async ({ sessionId }) => ({
      sessionId,
      kind: 'project' as const,
      projectId: project.id,
      cwd: session.worktree?.path ?? project.path,
      status: 'idle' as const,
      live: true,
      transcriptPath: `/tmp/${sessionId}.jsonl`,
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4',
      thinkingLevel: 'medium' as const,
      transcriptSnapshot:
        sessionId === session.id
          ? [
              {
                role: 'assistant' as const,
                content: [{ type: 'text' as const, text: 'Only in the prior Chat Context' }],
                timestamp: 1,
                stopReason: 'stop' as const
              }
            ]
          : []
    }))
    useToolPaneStore.getState().openTool('session:session-1', 'git')
    const stableToolState = structuredClone(
      useToolPaneStore.getState().contexts['session:session-1']
    )

    render(<ProjectSessionHostSurface project={project} session={session} />)

    expect(await screen.findByText('Only in the prior Chat Context')).toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    await userEvent.type(input, '/cl')
    const clearOption = screen.getByRole('option', { name: /\/clear/ })
    expect(clearOption).toHaveAttribute('data-suggestion-kind', 'command')
    expect(clearOption.querySelector('[data-command-icon="true"]')).toBeInTheDocument()

    await userEvent.clear(input)
    await userEvent.type(input, '/clear{Enter}')

    await waitFor(() => expect(clearProjectChat).toHaveBeenCalledWith({ sessionId: session.id }))
    await waitFor(() =>
      expect(window.spacezero.agent.getState).toHaveBeenCalledWith({ sessionId: 'agent-session-2' })
    )
    expect(screen.queryByText('Only in the prior Chat Context')).not.toBeInTheDocument()
    expect(
      screen.getByText('Ask the agent to work on this project. Streamed replies appear here.')
    ).toBeInTheDocument()
    expect(useToolPaneStore.getState().contexts['session:session-1']).toEqual(stableToolState)
  })

  it('renders prompt failures in the session panel', async () => {
    const user = userEvent.setup()
    window.spacezero.agent.prompt = async () => {
      throw new Error('agent unavailable')
    }

    render(<ProjectSessionHostSurface project={project} session={session} />)

    await user.type(await screen.findByRole('textbox', { name: 'Agent prompt' }), 'hello')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Agent prompt failed: agent unavailable'
    )
  })

  it('projects Git-originated prompts through the normal transcript without changing the primary chat draft', async () => {
    const user = userEvent.setup()
    const projectionListeners = new Set<(event: AgentSessionProjectionEvent) => void>()
    const prompt = vi.fn<(request: { sessionId: string; message: string }) => Promise<void>>(
      async () => undefined
    )
    window.spacezero.agent.onSessionProjectionEvent = (nextListener) => {
      projectionListeners.add(nextListener)
      return () => projectionListeners.delete(nextListener)
    }
    window.spacezero.agent.getState = async ({ sessionId }) => ({
      sessionId,
      projectId: 'project-1',
      cwd: project.path,
      status: 'idle',
      live: true,
      transcriptPath: '/tmp/session-1.jsonl',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4',
      thinkingLevel: 'medium'
    })
    window.spacezero.agent.getAvailableModels = async () => [
      {
        providerId: 'anthropic',
        providerLabel: 'Anthropic',
        modelId: 'claude-sonnet-4',
        modelLabel: 'Claude Sonnet 4'
      }
    ]
    window.spacezero.agent.prompt = prompt
    window.spacezero.settings.getModelDefaults = async () => ({
      defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet-4' },
      defaultThinking: 'medium'
    })
    window.spacezero.settings.getGitActionSettings = async () => ({
      primaryGitAction: 'commit-and-push'
    })
    window.spacezero.git.getReview = async () => ({
      status: 'ok',
      branch: 'feature/test',
      upstream: { kind: 'tracked', name: 'origin/feature/test', ahead: 0, behind: 0 },
      files: [
        {
          path: 'README.md',
          kind: 'modified',
          binary: false,
          large: false,
          diff: 'diff --git a/README.md b/README.md\n+Changed\n'
        }
      ]
    })

    render(
      <div>
        <ProjectSessionHostSurface project={project} session={session} />
        <GitTool sessionId="session-1" />
      </div>
    )

    const draft = 'Keep this primary composer draft exactly: üñîçødé\nsecond line'
    const primaryChatComposer = await screen.findByRole('textbox', { name: 'Agent prompt' })
    await user.type(primaryChatComposer, draft)
    expect(primaryChatComposer).toHaveValue(draft)

    await user.click(await screen.findByRole('button', { name: 'Commit & Push' }))

    await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
    const gitPrompt = prompt.mock.calls[0]?.[0].message ?? ''
    expect(prompt).toHaveBeenCalledWith({
      sessionId: 'session-1',
      message: expect.stringContaining('inspect the current Git state')
    })

    await act(async () => {
      for (const listener of projectionListeners) {
        listener({ type: 'agent_start', sessionId: 'session-1', seq: 1 })
        listener({
          type: 'message_start',
          sessionId: 'session-1',
          seq: 2,
          message: { role: 'user', content: gitPrompt, timestamp: 100 }
        })
        listener({
          type: 'message_start',
          sessionId: 'session-1',
          seq: 3,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'I inspected fresh Git state and created a commit.' }],
            timestamp: 101
          }
        })
        listener({
          type: 'message_end',
          sessionId: 'session-1',
          seq: 4,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'I inspected fresh Git state and created a commit.' }],
            timestamp: 101,
            stopReason: 'stop'
          }
        })
        listener({ type: 'agent_end', sessionId: 'session-1', seq: 5 })
      }
    })

    expect(await screen.findByText(/Please inspect the current Git state/)).toBeInTheDocument()
    expect(
      screen.getByText('I inspected fresh Git state and created a commit.')
    ).toBeInTheDocument()
    expect(primaryChatComposer).toHaveValue(draft)
  })

  it('routes Project Session chat HTTP links to a new same-context Browser tab by default', async () => {
    const user = userEvent.setup()
    let projectionListener: ((event: AgentSessionProjectionEvent) => void) | undefined
    const createTab = vi.fn(async () => ({
      contextKey: 'session:session-1',
      activeTabId: 'tab-1',
      tabs: []
    }))
    window.spacezero.agent.onSessionProjectionEvent = (nextListener) => {
      projectionListener = nextListener
      return () => undefined
    }
    window.spacezero.browser.createTab = createTab
    window.spacezero.settings.getChatLinkSettings = async () => ({
      openChatLinksIn: 'space-zero-browser'
    })

    render(<ProjectSessionHostSurface project={project} session={session} />)
    await screen.findByRole('textbox', { name: 'Agent prompt' })

    await act(async () => {
      projectionListener?.(chatSnapshotEvent('session-1', 'Read [docs](https://example.com/docs).'))
    })
    await user.click(await screen.findByRole('link', { name: 'docs' }))

    expect(createTab).toHaveBeenCalledWith({
      contextKey: 'session:session-1',
      context: { kind: 'project-session', projectId: 'project-1', sessionId: 'session-1' },
      input: 'https://example.com/docs'
    })
    expect(useToolPaneStore.getState().contexts['session:session-1']).toMatchObject({
      isOpen: true,
      activeToolId: 'browser'
    })
  })

  it('routes Workspace Session chat HTTP links to the default browser when selected', async () => {
    const user = userEvent.setup()
    let projectionListener: ((event: AgentSessionProjectionEvent) => void) | undefined
    const openUrlInDefaultBrowser = vi.fn(async () => undefined)
    const createTab = vi.fn(async () => ({
      contextKey: 'session:workspace-session-1',
      activeTabId: 'tab-1',
      tabs: []
    }))
    window.spacezero.agent.onSessionProjectionEvent = (nextListener) => {
      projectionListener = nextListener
      return () => undefined
    }
    window.spacezero.browser.openUrlInDefaultBrowser = openUrlInDefaultBrowser
    window.spacezero.browser.createTab = createTab
    window.spacezero.settings.getChatLinkSettings = async () => ({
      openChatLinksIn: 'default-browser'
    })

    render(<WorkspaceSessionHostSurface session={workspaceSession} />)

    await act(async () => {
      projectionListener?.(
        chatSnapshotEvent('workspace-session-1', 'Open [site](https://spacezero.dev).')
      )
    })
    await user.click(await screen.findByRole('link', { name: 'site' }))

    expect(openUrlInDefaultBrowser).toHaveBeenCalledWith({ url: 'https://spacezero.dev/' })
    expect(createTab).not.toHaveBeenCalled()
    expect(useToolPaneStore.getState().contexts['session:workspace-session-1']).toBeUndefined()
  })

  it('fails closed for unsupported chat link protocols before Browser routing', async () => {
    let projectionListener: ((event: AgentSessionProjectionEvent) => void) | undefined
    const createTab = vi.fn(async () => ({
      contextKey: 'session:session-1',
      activeTabId: 'tab-1',
      tabs: []
    }))
    const openUrlInDefaultBrowser = vi.fn(async () => undefined)
    window.spacezero.agent.onSessionProjectionEvent = (nextListener) => {
      projectionListener = nextListener
      return () => undefined
    }
    window.spacezero.browser.createTab = createTab
    window.spacezero.browser.openUrlInDefaultBrowser = openUrlInDefaultBrowser

    render(<ProjectSessionHostSurface project={project} session={session} />)
    await screen.findByRole('textbox', { name: 'Agent prompt' })
    await waitFor(() => expect(projectionListener).toBeDefined())

    await act(async () => {
      projectionListener?.(chatSnapshotEvent('session-1', 'Ignore [file](file:///etc/passwd).'))
    })
    expect(await screen.findByText('file [blocked]')).toBeInTheDocument()

    expect(createTab).not.toHaveBeenCalled()
    expect(openUrlInDefaultBrowser).not.toHaveBeenCalled()
  })

  it('uses configured model and thinking defaults when session state has no override', async () => {
    window.spacezero.agent.getState = async ({ sessionId }) => ({
      sessionId,
      projectId: 'project-1',
      cwd: project.path,
      status: 'idle',
      live: true,
      transcriptPath: '/tmp/session-1.jsonl',
      modelProvider: undefined,
      modelId: undefined,
      thinkingLevel: undefined
    })
    window.spacezero.agent.getAvailableModels = async () => [
      {
        providerId: 'openai',
        providerLabel: 'OpenAI',
        modelId: 'gpt-5',
        modelLabel: 'GPT-5'
      }
    ]
    window.spacezero.settings.getModelDefaults = async () => ({
      defaultModel: { providerId: 'openai', modelId: 'gpt-5' },
      defaultThinking: 'high'
    })

    render(<ProjectSessionHostSurface project={project} session={session} />)

    expect(await screen.findByRole('button', { name: /GPT-5/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thinking: High' })).toBeInTheDocument()
  })

  it('loads available models and updates the session model from the selector', async () => {
    const user = userEvent.setup()
    const setModel = vi.fn(async ({ sessionId, provider, modelId }) => ({
      sessionId,
      projectId: 'project-1',
      cwd: project.path,
      status: 'idle' as const,
      live: true,
      transcriptPath: '/tmp/session-1.jsonl',
      modelProvider: provider,
      modelId,
      thinkingLevel: 'medium' as const
    }))
    window.spacezero.agent.getState = async ({ sessionId }) => ({
      sessionId,
      projectId: 'project-1',
      cwd: project.path,
      status: 'idle',
      live: true,
      transcriptPath: '/tmp/session-1.jsonl',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4',
      thinkingLevel: 'medium'
    })
    window.spacezero.agent.getAvailableModels = async () => [
      {
        providerId: 'anthropic',
        providerLabel: 'Anthropic',
        modelId: 'claude-sonnet-4',
        modelLabel: 'Claude Sonnet 4'
      },
      {
        providerId: 'openai',
        providerLabel: 'OpenAI',
        modelId: 'gpt-5',
        modelLabel: 'GPT-5'
      }
    ]
    window.spacezero.agent.setModel = setModel

    render(<ProjectSessionHostSurface project={project} session={session} />)

    await user.click(await screen.findByRole('button', { name: /Claude Sonnet 4/ }))
    await user.click(await screen.findByText('GPT-5'))

    await waitFor(() =>
      expect(setModel).toHaveBeenCalledWith({
        sessionId: 'session-1',
        provider: 'openai',
        modelId: 'gpt-5'
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Model Selector' })).not.toBeInTheDocument()
    )
  })

  it('updates the session thinking level from the thinking selector', async () => {
    const user = userEvent.setup()
    const setThinkingLevel = vi.fn(async ({ sessionId, level }) => ({
      sessionId,
      projectId: 'project-1',
      cwd: project.path,
      status: 'idle' as const,
      live: true,
      transcriptPath: '/tmp/session-1.jsonl',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4',
      thinkingLevel: level
    }))
    window.spacezero.agent.getState = async ({ sessionId }) => ({
      sessionId,
      projectId: 'project-1',
      cwd: project.path,
      status: 'idle',
      live: true,
      transcriptPath: '/tmp/session-1.jsonl',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4',
      thinkingLevel: 'medium'
    })
    window.spacezero.agent.setThinkingLevel = setThinkingLevel

    render(<ProjectSessionHostSurface project={project} session={session} />)

    await user.click(await screen.findByRole('button', { name: 'Thinking: Medium' }))

    await waitFor(() =>
      expect(setThinkingLevel).toHaveBeenCalledWith({ sessionId: 'session-1', level: 'high' })
    )
    expect(await screen.findByRole('button', { name: 'Thinking: High' })).toBeInTheDocument()
  })

  it('lists Agent Definitions in a fresh session picker', async () => {
    const user = userEvent.setup()
    window.spacezero.agents.getSessionDefinitions = async () => [
      {
        id: 'reviewer',
        scope: 'bundled',
        path: 'bundled:reviewer',
        status: 'valid',
        diagnostics: [],
        name: 'Reviewer',
        description: 'Review code changes.',
        body: 'Review carefully.'
      }
    ]

    render(<ProjectSessionHostSurface project={project} session={session} />)

    await user.click(await screen.findByRole('button', { name: 'Agent Definition: None' }))

    expect(screen.getByRole('option', { name: /Reviewer/ })).toBeInTheDocument()
    expect(screen.getByText('Review code changes.')).toBeInTheDocument()
  })

  it('applies the selected Agent Definition before the first prompt', async () => {
    const user = userEvent.setup()
    const applyDefinitionToFreshSession = vi.fn(async ({ sessionId }) => ({
      sessionId,
      projectId: 'project-1',
      cwd: project.path,
      status: 'idle' as const,
      live: true,
      transcriptPath: '/tmp/session-1.jsonl',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4',
      thinkingLevel: 'high' as const,
      agentDefinition: { id: 'reviewer', name: 'Reviewer' }
    }))
    const prompt = vi.fn(async () => undefined)
    window.spacezero.agents.getSessionDefinitions = async () => [
      {
        id: 'reviewer',
        scope: 'bundled',
        path: 'bundled:reviewer',
        status: 'valid',
        diagnostics: [],
        name: 'Reviewer',
        description: 'Review code changes.',
        body: 'Review carefully.'
      }
    ]
    window.spacezero.agent.applyDefinitionToFreshSession = applyDefinitionToFreshSession
    window.spacezero.agent.prompt = prompt

    render(<ProjectSessionHostSurface project={project} session={session} />)

    await user.click(await screen.findByRole('button', { name: 'Agent Definition: None' }))
    await user.click(screen.getByRole('option', { name: /Reviewer/ }))
    await user.type(screen.getByRole('textbox', { name: 'Agent prompt' }), 'review this')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() =>
      expect(applyDefinitionToFreshSession).toHaveBeenCalledWith({
        sessionId: 'session-1',
        agentDefinition: { id: 'reviewer' }
      })
    )
    expect(prompt).toHaveBeenCalledWith({ sessionId: 'session-1', message: 'review this' })
    expect(applyDefinitionToFreshSession.mock.invocationCallOrder[0]).toBeLessThan(
      prompt.mock.invocationCallOrder[0]
    )
  })

  it('surfaces Agent Definition application failures without losing the submitted prompt', async () => {
    const user = userEvent.setup()
    const applyDefinitionToFreshSession = vi.fn(async () => {
      throw new Error('model is not authenticated')
    })
    const prompt = vi.fn(async () => undefined)
    window.spacezero.agents.getSessionDefinitions = async () => [
      {
        id: 'reviewer',
        scope: 'bundled',
        path: 'bundled:reviewer',
        status: 'valid',
        diagnostics: [],
        name: 'Reviewer',
        description: 'Review code changes.',
        body: 'Review carefully.'
      }
    ]
    window.spacezero.agent.applyDefinitionToFreshSession = applyDefinitionToFreshSession
    window.spacezero.agent.prompt = prompt

    render(<ProjectSessionHostSurface project={project} session={session} />)

    await user.click(await screen.findByRole('button', { name: 'Agent Definition: None' }))
    await user.click(screen.getByRole('option', { name: /Reviewer/ }))
    await user.type(screen.getByRole('textbox', { name: 'Agent prompt' }), 'review this')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to apply Agent Definition: model is not authenticated'
    )
    expect(screen.getByRole('textbox', { name: 'Agent prompt' })).toHaveValue('review this')
    expect(prompt).not.toHaveBeenCalled()
  })

  it('keeps post-definition model and thinking edits authoritative over fresh local overrides', async () => {
    const user = userEvent.setup()
    let runtimeState: AgentSessionState = {
      sessionId: 'session-1',
      projectId: 'project-1',
      cwd: project.path,
      status: 'idle',
      live: true,
      transcriptPath: '/tmp/session-1.jsonl',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4',
      thinkingLevel: 'medium'
    }
    const applyDefinitionToFreshSession = vi.fn(async ({ sessionId }) => {
      runtimeState = {
        ...runtimeState,
        sessionId,
        modelProvider: 'faux',
        modelId: 'faux-1',
        thinkingLevel: 'low',
        agentDefinition: { id: 'reviewer', name: 'Reviewer' }
      }
      return runtimeState
    })
    window.spacezero.agent.getState = async () => runtimeState
    window.spacezero.agent.getAvailableModels = async () => [
      {
        providerId: 'anthropic',
        providerLabel: 'Anthropic',
        modelId: 'claude-sonnet-4',
        modelLabel: 'Claude Sonnet 4'
      },
      {
        providerId: 'openai',
        providerLabel: 'OpenAI',
        modelId: 'gpt-5',
        modelLabel: 'GPT-5'
      },
      {
        providerId: 'faux',
        providerLabel: 'Faux',
        modelId: 'faux-1',
        modelLabel: 'Faux 1'
      }
    ]
    window.spacezero.agent.setModel = vi.fn(async ({ provider, modelId }) => {
      runtimeState = { ...runtimeState, modelProvider: provider, modelId }
      return runtimeState
    })
    window.spacezero.agent.setThinkingLevel = vi.fn(async ({ level }) => {
      runtimeState = { ...runtimeState, thinkingLevel: level }
      return runtimeState
    })
    window.spacezero.agents.getSessionDefinitions = async () => [
      {
        id: 'reviewer',
        scope: 'bundled',
        path: 'bundled:reviewer',
        status: 'valid',
        diagnostics: [],
        name: 'Reviewer',
        description: 'Review code changes.',
        body: 'Review carefully.'
      }
    ]
    window.spacezero.agent.applyDefinitionToFreshSession = applyDefinitionToFreshSession
    window.spacezero.agent.prompt = vi.fn(async () => undefined)

    render(<ProjectSessionHostSurface project={project} session={session} />)

    await user.click(await screen.findByRole('button', { name: /Claude Sonnet 4/ }))
    await user.click(await screen.findByText('GPT-5'))
    await user.click(await screen.findByRole('button', { name: 'Thinking: Medium' }))
    expect(await screen.findByRole('button', { name: /GPT-5/ })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Thinking: High' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Agent Definition: None' }))
    await user.click(screen.getByRole('option', { name: /Reviewer/ }))
    await user.type(screen.getByRole('textbox', { name: 'Agent prompt' }), 'review this')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(applyDefinitionToFreshSession).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: /Faux 1/ })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Thinking: Low' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Thinking: Low' }))
    expect(await screen.findByRole('button', { name: 'Thinking: Medium' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Faux 1/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Faux 1/ }))
    await user.click(await screen.findByText('GPT-5'))
    expect(await screen.findByRole('button', { name: /GPT-5/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thinking: Medium' })).toBeInTheDocument()
  })

  it('locks the picker and renders the active Agent Definition chip from session state', async () => {
    window.spacezero.agent.getState = async ({ sessionId }) => ({
      sessionId,
      projectId: 'project-1',
      cwd: project.path,
      status: 'idle',
      live: true,
      transcriptPath: '/tmp/session-1.jsonl',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4',
      thinkingLevel: 'high',
      agentDefinition: { id: 'reviewer', name: 'Reviewer' },
      transcriptSnapshot: [
        {
          role: 'user',
          timestamp: 100,
          content: [{ type: 'text', text: 'review this' }]
        }
      ]
    })
    window.spacezero.agents.getSessionDefinitions = async () => [
      {
        id: 'reviewer',
        scope: 'bundled',
        path: 'bundled:reviewer',
        status: 'valid',
        diagnostics: [],
        name: 'Reviewer',
        description: 'Review code changes.',
        body: 'Review carefully.'
      }
    ]

    render(<ProjectSessionHostSurface project={project} session={session} />)

    expect(await screen.findByText('Reviewer')).toBeInTheDocument()
    expect(screen.getByText('Agent Definition')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agent Definition:/ })).not.toBeInTheDocument()
  })

  it('locks the picker for sessions with messages even without an active Agent Definition', async () => {
    window.spacezero.agent.getState = async ({ sessionId }) => ({
      sessionId,
      projectId: 'project-1',
      cwd: project.path,
      status: 'idle',
      live: true,
      transcriptPath: '/tmp/session-1.jsonl',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4',
      thinkingLevel: 'high',
      transcriptSnapshot: [
        {
          role: 'user',
          timestamp: 100,
          content: [{ type: 'text', text: 'review this' }]
        }
      ]
    })
    window.spacezero.agents.getSessionDefinitions = async () => [
      {
        id: 'reviewer',
        scope: 'bundled',
        path: 'bundled:reviewer',
        status: 'valid',
        diagnostics: [],
        name: 'Reviewer',
        description: 'Review code changes.',
        body: 'Review carefully.'
      }
    ]

    render(<ProjectSessionHostSurface project={project} session={session} />)

    expect(await screen.findByText('review this')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agent Definition:/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Agent Definition')).not.toBeInTheDocument()
  })

  it('keeps the chat input visible for empty Workspace Sessions without fake placeholder messages', async () => {
    render(<WorkspaceSessionHostSurface session={workspaceSession} />)

    expect(screen.getByRole('textbox', { name: 'Agent prompt' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ask about Space Zero…')).toBeInTheDocument()
    expect(screen.getByText(/Ask the workspace agent about Space Zero/)).toBeInTheDocument()
    expect(screen.queryByText(/Streaming projection placeholder/)).not.toBeInTheDocument()
    expect(screen.queryByText('workspace.getStatus.preview')).not.toBeInTheDocument()
  })

  it('submits Workspace Session prompts through the agent prompt API', async () => {
    const user = userEvent.setup()
    const prompt = vi.fn(async () => undefined)
    window.spacezero.agent.prompt = prompt

    render(<WorkspaceSessionHostSurface session={workspaceSession} />)

    await user.type(screen.getByRole('textbox', { name: 'Agent prompt' }), 'what can you see?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() =>
      expect(prompt).toHaveBeenCalledWith({
        sessionId: 'workspace-session-1',
        message: 'what can you see?'
      })
    )
  })

  it('resolves inline Workspace Tool confirmations through the agent API', async () => {
    const user = userEvent.setup()
    let projectionListener: ((event: AgentSessionProjectionEvent) => void) | undefined
    const resolveToolConfirmation = vi.fn(async () => undefined)
    window.spacezero.agent.onSessionProjectionEvent = (nextListener) => {
      projectionListener = nextListener
      return () => undefined
    }
    window.spacezero.agent.resolveToolConfirmation = resolveToolConfirmation

    render(<ProjectSessionHostSurface project={project} session={session} />)
    await screen.findByRole('textbox', { name: 'Agent prompt' })

    await act(async () => {
      projectionListener?.({
        type: 'snapshot',
        sessionId: 'session-1',
        seq: 1,
        snapshot: {
          status: 'running',
          messages: [
            {
              role: 'assistant',
              timestamp: 100,
              content: [
                {
                  type: 'toolCall',
                  id: 'call-1',
                  name: 'workspace.updateProject',
                  arguments: { name: 'Renamed' }
                }
              ],
              stopReason: 'toolUse'
            }
          ],
          toolConfirmationRequests: [
            {
              sessionId: 'session-1',
              callId: 'call-1',
              toolName: 'workspace.updateProject',
              summary: 'Rename the project to Renamed.'
            }
          ]
        }
      })
    })

    await user.click(await screen.findByRole('button', { name: 'Approve' }))

    expect(resolveToolConfirmation).toHaveBeenCalledWith({
      sessionId: 'session-1',
      callId: 'call-1',
      approved: true
    })
  })

  it('keeps the previous selected model visible when model update fails', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    window.spacezero.agent.getState = async ({ sessionId }) => ({
      sessionId,
      projectId: 'project-1',
      cwd: project.path,
      status: 'idle',
      live: true,
      transcriptPath: '/tmp/session-1.jsonl',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4',
      thinkingLevel: 'medium'
    })
    window.spacezero.agent.getAvailableModels = async () => [
      {
        providerId: 'anthropic',
        providerLabel: 'Anthropic',
        modelId: 'claude-sonnet-4',
        modelLabel: 'Claude Sonnet 4'
      },
      {
        providerId: 'openai',
        providerLabel: 'OpenAI',
        modelId: 'gpt-5',
        modelLabel: 'GPT-5'
      }
    ]
    window.spacezero.agent.setModel = async () => {
      throw new Error('agent.modelAuthNotConfigured')
    }

    render(<ProjectSessionHostSurface project={project} session={session} />)

    await user.click(await screen.findByRole('button', { name: /Claude Sonnet 4/ }))
    await user.click(await screen.findByText('GPT-5'))

    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to change model: agent.modelAuthNotConfigured'
    )
    expect(await screen.findByRole('button', { name: /Claude Sonnet 4/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /GPT-5/ })).not.toBeInTheDocument()

    consoleError.mockRestore()
  })

  it('keeps the previous thinking level visible when thinking update fails', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    window.spacezero.agent.getState = async ({ sessionId }) => ({
      sessionId,
      projectId: 'project-1',
      cwd: project.path,
      status: 'idle',
      live: true,
      transcriptPath: '/tmp/session-1.jsonl',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4',
      thinkingLevel: 'medium'
    })
    window.spacezero.agent.setThinkingLevel = async () => {
      throw new Error('agent.thinkingUpdateFailed')
    }

    render(<ProjectSessionHostSurface project={project} session={session} />)

    await user.click(await screen.findByRole('button', { name: 'Thinking: Medium' }))

    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to change thinking level: agent.thinkingUpdateFailed'
    )
    expect(screen.getByRole('button', { name: 'Thinking: Medium' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thinking: High' })).not.toBeInTheDocument()

    consoleError.mockRestore()
  })

  it('projects matching Workspace Tool execution events into the session transcript', async () => {
    let listener: ((event: AgentToolExecutionEvent) => void) | undefined
    const unsubscribe = vi.fn()
    window.spacezero.agent.onToolExecution = (nextListener) => {
      listener = nextListener
      return unsubscribe
    }

    render(<ProjectSessionHostSurface project={project} session={session} />)
    await screen.findByRole('textbox', { name: 'Agent prompt' })

    await act(async () => {
      listener?.({
        sessionId: 'session-1',
        callId: 'call-1',
        toolName: 'workspace.getStatus',
        state: 'running',
        input: { type: 'object', keys: ['scope'] }
      })
    })

    expect(screen.getByText('workspace.getStatus')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()

    await act(async () => {
      listener?.({
        sessionId: 'session-1',
        callId: 'call-1',
        toolName: 'workspace.getStatus',
        state: 'success',
        output: { type: 'object', keys: ['ok', 'data'] }
      })
    })

    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0)
    expect(screen.getByText(/"data"/)).toBeInTheDocument()
  })

  it('ignores Workspace Tool execution events for other sessions', async () => {
    let listener: ((event: AgentToolExecutionEvent) => void) | undefined
    window.spacezero.agent.onToolExecution = (nextListener) => {
      listener = nextListener
      return () => undefined
    }

    render(<ProjectSessionHostSurface project={project} session={session} />)
    await screen.findByRole('textbox', { name: 'Agent prompt' })

    await act(async () => {
      listener?.({
        sessionId: 'other-session',
        callId: 'call-1',
        toolName: 'workspace.getStatus',
        state: 'running'
      })
    })

    expect(screen.queryByText('workspace.getStatus')).not.toBeInTheDocument()
  })
})

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve(value) {
      resolvePromise?.(value)
    }
  }
}

function chatSnapshotEvent(sessionId: string, text: string): AgentSessionProjectionEvent {
  return {
    type: 'snapshot',
    sessionId,
    seq: 1,
    snapshot: {
      status: 'idle',
      messages: [
        {
          role: 'assistant',
          timestamp: 100,
          content: [{ type: 'text', text }],
          stopReason: 'endTurn'
        }
      ],
      toolConfirmationRequests: []
    }
  }
}
