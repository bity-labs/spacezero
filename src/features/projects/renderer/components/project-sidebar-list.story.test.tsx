import { render, screen } from '@testing-library/react'
import { composeStories } from '@storybook/react-vite'

import * as stories from './project-sidebar-list.stories'

const { Empty } = composeStories(stories)

describe('ProjectSidebarList Storybook story', () => {
  it('renders a translated app component without the desktop bridge', () => {
    Object.defineProperty(window, 'spacezero', {
      configurable: true,
      get: () => {
        throw new Error('Storybook stories must not access window.spacezero')
      }
    })

    render(<Empty />)

    expect(screen.getByText('No projects yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add project' })).toBeInTheDocument()
  })
})
