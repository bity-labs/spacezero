import type { Meta, StoryObj } from '@storybook/react-vite'

import { CodeText, Heading, Kbd, Text } from './typography'

const meta = {
  title: 'Design System/Primitives/Typography',
  component: Heading,
  render: () => (
    <div className="w-[32rem] space-y-3">
      <Heading as="h1" level="h1">
        Project workspace
      </Heading>
      <Text>Build, review, and ship from one focused workspace.</Text>
      <Text variant="muted">Last updated a few seconds ago.</Text>
      <div className="flex items-center gap-2 text-sm">
        Run <CodeText>pnpm dev</CodeText> or press <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </div>
    </div>
  )
} satisfies Meta<typeof Heading>

export default meta

type Story = StoryObj<typeof meta>

export const Scale: Story = {}
