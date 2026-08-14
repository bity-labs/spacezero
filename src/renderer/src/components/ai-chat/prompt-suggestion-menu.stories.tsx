import { BookOpenText, Command, FileText, Sparkle } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  PromptSuggestionEmpty,
  PromptSuggestionItem,
  PromptSuggestionMenu
} from './prompt-suggestion-menu'

const meta = {
  title: 'Design System/Components/Agent Chat/Prompt Input/Prompt Suggestions',
  component: PromptSuggestionMenu,
  decorators: [
    (Story) => (
      <div className="flex h-[420px] w-[900px] max-w-[calc(100vw-2rem)] items-end bg-background p-8">
        <div className="relative w-full rounded-2xl border bg-muted/80 p-4 shadow-lg shadow-black/10">
          <Story />
          <div className="h-20 text-sm text-muted-foreground">/</div>
        </div>
      </div>
    )
  ]
} satisfies Meta<typeof PromptSuggestionMenu>

export default meta

type Story = StoryObj<typeof meta>

export const SlashCommandsAndSkills: Story = {
  args: {
    id: 'storybook-slash-suggestions',
    label: 'Available commands and skills',
    children: (
      <>
        <PromptSuggestionItem
          icon={<Command className="size-4" />}
          title="Clear"
          description="Start a fresh Project Session Chat Context."
          suffix="command"
          selected
          onSelect={() => undefined}
        />
        <PromptSuggestionItem
          icon={<Command className="size-4" />}
          title="Resume"
          description="Continue an older Project Session Chat Context."
          suffix="command"
          onSelect={() => undefined}
        />
        <PromptSuggestionItem
          icon={<Sparkle className="size-4" />}
          title="break-architecture-into-issues"
          description="Break an architecture opportunity issue into ready-for-agent refactor task issues."
          suffix="project"
          onSelect={() => undefined}
        />
        <PromptSuggestionItem
          icon={<Sparkle className="size-4" />}
          title="clarify-with-context"
          description="Clarify an idea or plan using the project's context, domain language, ADRs, and code."
          suffix="project"
          onSelect={() => undefined}
        />
      </>
    )
  }
}

export const KnowledgeBaseMentions: Story = {
  args: {
    id: 'storybook-knowledge-base-paths',
    label: 'Knowledge Base paths',
    children: (
      <>
        <PromptSuggestionItem
          icon={<BookOpenText className="size-4" />}
          title="agent-workflow.md"
          description="areas/space-zero/agent-workflow.md"
          selected
          onSelect={() => undefined}
        />
        <PromptSuggestionItem
          icon={<BookOpenText className="size-4" />}
          title="debugging-notes.md"
          description="resources/engineering/debugging-notes.md"
          onSelect={() => undefined}
        />
      </>
    )
  }
}

export const ChatContextHistory: Story = {
  args: {
    id: 'storybook-chat-context-history',
    label: 'Chat Context history',
    children: (
      <>
        <PromptSuggestionItem
          icon={<FileText className="size-4" />}
          title="Rework the Agent Chat slash command picker"
          titleClassName="truncate"
          selected
          onSelect={() => undefined}
        >
          <span className="mt-0.5 block text-xs text-muted-foreground">Aug 14, 2026, 3:01 PM</span>
        </PromptSuggestionItem>
        <PromptSuggestionItem
          icon={<FileText className="size-4" />}
          title="Review the Project Session chat architecture"
          titleClassName="truncate"
          onSelect={() => undefined}
        >
          <span className="mt-0.5 block text-xs text-muted-foreground">Aug 12, 2026, 10:20 AM</span>
        </PromptSuggestionItem>
      </>
    )
  }
}

export const Empty: Story = {
  args: {
    id: 'storybook-empty-suggestions',
    label: 'Available skills',
    children: <PromptSuggestionEmpty>No matching suggestions.</PromptSuggestionEmpty>
  }
}
