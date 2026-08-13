import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle
} from './confirmation'

const meta = {
  title: 'Design System/Primitives/Confirmation',
  component: Confirmation,
  args: {
    approval: { id: 'approval-1' },
    state: 'approval-requested'
  },
  render: (args) => (
    <Confirmation {...args} className="w-96">
      <ConfirmationRequest>
        <ConfirmationTitle>Allow this tool to update the selected file?</ConfirmationTitle>
        <ConfirmationActions>
          <ConfirmationAction variant="outline">Deny</ConfirmationAction>
          <ConfirmationAction>Allow</ConfirmationAction>
        </ConfirmationActions>
      </ConfirmationRequest>
    </Confirmation>
  )
} satisfies Meta<typeof Confirmation>

export default meta

type Story = StoryObj<typeof meta>

export const ApprovalRequested: Story = {}
