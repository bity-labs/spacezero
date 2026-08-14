import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  defaultOpenCommandPaletteFixture,
  groupedCommandsCommandPaletteFixture,
  noResultsCommandPaletteFixture,
  searchResultsCommandPaletteFixture,
  shortcutDisplayCommandPaletteFixture,
  unavailableCommandPaletteFixture
} from './command-palette-view.fixtures'
import { CommandPaletteView } from './command-palette-view'

const meta = {
  title: 'App Shell/Components/Command Palette/Complete',
  component: CommandPaletteView,
  parameters: { layout: 'fullscreen' },
  args: defaultOpenCommandPaletteFixture
} satisfies Meta<typeof CommandPaletteView>

export default meta

type Story = StoryObj<typeof meta>

export const DefaultOpen: Story = {}

export const SearchResults: Story = {
  args: searchResultsCommandPaletteFixture
}

export const NoResults: Story = {
  args: noResultsCommandPaletteFixture
}

export const GroupedCommands: Story = {
  args: groupedCommandsCommandPaletteFixture
}

export const ShortcutDisplay: Story = {
  args: shortcutDisplayCommandPaletteFixture
}

export const DisabledUnavailableCommand: Story = {
  args: unavailableCommandPaletteFixture
}
