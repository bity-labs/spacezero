import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from '../../shared'
import type { ProjectSession } from '../../../sessions/shared'
import { SidebarProvider } from '@renderer/components/ui/sidebar'

import { ProjectSidebarList } from './project-sidebar-list'

const project: Project = {
  id: 'project-1',
  name: 'Space Zero',
  path: '/tmp/spacezero',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

const session: ProjectSession = {
  id: 'project-session-1',
  kind: 'project',
  projectId: project.id,
  title: 'Project Session 1',
  status: 'idle',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

describe('ProjectSidebarList session actions', () => {
  it('archives a Project Session from the sidebar', () => {
    const onArchiveSession = vi.fn()
    render(
      <SidebarProvider>
        <ProjectSidebarList
          projects={[project]}
          activeProject={project}
          status="ready"
          error={null}
          onAddProject={vi.fn()}
          onSelectProject={vi.fn()}
          onEditProject={vi.fn()}
          sessionsByProjectId={new Map([[project.id, [session]]])}
          onArchiveSession={onArchiveSession}
        />
      </SidebarProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand Space Zero sessions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive session' }))

    expect(onArchiveSession).toHaveBeenCalledWith(session)
  })
})
