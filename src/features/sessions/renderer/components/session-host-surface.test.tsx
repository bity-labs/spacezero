import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from '../../../projects/shared'
import type { ProjectSession, WorkspaceSession } from '../../shared'
import type { AgentToolExecutionEvent } from '../../../../shared/workspace-tool-protocol'
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

describe('ProjectSessionHostSurface', () => {
  it('renders prompt failures in the session panel', async () => {
    const user = userEvent.setup()
    window.spacezero.agent.prompt = async () => {
      throw new Error('agent unavailable')
    }

    render(<ProjectSessionHostSurface project={project} session={session} />)

    await user.type(screen.getByRole('textbox', { name: 'Agent prompt' }), 'hello')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Agent prompt failed: agent unavailable')
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

  it('projects matching Workspace Tool execution events into the session transcript', async () => {
    let listener: ((event: AgentToolExecutionEvent) => void) | undefined
    const unsubscribe = vi.fn()
    window.spacezero.agent.onToolExecution = (nextListener) => {
      listener = nextListener
      return unsubscribe
    }

    render(<ProjectSessionHostSurface project={project} session={session} />)

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
