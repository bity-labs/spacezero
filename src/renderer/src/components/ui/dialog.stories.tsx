import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './dialog'

const meta = {
  title: 'Design System/Primitives/Dialog',
  component: Dialog,
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project session</DialogTitle>
          <DialogDescription>Start a focused workspace for this task.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button>Create session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} satisfies Meta<typeof Dialog>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
