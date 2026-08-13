import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

const meta = {
  title: 'Design System/Primitives/Tooltip',
  component: Tooltip,
  render: () => (
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger render={<Button variant="outline" />}>Hover for details</TooltipTrigger>
        <TooltipContent>Open project</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
} satisfies Meta<typeof Tooltip>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
