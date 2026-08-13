import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from '../../shared'
import { ProjectHomeScreen, type ProjectHomeScreenProps } from './project-home-screen'

const project: Project = {
  id: 'project-1',
  name: 'Space Zero',
  path: '/workspaces/spacezero',
  agentResourcesTrusted: false,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z'
}

function createProps(overrides: Partial<ProjectHomeScreenProps> = {}): ProjectHomeScreenProps {
  return {
    project,
    activeView: 'overview',
    isStartingSession: false,
    sessionSetupError: null,
    githubState: { status: 'local-only' },
    agentResourceTrust: { trusted: false, isSaving: false, error: null },
    summaryContent: null,
    workflowContent: null,
    onSelectView: vi.fn(),
    onNewSession: vi.fn(),
    onLoadLinkOptions: vi.fn(),
    onSelectRepository: vi.fn(),
    onLinkRepository: vi.fn(),
    onRetryRepository: vi.fn(),
    onAgentResourceTrustChange: vi.fn(),
    ...overrides
  }
}

describe('ProjectHomeScreen', () => {
  it('renders a local-only Project without requiring application runtime data', () => {
    const props = createProps()

    render(<ProjectHomeScreen {...props} />)

    expect(screen.getByRole('heading', { name: 'Space Zero' })).toBeInTheDocument()
    expect(screen.getByText('Local Project')).toBeInTheDocument()
    expect(screen.getByText('/workspaces/spacezero')).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: /Trust project agent resources/ })
    ).not.toBeChecked()
  })

  it('emits navigation, Session, and trust intent through callbacks', () => {
    const props = createProps({
      agentResourceTrust: { trusted: true, isSaving: false, error: null }
    })

    render(<ProjectHomeScreen {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Issues' }))
    fireEvent.click(screen.getByRole('button', { name: 'New session' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Trust project agent resources/ }))

    expect(props.onSelectView).toHaveBeenCalledWith('issues')
    expect(props.onNewSession).toHaveBeenCalledOnce()
    expect(props.onAgentResourceTrustChange).toHaveBeenCalledWith(false)
  })

  it('renders connected repository and independent summary visual states from props', () => {
    const props = createProps({
      githubState: {
        status: 'connected',
        repository: {
          id: '1000',
          nodeId: 'R_1000',
          installationId: '100',
          owner: 'bity-labs',
          name: 'spacezero',
          fullName: 'bity-labs/spacezero',
          isPrivate: true,
          defaultBranch: 'main',
          htmlUrl: 'https://github.com/bity-labs/spacezero',
          cloneUrl: 'https://github.com/bity-labs/spacezero.git'
        }
      },
      summaryContent: (
        <>
          <section aria-label="Recent Issues">
            <p>Issue summary error</p>
          </section>
          <section aria-label="Open Pull Requests">
            <p>No Pull Requests to show.</p>
          </section>
        </>
      )
    })

    render(<ProjectHomeScreen {...props} />)

    const repositoryCard = screen.getByRole('region', { name: 'GitHub repository' })
    expect(within(repositoryCard).getByText('bity-labs/spacezero')).toBeInTheDocument()
    expect(screen.getByText('Issue summary error')).toBeInTheDocument()
    expect(screen.getByText('No Pull Requests to show.')).toBeInTheDocument()
  })
})
