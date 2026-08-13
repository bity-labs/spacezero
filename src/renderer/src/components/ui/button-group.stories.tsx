import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from './button-group'

const meta = {
  title: 'Design System/Primitives/Button Group',
  component: ButtonGroup,
  render: () => (
    <ButtonGroup>
      <Button variant="outline">Back</Button>
      <ButtonGroupSeparator />
      <ButtonGroupText>1 of 3</ButtonGroupText>
      <ButtonGroupSeparator />
      <Button variant="outline">Next</Button>
    </ButtonGroup>
  )
} satisfies Meta<typeof ButtonGroup>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
