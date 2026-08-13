import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'

import * as stories from './general-settings-screen.stories'

const { Default, LoadingWithErrors } = composeStories(stories)

describe('GeneralSettingsScreen stories', () => {
  it('renders the default mocked visual state', () => {
    render(<Default />)

    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveTextContent('English')
    expect(screen.getByText('~/SpaceZero')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Confirm before terminating live terminals' })
    ).toBeChecked()
  })

  it('renders a non-default loading, disabled, and error state', () => {
    render(<LoadingWithErrors />)

    expect(screen.getByRole('combobox', { name: 'Language' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Open chat links in' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Primary Git action' })).toBeDisabled()
    expect(screen.getByText('Loading language settings…')).toBeInTheDocument()
    expect(screen.getByText('Loading storage location…')).toBeInTheDocument()
    expect(screen.getByText('Could not update language preference.')).toBeInTheDocument()
    expect(screen.getByText('Could not update terminal safety settings.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Browser data could not be cleared')
  })
})
