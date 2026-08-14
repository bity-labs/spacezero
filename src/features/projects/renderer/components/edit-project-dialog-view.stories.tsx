import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  editProjectDefaultFixture,
  editProjectErrorFixture,
  editProjectSavingFixture
} from './project-dialog.fixtures'
import { EditProjectDialogView } from './edit-project-dialog-view'

const meta = {
  title: 'Features/Projects/Components/Edit Project Dialog',
  component: EditProjectDialogView,
  parameters: { layout: 'fullscreen' },
  args: editProjectDefaultFixture
} satisfies Meta<typeof EditProjectDialogView>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Saving: Story = {
  args: editProjectSavingFixture
}

export const Error: Story = {
  args: editProjectErrorFixture
}
