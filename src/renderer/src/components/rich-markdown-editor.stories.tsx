import type { Meta, StoryObj } from '@storybook/react-vite'

import { richMarkdownEditorFixture } from './rich-markdown-editor.fixtures'
import { RichMarkdownEditor } from './rich-markdown-editor'

const meta = {
  title: 'Design System/Components/Rich Markdown Editor',
  component: RichMarkdownEditor,
  decorators: [
    (Story) => (
      <div className="h-[680px] w-[820px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-background">
        <Story />
      </div>
    )
  ],
  args: richMarkdownEditorFixture
} satisfies Meta<typeof RichMarkdownEditor>

export default meta

type Story = StoryObj<typeof meta>

export const Document: Story = {}
