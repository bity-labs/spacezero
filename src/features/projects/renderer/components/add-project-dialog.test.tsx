import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AddProjectDialog } from './add-project-dialog'

describe('AddProjectDialog', () => {
  it('keeps project agent-resource trust unchecked by default and submits the explicit creation choice', async () => {
    const onCreateEmptyProject = vi.fn(async (request) => ({
      id: 'project-1',
      name: request.name,
      path: '/tmp/project-1',
      agentResourcesTrusted: request.agentResourcesTrusted,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    }))

    render(
      <AddProjectDialog
        open
        onOpenChange={() => undefined}
        onCreateEmptyProject={onCreateEmptyProject}
        onAddFromFolder={async () => null}
        onGitHubProjectReady={async () => undefined}
      />
    )

    expect(screen.getByRole('checkbox', { name: /Trust project agent resources/ })).not.toBeChecked()
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Trusted App' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Trust project agent resources/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))

    await waitFor(() =>
      expect(onCreateEmptyProject).toHaveBeenCalledWith({
        name: 'Trusted App',
        agentResourcesTrusted: true
      })
    )
  })

  it('places the GitHub repository action beside Cancel in the dialog footer', () => {
    render(
      <AddProjectDialog
        open
        onOpenChange={() => undefined}
        onCreateEmptyProject={async () => {
          throw new Error('unused')
        }}
        onAddFromFolder={async () => null}
        onGitHubProjectReady={async () => undefined}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /GitHub Repository/ }))

    const footer = screen
      .getByRole('button', { name: 'Cancel' })
      .closest('[data-slot="dialog-footer"]')
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Clone repository' }))
  })

  it('submits the explicit folder-registration trust choice without renderer-supplied paths', async () => {
    const onAddFromFolder = vi.fn(async () => ({
      id: 'project-1',
      name: 'Existing Project',
      path: '/tmp/existing-project',
      agentResourcesTrusted: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    }))

    render(
      <AddProjectDialog
        open
        onOpenChange={() => undefined}
        onCreateEmptyProject={async () => {
          throw new Error('unused')
        }}
        onAddFromFolder={onAddFromFolder}
        onGitHubProjectReady={async () => undefined}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Open Folder/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Trust project agent resources/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))

    await waitFor(() =>
      expect(onAddFromFolder).toHaveBeenCalledWith({ agentResourcesTrusted: true })
    )
  })
})
