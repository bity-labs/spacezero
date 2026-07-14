import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from '../../../projects/shared'
import type { ProjectSession } from '../../shared'
import type { AgentToolExecutionEvent } from '../../../../shared/workspace-tool-protocol'
import { ProjectSessionHostSurface } from './session-host-surface'

const project: Project = {
  id: 'project-1',
  name: 'Space Zero',
  path: '/Users/tiby/ws/dev/spacezero',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

const session: ProjectSession = {
  id: 'session-1',
  projectId: 'project-1',
  title: 'Session 1',
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

    render(
      <ProjectSessionHostSurface
        project={project}
        session={session}
        thinkingLevel="medium"
        onThinkingChange={() => undefined}
      />
    )

    await user.type(screen.getByRole('textbox', { name: 'Agent prompt' }), 'hello')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Agent prompt failed: agent unavailable')
  })

  it('projects matching Workspace Tool execution events into the session transcript', async () => {
    let listener: ((event: AgentToolExecutionEvent) => void) | undefined
    const unsubscribe = vi.fn()
    window.spacezero.agent.onToolExecution = (nextListener) => {
      listener = nextListener
      return unsubscribe
    }

    render(
      <ProjectSessionHostSurface
        project={project}
        session={session}
        thinkingLevel="medium"
        onThinkingChange={() => undefined}
      />
    )

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

    render(
      <ProjectSessionHostSurface
        project={project}
        session={session}
        thinkingLevel="medium"
        onThinkingChange={() => undefined}
      />
    )

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
