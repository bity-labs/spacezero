import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { ChatThinkingBlock } from './chat-thinking-block'

afterEach(() => {
  vi.useRealTimers()
})

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

  it('stays open when the user opens completed thinking that streamed while collapsed', () => {
    vi.useFakeTimers()

    const { rerender } = render(
      <ChatThinkingBlock
        part={{
          type: 'thinking',
          text: 'Inspecting the workspace.',
          state: 'streaming',
          collapsed: true
        }}
      />
    )

    rerender(
      <ChatThinkingBlock
        part={{
          type: 'thinking',
          text: 'Inspecting the workspace.',
          state: 'complete',
          collapsed: true
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Thinking|Thought/i }))
    expect(screen.getByText('Inspecting the workspace.')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByText('Inspecting the workspace.')).toBeInTheDocument()
  })
})
