import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkspaceSidebar } from './workspace-sidebar'

describe('WorkspaceSidebar', () => {
  it('shows the selected workspace destination and emits navigation intent', () => {
    const onSelectKnowledgeBase = vi.fn()
    const onSelectGlobalChat = vi.fn()
    const onToggleProjects = vi.fn()
    const onFilterProjects = vi.fn()
    const onAddProject = vi.fn()

    render(
      <WorkspaceSidebar
        open
        activeView="global-chat"
        projectsExpanded
        projectsContent={<p>Project fixture</p>}
        accountMenu={<p>Account fixture</p>}
        labels={{
          sidebar: 'Workspace sidebar',
          navigation: 'Workspace navigation',
          knowledgeBase: 'Knowledge Base',
          globalChat: 'Chat',
          projects: 'Projects',
          filterProjects: 'Filter projects',
          addProject: 'Add project'
        }}
        onOpenChange={vi.fn()}
        onSelectKnowledgeBase={onSelectKnowledgeBase}
        onSelectGlobalChat={onSelectGlobalChat}
        onToggleProjects={onToggleProjects}
        onFilterProjects={onFilterProjects}
        onAddProject={onAddProject}
      />
    )

    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('data-active')
    expect(screen.getByText('Project fixture')).toBeInTheDocument()
    expect(screen.getByText('Account fixture')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Knowledge Base' }))
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'Filter projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add project' }))

    expect(onSelectKnowledgeBase).toHaveBeenCalledOnce()
    expect(onSelectGlobalChat).not.toHaveBeenCalled()
    expect(onToggleProjects).toHaveBeenCalledOnce()
    expect(onFilterProjects).toHaveBeenCalledOnce()
    expect(onAddProject).toHaveBeenCalledOnce()
  })
})
