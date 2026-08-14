import type { Meta, StoryObj } from '@storybook/react-vite'

import type { SidePaneTab } from './side-pane-store'
import { sidePaneStoryCategories } from './side-pane-shell-view.fixtures'
import { SidePaneTabStripView } from './side-pane-shell-view'

const noOp = (): void => undefined

const tabs = [
  {
    id: 'files:app',
    categoryId: 'files',
    resourceId: 'src/renderer/src/app.tsx',
    label: 'app.tsx'
  },
  {
    id: 'files:readme',
    categoryId: 'files',
    resourceId: 'README.md',
    label: 'README.md',
    preview: true
  },
  {
    id: 'files:settings',
    categoryId: 'files',
    resourceId: 'src/features/settings/settings-screen.tsx',
    label: 'settings-screen.tsx',
    dirty: true
  },
  {
    id: 'browser:docs',
    categoryId: 'browser',
    title: 'Space Zero Docs'
  },
  {
    id: 'terminal:dev',
    categoryId: 'terminal',
    label: 'pnpm dev'
  },
  {
    id: 'git:working-tree',
    categoryId: 'git',
    label: 'Working Changes'
  }
] satisfies SidePaneTab[]

const meta = {
  title: 'Design System/Components/Side Pane/Tabs',
  component: SidePaneTabStripView,
  decorators: [
    (Story) => (
      <div className="w-[36rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-t-lg border bg-background">
        <Story />
      </div>
    )
  ],
  args: {
    activeTabId: tabs[1].id,
    categories: sidePaneStoryCategories,
    categoryMru: {
      files: tabs[1].id,
      browser: tabs[3].id,
      terminal: tabs[4].id,
      git: tabs[5].id
    },
    contextKey: 'session:side-pane-tabs-story',
    tabs: tabs.slice(0, 3),
    onActivate: noOp,
    onClose: noOp,
    onCreateCategory: noOp,
    onReorder: noOp
  }
} satisfies Meta<typeof SidePaneTabStripView>

export default meta

type Story = StoryObj<typeof meta>

export const PreviewTab: Story = {}

export const DirtyTab: Story = {
  args: {
    activeTabId: tabs[2].id
  }
}

export const ManyTabs: Story = {
  args: {
    activeTabId: tabs[3].id,
    tabs
  }
}

export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-80 overflow-hidden rounded-t-lg border bg-background">
        <Story />
      </div>
    )
  ],
  args: {
    activeTabId: tabs[3].id,
    tabs
  }
}
