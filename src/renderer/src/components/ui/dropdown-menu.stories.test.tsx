import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import * as stories from './dropdown-menu.stories'

const { Default } = composeStories(stories)

describe('DropdownMenu stories', () => {
  it('renders the labelled menu group without Base UI context errors', async () => {
    render(<Default />)

    expect(await screen.findByText('Project')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument()
  })
})
