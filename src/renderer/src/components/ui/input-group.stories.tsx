import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText
} from './input-group'

const meta = {
  title: 'Design System/Primitives/Input Group',
  component: InputGroup,
  render: () => (
    <InputGroup className="w-80">
      <InputGroupAddon>
        <MagnifyingGlassIcon />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search files" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>⌘K</InputGroupText>
        <InputGroupButton>Clear</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
} satisfies Meta<typeof InputGroup>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
