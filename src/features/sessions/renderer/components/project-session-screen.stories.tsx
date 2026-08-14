import type { Meta, StoryObj } from '@storybook/react-vite'

import { AgentChatView, type AgentChatViewProps } from '@renderer/components/agent-chat-view'
import {
  projectSessionClearedFixture,
  projectSessionErrorFixture,
  projectSessionHistoryFixture,
  projectSessionReadyFixture,
  projectSessionResumedFixture,
  projectSessionRunningFixture
} from './session-host-screen.fixtures'
import { SessionHostScreen } from './session-host-screen'

const noOp = (): void => undefined

const meta = {
  title: 'Features/Sessions/Screens/Project Session',
  component: SessionHostScreen,
  decorators: [
    (Story) => (
      <div className="flex h-[720px] w-[900px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-background shadow-sm">
        <Story />
      </div>
    )
  ],
  args: {
    label: 'Project Session',
    state: { kind: 'loading', message: 'Restoring Project Session chat…' }
  }
} satisfies Meta<typeof SessionHostScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Restoring: Story = {}

export const ReadyIdle: Story = {
  render: () => renderProjectSession(projectSessionReadyFixture)
}

export const Running: Story = {
  render: () => renderProjectSession(projectSessionRunningFixture)
}

export const Error: Story = {
  render: () =>
    renderProjectSession(
      projectSessionErrorFixture,
      'Unable to submit prompt: agent runtime unavailable. Your previous chat is still current.'
    )
}

export const HistoryOpen: Story = {
  render: () => renderProjectSession(projectSessionHistoryFixture)
}

export const ClearedChatContext: Story = {
  render: () => renderProjectSession(projectSessionClearedFixture)
}

export const ResumedChatContext: Story = {
  render: () => renderProjectSession(projectSessionResumedFixture)
}

function renderProjectSession(chatProps: AgentChatViewProps, alert?: string): React.JSX.Element {
  return (
    <SessionHostScreen
      label="Project Session"
      state={{
        kind: 'ready',
        alert,
        content: (
          <AgentChatView
            {...chatProps}
            onSubmit={noOp}
            onCommand={noOp}
            onHistorySelect={noOp}
            onHistoryDismiss={noOp}
            onAbort={noOp}
            onModelChange={noOp}
            onThinkingChange={noOp}
            onToolConfirmationResolve={noOp}
            onOpenLink={noOp}
          />
        )
      }}
    />
  )
}
