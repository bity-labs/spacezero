import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'

import * as stories from './settings-page-header.stories'

const { Default } = composeStories(stories)

describe('SettingsPageHeader stories', () => {
  it('renders realistic local Settings copy from the real component', () => {
    render(<Default />)

    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument()
    expect(
      screen.getByText('Choose how Space Zero behaves across your workspace.')
    ).toBeInTheDocument()
  })
})
