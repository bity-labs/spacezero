import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  changedDiffViewerItems,
  collapsedDiffViewerItems,
  deletedDiffViewerItems,
  newDiffViewerItems,
  renamedDiffViewerItems,
  stackedDiffViewerItems,
  unrenderableDiffViewerItems
} from './diff-viewer.fixtures'
import { DiffViewer } from './diff-viewer'

const meta = {
  title: 'Git/Building Blocks/Diff Viewer',
  component: DiffViewer,
  decorators: [
    (Story) => (
      <div className="h-[680px] w-[920px] max-w-[calc(100vw-2rem)] overflow-auto rounded-lg bg-background p-4">
        <Story />
      </div>
    )
  ],
  args: {
    ariaLabel: 'Storybook Diff Viewer',
    items: changedDiffViewerItems
  }
} satisfies Meta<typeof DiffViewer>

export default meta

type Story = StoryObj<typeof meta>

export const ChangedFile: Story = {}
export const NewFile: Story = { args: { items: newDiffViewerItems } }
export const DeletedFile: Story = { args: { items: deletedDiffViewerItems } }
export const RenamedFile: Story = { args: { items: renamedDiffViewerItems } }
export const StackedFiles: Story = { args: { items: stackedDiffViewerItems } }
export const Collapsed: Story = { args: { items: collapsedDiffViewerItems } }
export const Unrenderable: Story = {
  args: {
    fallbackMessage: 'Binary content cannot be rendered as a text diff.',
    items: unrenderableDiffViewerItems
  }
}
