import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from './command'

const meta = {
  title: 'Design System/Primitives/Command',
  component: Command,
  render: () => (
    <Command className="w-80 border">
      <CommandInput placeholder="Search commands" />
      <CommandList>
        <CommandEmpty>No commands found.</CommandEmpty>
        <CommandGroup heading="Workspace">
          <CommandItem>
            Open project <CommandShortcut>⌘O</CommandShortcut>
          </CommandItem>
          <CommandItem>
            New session <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
} satisfies Meta<typeof Command>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
