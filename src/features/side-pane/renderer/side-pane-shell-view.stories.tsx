import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  activeTabFixture,
  browserActiveFixture,
  collapsedLauncherFixture,
  dirtyTabFixture,
  filesActiveFixture,
  gitDiffActiveFixture,
  manyTabsFixture,
  narrowPaneFixture,
  oneTabFixture,
  previewTabFixture,
  terminalActiveFixture,
  widePaneFixture
} from './side-pane-shell-view.fixtures'
import { SidePaneShellView } from './side-pane-shell-view'

const meta = {
  title: 'Side Pane/Shell',
  component: SidePaneShellView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-screen min-h-[560px] w-screen min-w-[800px]">
        <Story />
      </div>
    )
  ],
  args: oneTabFixture
} satisfies Meta<typeof SidePaneShellView>

export default meta

type Story = StoryObj<typeof meta>

export const CollapsedLauncher: Story = {
  args: collapsedLauncherFixture
}

export const OneTab: Story = {}

export const ManyTabs: Story = {
  args: manyTabsFixture
}

export const FilesActive: Story = {
  args: filesActiveFixture
}

export const BrowserActive: Story = {
  args: browserActiveFixture
}

export const TerminalActive: Story = {
  args: terminalActiveFixture
}

export const GitDiffActive: Story = {
  args: gitDiffActiveFixture
}

export const NarrowPane: Story = {
  args: narrowPaneFixture
}

export const WidePane: Story = {
  args: widePaneFixture
}

export const DirtyTab: Story = {
  args: dirtyTabFixture
}

export const PreviewTab: Story = {
  args: previewTabFixture
}

export const ActiveTab: Story = {
  args: activeTabFixture
}
