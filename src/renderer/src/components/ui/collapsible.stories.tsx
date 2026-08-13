import type { Meta, StoryObj } from '@storybook/react-vite'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible'

const meta = {
  title: 'Design System/Primitives/Collapsible',
  component: Collapsible,
  render: () => (
    <Collapsible defaultOpen className="w-80 rounded-md border p-3">
      <CollapsibleTrigger className="font-medium">Session details</CollapsibleTrigger>
      <CollapsibleContent className="pt-2 text-sm text-muted-foreground">
        Running on the current project branch.
      </CollapsibleContent>
    </Collapsible>
  )
} satisfies Meta<typeof Collapsible>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
