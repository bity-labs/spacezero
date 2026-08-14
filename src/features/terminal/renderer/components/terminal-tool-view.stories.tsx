import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  commandRunningTerminalToolFixture,
  detectedBrowserLinkTerminalToolFixture,
  failedToStartTerminalToolFixture,
  readyEmptyTerminalToolFixture,
  sampleOutputTerminalToolFixture,
  startingTerminalToolFixture,
  unavailableTerminalToolFixture
} from './terminal-tool-view.fixtures'
import { TerminalToolView } from './terminal-tool-view'

const meta = {
  title: 'Screens/Terminal/Tool',
  component: TerminalToolView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen min-h-[480px] w-screen min-w-[640px] bg-background">
        <Story />
      </div>
    )
  ],
  args: readyEmptyTerminalToolFixture
} satisfies Meta<typeof TerminalToolView>

export default meta

type Story = StoryObj<typeof meta>

export const Starting: Story = { args: startingTerminalToolFixture }
export const ReadyEmpty: Story = {}
export const SampleOutput: Story = { args: sampleOutputTerminalToolFixture }
export const CommandRunning: Story = { args: commandRunningTerminalToolFixture }
export const FailedToStart: Story = { args: failedToStartTerminalToolFixture }
export const TerminalUnavailable: Story = { args: unavailableTerminalToolFixture }
export const DetectedBrowserLink: Story = { args: detectedBrowserLinkTerminalToolFixture }
