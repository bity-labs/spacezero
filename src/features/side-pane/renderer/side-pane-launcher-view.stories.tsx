import { FileCode, GitDiff, Globe, TerminalWindow } from '@phosphor-icons/react'
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import type { SidePaneCategoryDescriptor } from './side-pane-shell'
import { SidePaneLauncherView } from './side-pane-shell-view'
import type { SidePaneCategoryId } from './side-pane-store'

const launcherCategories: readonly SidePaneCategoryDescriptor[] = [
  { id: 'files', label: 'Files', available: true, icon: FileCode },
  { id: 'git', label: 'Git Diff', available: true, icon: GitDiff },
  { id: 'browser', label: 'Browser', available: true, icon: Globe },
  { id: 'terminal', label: 'Terminal', available: true, icon: TerminalWindow }
]

const launcherWithUnavailableCategory: readonly SidePaneCategoryDescriptor[] = [
  { id: 'files', label: 'Files', available: true, icon: FileCode },
  { id: 'git', label: 'Git Diff', available: false, icon: GitDiff },
  { id: 'browser', label: 'Browser', available: true, icon: Globe },
  { id: 'terminal', label: 'Terminal', available: true, icon: TerminalWindow }
]

const meta = {
  title: 'Design System/Components/Side Pane/Launcher',
  component: SidePaneLauncherView,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div
        className="relative flex overflow-hidden rounded-xl border bg-background"
        style={{ width: 560, height: 320 }}
      >
        <main className="flex min-w-0 flex-1 items-center justify-center bg-muted/20 p-8 pr-20 text-center">
          <div className="max-w-xs">
            <p className="text-sm font-medium">Collapsed Side Pane</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The Side Pane launcher floats on the workspace edge while the pane is collapsed.
            </p>
          </div>
        </main>
        <Story />
      </div>
    )
  ],
  args: {
    categories: launcherCategories,
    onSelect: () => undefined
  }
} satisfies Meta<typeof SidePaneLauncherView>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithUnavailableCategory: Story = {
  args: {
    categories: launcherWithUnavailableCategory
  }
}

export const InteractiveSelection: Story = {
  render: (args) => <InteractiveLauncherStory {...args} />
}

function InteractiveLauncherStory(args: React.ComponentProps<typeof SidePaneLauncherView>) {
  const [selectedCategory, setSelectedCategory] = useState<SidePaneCategoryId | null>(null)

  return (
    <>
      <SidePaneLauncherView {...args} onSelect={setSelectedCategory} />
      <div className="absolute bottom-3 left-3 rounded-md border bg-background/95 px-3 py-2 text-xs shadow-sm">
        Selected: <span className="font-medium text-foreground">{selectedCategory ?? 'none'}</span>
      </div>
    </>
  )
}
