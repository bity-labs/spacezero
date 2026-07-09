import { fireEvent, render, screen } from '@testing-library/react'

import { ToolCallBlock } from './tool-call-block'

describe('ToolCallBlock', () => {
  it('renders tool name, arguments, streaming output, and final result', () => {
    render(
      <ToolCallBlock
        toolCall={{
          id: 'call-1',
          toolName: 'workspace.getStatus',
          arguments: { includeProjects: true },
          output: 'Loading status…',
          result: 'Workspace is ready.',
          status: 'completed'
        }}
      />
    )

    expect(screen.getByText('workspace.getStatus')).toBeInTheDocument()
    expect(screen.getByText(/includeProjects/)).toBeInTheDocument()
    expect(screen.getByText('Loading status…')).toBeInTheDocument()
    expect(screen.getByText('Workspace is ready.')).toBeInTheDocument()
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('shows an error state', () => {
    render(
      <ToolCallBlock
        toolCall={{ id: 'call-1', toolName: 'bash', arguments: 'pnpm test', error: 'Command failed', status: 'error' }}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Command failed')
  })

  it('supports collapsed and expanded disclosure', () => {
    render(
      <ToolCallBlock
        defaultExpanded={false}
        toolCall={{ id: 'call-1', toolName: 'read', arguments: 'README.md', output: 'file contents', status: 'running' }}
      />
    )

    expect(screen.queryByText('file contents')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /read/ }))
    expect(screen.getByText('file contents')).toBeInTheDocument()
  })
})
