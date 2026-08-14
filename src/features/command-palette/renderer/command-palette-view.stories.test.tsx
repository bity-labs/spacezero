import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'

import * as stories from './command-palette-view.stories'

const {
  DefaultOpen,
  DisabledUnavailableCommand,
  GroupedCommands,
  NoResults,
  SearchResults,
  ShortcutDisplay
} = composeStories(stories)

describe('CommandPaletteView stories', () => {
  it('covers every required visual state without an App Command Registry runtime', () => {
    const defaultOpen = render(<DefaultOpen />)
    expect(screen.getByRole('dialog', { name: 'Command Palette' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Go to Projects/ })).toBeInTheDocument()
    defaultOpen.unmount()

    const searchResults = render(<SearchResults />)
    expect(screen.getByRole('combobox', { name: 'Search commands' })).toHaveValue('settings')
    expect(screen.getByRole('option', { name: /Open Settings/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Go to Projects/ })).not.toBeInTheDocument()
    searchResults.unmount()

    const noResults = render(<NoResults />)
    expect(screen.getByText('No commands found.')).toBeInTheDocument()
    noResults.unmount()

    const grouped = render(<GroupedCommands />)
    expect(screen.getByRole('group', { name: 'Navigation' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Sessions' })).toBeInTheDocument()
    grouped.unmount()

    const shortcuts = render(<ShortcutDisplay />)
    expect(screen.getByText('⌘K')).toBeInTheDocument()
    expect(screen.getByText('⌘B')).toBeInTheDocument()
    shortcuts.unmount()

    render(<DisabledUnavailableCommand />)
    expect(screen.getByRole('option', { name: /Clone Repository/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(screen.getByText('Unavailable while GitHub is disconnected')).toBeInTheDocument()
  })
})
