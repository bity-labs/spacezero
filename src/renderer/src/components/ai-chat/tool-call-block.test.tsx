import { render, screen } from '@testing-library/react'

import { ToolCallBlock } from './tool-call-block'

describe('ToolCallBlock', () => {
  it('renders tool name, state, input, and output', () => {
    render(
      <ToolCallBlock
        callId="call-1"
        toolName="workspace.getStatus"
        state="running"
        input={{ includeSessions: true }}
        output="Checking workspace"
      />
    )

    expect(screen.getByText('workspace.getStatus')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText(/includeSessions/)).toBeInTheDocument()
    expect(screen.getByText('Checking workspace')).toBeInTheDocument()
  })

  it('renders an error state and error text', () => {
    render(
      <ToolCallBlock
        callId="call-1"
        toolName="workspace.write"
        state="error"
        error="Permission denied"
      />
    )

    expect(screen.getAllByText('Error')).toHaveLength(2)
    expect(screen.getByText('Permission denied')).toBeInTheDocument()
  })
})
