import type { Meta, StoryObj } from '@storybook/react-vite'

import { Reasoning, ReasoningContent, ReasoningTrigger } from './reasoning'

const meta = {
  title: 'Design System/Components/Agent Chat/Reasoning',
  component: Reasoning,
  render: () => (
    <Reasoning defaultOpen duration={4} className="w-96">
      <ReasoningTrigger />
      <ReasoningContent>
        {'I checked the project state and compared the available validation results.'}
      </ReasoningContent>
    </Reasoning>
  )
} satisfies Meta<typeof Reasoning>

export default meta

type Story = StoryObj<typeof meta>

export const Complete: Story = {}
