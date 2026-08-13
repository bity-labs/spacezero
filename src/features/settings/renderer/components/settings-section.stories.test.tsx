import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import * as stories from './settings-section.stories'

const { Appearance } = composeStories(stories)

describe('SettingsSection stories', () => {
  it('renders realistic Settings rows with representative controls', async () => {
    const user = userEvent.setup()
    render(<Appearance />)

    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.getByText('Theme')).toBeInTheDocument()

    const themeSelect = screen.getByRole('combobox', { name: 'Theme' })
    expect(themeSelect).toHaveTextContent('Dark')

    await user.click(themeSelect)
    await user.click(screen.getByRole('option', { name: 'Light' }))

    expect(themeSelect).toHaveTextContent('Light')
    expect(screen.getByText('Use thin font anti-aliasing')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Use thin font anti-aliasing' })).toBeInTheDocument()
    expect(screen.getByText('Changes apply immediately.')).toBeInTheDocument()
  })
})
