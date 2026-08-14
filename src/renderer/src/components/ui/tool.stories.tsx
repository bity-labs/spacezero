import type { Meta, StoryObj } from '@storybook/react-vite'

import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from './tool'

const meta = {
  title: 'Design System/Components/Agent Chat/Tool',
  component: Tool,
  render: () => (
    <Tool defaultOpen className="w-[32rem]">
      <ToolHeader type="tool-read" title="Read file" state="output-available" />
      <ToolContent>
        <ToolInput input={{ path: 'src/renderer/src/app.tsx' }} />
        <ToolOutput output="File read successfully." />
      </ToolContent>
    </Tool>
  )
} satisfies Meta<typeof Tool>

export default meta

type Story = StoryObj<typeof meta>

export const Complete: Story = {}
