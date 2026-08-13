import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AddProjectDialogView } from './add-project-dialog-view'
import {
  addProjectDefaultFixture,
  addProjectErrorFixture,
  addProjectSavingFixture,
  editProjectDefaultFixture,
  editProjectErrorFixture,
  editProjectSavingFixture
} from './project-dialog.fixtures'
import { EditProjectDialogView } from './edit-project-dialog-view'
import {
  githubDisconnectedProjectHomeFixture,
  localOnlyProjectHomeFixture,
  repositoryConnectedProjectHomeFixture,
  repositoryLinkNeededProjectHomeFixture,
  summariesEmptyProjectHomeFixture,
  summariesErrorProjectHomeFixture,
  summariesLoadingProjectHomeFixture,
  trustOffProjectHomeFixture,
  trustOnProjectHomeFixture
} from './project-home-screen.fixtures'
import { ProjectHomeScreen } from './project-home-screen'

describe('Project Home story fixtures', () => {
  it.each([
    ['local-only', localOnlyProjectHomeFixture, 'Local Project'],
    ['GitHub disconnected', githubDisconnectedProjectHomeFixture, 'Connect GitHub'],
    ['repository link needed', repositoryLinkNeededProjectHomeFixture, 'Link GitHub repository'],
    ['repository connected', repositoryConnectedProjectHomeFixture, 'bity-labs/spacezero']
  ])('renders the %s state', (_name, fixture, expectedText) => {
    render(<ProjectHomeScreen {...fixture} />)
    expect(screen.getByRole('heading', { name: expectedText })).toBeInTheDocument()
  })

  it('renders loading, error, and empty Issue and Pull Request summaries', () => {
    const { rerender } = render(<ProjectHomeScreen {...summariesLoadingProjectHomeFixture} />)
    expect(screen.getByRole('status', { name: 'Loading Recent Issues' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading Open Pull Requests' })).toBeInTheDocument()

    rerender(<ProjectHomeScreen {...summariesErrorProjectHomeFixture} />)
    expect(screen.getByText('Issues could not be loaded.')).toBeInTheDocument()
    expect(screen.getByText('Pull Requests could not be loaded.')).toBeInTheDocument()

    rerender(<ProjectHomeScreen {...summariesEmptyProjectHomeFixture} />)
    expect(screen.getByText('No Issues to show.')).toBeInTheDocument()
    expect(screen.getByText('No Pull Requests to show.')).toBeInTheDocument()
  })

  it('renders trust off and trust on states', () => {
    const { rerender } = render(<ProjectHomeScreen {...trustOffProjectHomeFixture} />)
    expect(
      screen.getByRole('checkbox', { name: /Trust project agent resources/ })
    ).not.toBeChecked()

    rerender(<ProjectHomeScreen {...trustOnProjectHomeFixture} />)
    expect(screen.getByRole('checkbox', { name: /Trust project agent resources/ })).toBeChecked()
  })
})

describe('Project dialog story fixtures', () => {
  it('renders Add Project default, saving, and error states', () => {
    const { rerender } = render(<AddProjectDialogView {...addProjectDefaultFixture} />)
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled()

    rerender(<AddProjectDialogView {...addProjectSavingFixture} />)
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled()

    rerender(<AddProjectDialogView {...addProjectErrorFixture} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not create project.')
  })

  it('renders Edit Project default, saving, and error states', () => {
    const { rerender } = render(<EditProjectDialogView {...editProjectDefaultFixture} />)
    expect(screen.getByLabelText('Project name')).toHaveValue('Space Zero')

    rerender(<EditProjectDialogView {...editProjectSavingFixture} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    rerender(<EditProjectDialogView {...editProjectErrorFixture} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Could not update project.')
  })
})
