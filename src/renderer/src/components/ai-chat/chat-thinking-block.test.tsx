import { fireEvent, render, screen } from '@testing-library/react'

import { ChatThinkingBlock } from './chat-thinking-block'

describe('ChatThinkingBlock', () => {
  it('keeps streaming thinking content collapsed by default', () => {
    render(
      <ChatThinkingBlock
        part={{
          type: 'thinking',
          text: 'Inspecting the workspace.',
          state: 'streaming',
          collapsed: true
        }}
      />
    )

    expect(screen.getByRole('button', { name: /Thinking/i })).toBeInTheDocument()
    expect(screen.queryByText('Inspecting the workspace.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Thinking/i }))

    expect(screen.getByText('Inspecting the workspace.')).toBeInTheDocument()
  })
})
