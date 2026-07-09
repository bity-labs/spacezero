import { fireEvent, render, screen } from '@testing-library/react'

import { ToolCallBlock } from './tool-call-block'

describe('ToolCallBlock', () => {
  it('renders tool name, arguments, streaming output, and final result', () => {
    render(
      <ToolCallBlock
        callId="call-1"
        toolName="workspace.getStatus"
        input={{ includeProjects: true }}
        output="Workspace is ready."
        state="success"
        defaultExpanded
      />
    )

    expect(screen.getByText('workspace.getStatus')).toBeInTheDocument()
    expect(screen.getByText(/includeProjects/)).toBeInTheDocument()
    expect(screen.getByText('Workspace is ready.')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('shows an error state', () => {
    render(<ToolCallBlock callId="call-1" toolName="bash" input="pnpm test" error="Command failed" state="error" />)

    expect(screen.getByText('Command failed')).toBeInTheDocument()
  })

  it('defaults to collapsed after success and expanded while running', () => {
    const { rerender } = render(
      <ToolCallBlock callId="call-1" toolName="read" input="README.md" output="file contents" state="success" />
    )

    expect(screen.queryByText('file contents')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /read/ }))
    expect(screen.getByText('file contents')).toBeInTheDocument()

    rerender(<ToolCallBlock callId="call-2" toolName="write" input="README.md" output="writing" state="running" />)
    expect(screen.getByText('writing')).toBeInTheDocument()
  })
})
