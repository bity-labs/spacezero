import { BookOpenText, Command, FileText, Sparkle } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import { PromptSuggestionItem } from './prompt-suggestion-menu'

const meta = {
  title: 'Design System/Components/Agent Chat/Prompt Input/Prompt Suggestion Item',
  component: PromptSuggestionItem,
  decorators: [
    (Story) => (
      <div className="w-[720px] max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
        <Story />
      </div>
    )
  ],
  args: {
    onSelect: () => undefined
  }
} satisfies Meta<typeof PromptSuggestionItem>

export default meta

type Story = StoryObj<typeof meta>

export const CommandOption: Story = {
  args: {
    icon: <Command data-command-icon="true" className="size-4" />,
    title: 'Clear',
    description: 'Start a fresh Project Session Chat Context.',
    suffix: 'command'
  }
}

export const SelectedCommandOption: Story = {
  args: {
    ...CommandOption.args,
    selected: true
  }
}

export const SkillOption: Story = {
  args: {
    icon: <Sparkle className="size-4" />,
    title: 'break-architecture-into-issues',
    description:
      'Break an architecture opportunity issue into ready-for-agent refactor task issues.',
    suffix: 'project'
  }
}

export const KnowledgeBaseMentionOption: Story = {
  args: {
    icon: <BookOpenText className="size-4" />,
    title: 'agent-workflow.md',
    description: 'areas/space-zero/agent-workflow.md',
    selected: true
  }
}

export const ChatContextHistoryOption: Story = {
  args: {
    icon: <FileText className="size-4" />,
    title: 'Rework the Agent Chat slash command picker',
    titleClassName: 'truncate',
    children: (
      <span className="mt-0.5 block text-xs text-muted-foreground">Aug 14, 2026, 3:01 PM</span>
    )
  }
}

export const DisabledOption: Story = {
  args: {
    ...SkillOption.args,
    disabled: true
  }
}
