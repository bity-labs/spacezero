import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  addProjectDefaultFixture,
  addProjectErrorFixture,
  addProjectSavingFixture
} from './project-dialog.fixtures'
import { AddProjectDialogView } from './add-project-dialog-view'

const meta = {
  title: 'Projects/Building Blocks/Add Project Dialog',
  component: AddProjectDialogView,
  parameters: { layout: 'fullscreen' },
  args: addProjectDefaultFixture
} satisfies Meta<typeof AddProjectDialogView>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Saving: Story = {
  args: addProjectSavingFixture
}

export const Error: Story = {
  args: addProjectErrorFixture
}
