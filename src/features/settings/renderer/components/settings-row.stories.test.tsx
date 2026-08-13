import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'

import * as stories from './settings-row.stories'

const { LanguagePreference } = composeStories(stories)

describe('SettingsRow stories', () => {
  it('renders realistic Settings copy with a representative control', () => {
    render(<LanguagePreference />)

    expect(screen.getByText('Language')).toBeInTheDocument()
    expect(screen.getByText('Choose the language used in Space Zero.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument()
  })
})
