import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from './card'

const meta = {
  title: 'Design System/Primitives/Card',
  component: Card,
  render: () => (
    <Card className="w-80 border">
      <CardHeader>
        <CardTitle>Project session</CardTitle>
        <CardDescription>Ready for the next task.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Open
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>All checks passed.</CardContent>
      <CardFooter>
        <Button size="sm">Continue</Button>
      </CardFooter>
    </Card>
  )
} satisfies Meta<typeof Card>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
