import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from '../../shared'
import { AddProjectDialogView, type AddProjectDialogViewProps } from './add-project-dialog-view'
import { EditProjectDialogView, type EditProjectDialogViewProps } from './edit-project-dialog-view'

const project: Project = {
  id: 'project-1',
  name: 'Space Zero',
  path: '/workspaces/spacezero',
  agentResourcesTrusted: false,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z'
}

function createAddProps(
  overrides: Partial<AddProjectDialogViewProps> = {}
): AddProjectDialogViewProps {
  return {
    open: true,
    selectedPath: 'empty',
    name: '',
    error: null,
    agentResourcesTrusted: false,
    isSaving: false,
    githubSetupContent: null,
    onOpenChange: vi.fn(),
    onCancel: vi.fn(),
    onSelectPath: vi.fn(),
    onNameChange: vi.fn(),
    onAgentResourcesTrustedChange: vi.fn(),
    onCreateEmptyProject: vi.fn(),
    onAddFolderProject: vi.fn(),
    ...overrides
  }
}

function createEditProps(
  overrides: Partial<EditProjectDialogViewProps> = {}
): EditProjectDialogViewProps {
  return {
    project,
    open: true,
    name: project.name,
    path: project.path,
    error: null,
    isSaving: false,
    onOpenChange: vi.fn(),
    onNameChange: vi.fn(),
    onPathChange: vi.fn(),
    onSave: vi.fn(),
    ...overrides
  }
}

describe('AddProjectDialogView', () => {
  it('renders the default state and emits form intent', () => {
    const props = createAddProps()

    render(<AddProjectDialogView {...props} />)

    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'New Project' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Trust project agent resources/ }))
    fireEvent.click(screen.getByRole('button', { name: /Open Folder/ }))

    expect(props.onNameChange).toHaveBeenCalledWith('New Project')
    expect(props.onAgentResourcesTrustedChange).toHaveBeenCalledWith(true)
    expect(props.onSelectPath).toHaveBeenCalledWith('folder')
  })

  it('renders saving and error states without owning persistence', () => {
    const props = createAddProps({
      name: 'New Project',
      isSaving: true,
      error: 'Could not create project.'
    })

    render(<AddProjectDialogView {...props} />)

    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled()
    expect(screen.getByText('Could not create project.')).toHaveAttribute('role', 'alert')
  })
})

describe('EditProjectDialogView', () => {
  it('renders default project values and emits edit intent', () => {
    const props = createEditProps()

    render(<EditProjectDialogView {...props} />)

    expect(screen.getByLabelText('Project name')).toHaveValue('Space Zero')
    expect(screen.getByLabelText('Project path')).toHaveValue('/workspaces/spacezero')
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(props.onNameChange).toHaveBeenCalledWith('Renamed')
    expect(props.onSave).toHaveBeenCalledOnce()
  })

  it('renders saving and error states without owning persistence', () => {
    const props = createEditProps({ isSaving: true, error: 'Could not update project.' })

    render(<EditProjectDialogView {...props} />)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('Could not update project.')).toHaveAttribute('role', 'alert')
  })
})
