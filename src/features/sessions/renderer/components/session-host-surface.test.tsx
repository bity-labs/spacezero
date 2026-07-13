import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ProjectSessionHostSurface } from './session-host-surface'

const project = {
  id: 'project-1',
  name: 'Space Zero',
  path: '/Users/tiby/ws/dev/spacezero',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

const session = {
  id: 'session-1',
  projectId: 'project-1',
  title: 'Session 1',
  status: 'idle' as const,
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
})
