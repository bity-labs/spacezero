import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import * as stories from './settings-row.stories'

const { LanguagePreference } = composeStories(stories)

describe('SettingsRow stories', () => {
  it('renders realistic Settings copy with a representative control', async () => {
    const user = userEvent.setup()
    render(<LanguagePreference />)

    expect(screen.getByText('Language')).toBeInTheDocument()
    expect(screen.getByText('Choose the language used in Space Zero.')).toBeInTheDocument()

    const languageSelect = screen.getByRole('combobox', { name: 'Language' })
    expect(languageSelect).toHaveTextContent('System')

    await user.click(languageSelect)
    await user.click(screen.getByRole('option', { name: 'English' }))

    expect(languageSelect).toHaveTextContent('English')
  })
})
