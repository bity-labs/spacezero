import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import type { AiChatThinkingLevel } from './ai-chat.types'
import { ThinkingSelector } from './thinking-selector'

const meta = {
  title: 'Design System/Components/Agent Chat/Prompt Input/Thinking Selector',
  component: ThinkingSelector,
  decorators: [
    (Story) => (
      <div className="flex w-[360px] items-center gap-3 rounded-3xl border bg-muted/80 p-4">
        <Story />
      </div>
    )
  ],
  args: {
    value: 'medium',
    onChange: () => undefined
  }
} satisfies Meta<typeof ThinkingSelector>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const InteractiveCycle: Story = {
  render: (args) => <InteractiveThinkingSelector {...args} />
}

export const LimitedLevels: Story = {
  args: {
    value: 'off',
    availableLevels: ['off', 'low', 'high']
  },
  render: (args) => <InteractiveThinkingSelector {...args} />
}

export const Disabled: Story = {
  args: {
    value: 'high',
    disabled: true
  }
}

function InteractiveThinkingSelector(args: React.ComponentProps<typeof ThinkingSelector>) {
  const [value, setValue] = useState<AiChatThinkingLevel>(args.value)

  return (
    <div className="flex items-center gap-3">
      <ThinkingSelector {...args} value={value} onChange={setValue} />
      <span className="text-xs text-muted-foreground">Click to cycle thinking level.</span>
    </div>
  )
}
