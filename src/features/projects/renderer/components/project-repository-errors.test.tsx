import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Project } from '../../shared'
import { AddProjectDialog } from './add-project-dialog'
import { EditProjectDialog } from './edit-project-dialog'

const project: Project = {
  id: 'project-1',
  name: 'Space Zero',
  path: '/workspaces/spacezero',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z'
}

describe('Project repository guidance', () => {
  it('explains why a current non-Git folder cannot be registered', async () => {
    render(
      <AddProjectDialog
        open
        onOpenChange={() => undefined}
        onCreateEmptyProject={async () => project}
        onAddFromFolder={async () => {
          throw new Error('project.notGitRepository')
        }}
        onGitHubProjectReady={async () => undefined}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Open Folder/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))

    expect(
      await screen.findByText(
        'Choose a Git repository. Plain folders cannot start isolated Sessions.'
      )
    ).toBeInTheDocument()
  })

  it('explains that managed Sessions must be removed before a Project path edit', async () => {
    render(
      <EditProjectDialog
        open
        project={project}
        onOpenChange={() => undefined}
        onUpdateProject={async () => {
          throw new Error('project.pathChangeBlockedByManagedSessions')
        }}
      />
    )

    fireEvent.change(screen.getByLabelText('Project path'), {
      target: { value: '/workspaces/other' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText(/Delete this Project’s managed Sessions before changing/)
    ).toBeInTheDocument()
  })
})
