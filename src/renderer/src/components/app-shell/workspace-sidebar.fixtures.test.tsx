import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { WorkspaceSidebar } from './workspace-sidebar'
import {
  activeProjectFixture,
  connectedAccountFixture,
  disconnectedAccountFixture,
  globalChatSelectedFixture,
  knowledgeBaseSelectedFixture,
  loadingProjectsFixture,
  manyProjectsFixture,
  noProjectsFixture,
  projectErrorFixture,
  updateReadyAccountFixture
} from './workspace-sidebar.fixtures'

describe('WorkspaceSidebar fixtures', () => {
  it('renders the no-projects state through the pure sidebar interface', () => {
    render(<WorkspaceSidebar {...noProjectsFixture} />)

    expect(screen.getByText('No projects yet.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add project' })).toHaveLength(2)
  })

  it('renders the project loading state through the project-list slot', () => {
    render(<WorkspaceSidebar {...loadingProjectsFixture} />)

    expect(screen.getByText('Loading projects…')).toBeInTheDocument()
  })

  it('renders the project error state through the project-list slot', () => {
    render(<WorkspaceSidebar {...projectErrorFixture} />)

    expect(screen.getByText('Could not reach the local project store.')).toBeInTheDocument()
  })

  it('renders enough projects to exercise the sidebar overflow state', () => {
    render(<WorkspaceSidebar {...manyProjectsFixture} />)

    expect(screen.getByText('Space Zero')).toBeInTheDocument()
    expect(screen.getByText('Release Console')).toBeInTheDocument()
  })

  it('marks the active project in the project-list slot', () => {
    render(<WorkspaceSidebar {...activeProjectFixture} />)

    expect(screen.getByRole('button', { name: 'Space Zero' })).toHaveAttribute('data-active')
  })

  it('represents each global navigation selection', () => {
    const { rerender } = render(<WorkspaceSidebar {...globalChatSelectedFixture} />)

    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('data-active')

    rerender(<WorkspaceSidebar {...knowledgeBaseSelectedFixture} />)

    expect(screen.getByRole('button', { name: 'Knowledge Base' })).toHaveAttribute('data-active')
  })

  it('represents connected, disconnected, and update-ready account slots', () => {
    const { rerender } = render(<WorkspaceSidebar {...connectedAccountFixture} />)

    expect(screen.getByRole('img', { name: '@builder' })).toBeInTheDocument()
    expect(screen.getByText('@builder')).toBeInTheDocument()

    rerender(<WorkspaceSidebar {...disconnectedAccountFixture} />)

    expect(screen.getByText('Connect GitHub')).toBeInTheDocument()

    rerender(<WorkspaceSidebar {...updateReadyAccountFixture} />)

    expect(
      screen.getByRole('button', { name: 'Update ready. Restart to update to 0.1.0-beta.8' })
    ).toBeInTheDocument()
  })
})
