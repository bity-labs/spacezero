import type { Meta, StoryObj } from '@storybook/react-vite'

import { Alert, AlertAction, AlertDescription, AlertTitle } from './alert'
import { Button } from './button'

const meta = {
  title: 'Design System/Primitives/Alert',
  component: Alert,
  render: () => (
    <Alert className="w-96">
      <AlertTitle>Update available</AlertTitle>
      <AlertDescription>A new version is ready to install.</AlertDescription>
      <AlertAction>
        <Button size="sm">Restart</Button>
      </AlertAction>
    </Alert>
  )
} satisfies Meta<typeof Alert>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
