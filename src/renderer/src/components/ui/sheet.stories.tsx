import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from './sheet'

const meta = {
  title: 'Design System/Primitives/Sheet',
  component: Sheet,
  render: () => (
    <Sheet defaultOpen>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Session details</SheetTitle>
          <SheetDescription>Inspect this project session.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
} satisfies Meta<typeof Sheet>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
