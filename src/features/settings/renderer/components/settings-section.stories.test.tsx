import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'

import * as stories from './settings-section.stories'

const { Appearance } = composeStories(stories)

describe('SettingsSection stories', () => {
  it('renders realistic Settings rows with representative controls', () => {
    render(<Appearance />)

    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.getByText('Theme')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByText('Use thin font anti-aliasing')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Use thin font anti-aliasing' })).toBeInTheDocument()
    expect(screen.getByText('Changes apply immediately.')).toBeInTheDocument()
  })
})
