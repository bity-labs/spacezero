import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  PromptInput,
  PromptInputAddAttachmentButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools
} from './prompt-input'

const meta = {
  title: 'Design System/Primitives/Prompt Input',
  component: PromptInput,
  args: {
    onSubmit: () => undefined
  },
  render: (args) => (
    <PromptInput {...args} className="w-[32rem]">
      <PromptInputTextarea placeholder="Ask the agent anything..." />
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputAddAttachmentButton aria-label="Add attachment" />
        </PromptInputTools>
        <PromptInputSubmit />
      </PromptInputFooter>
    </PromptInput>
  )
} satisfies Meta<typeof PromptInput>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
