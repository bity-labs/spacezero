import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Tab, TabBar } from './tab-bar'

describe('TabBar', () => {
  it('converts vertical wheel movement into hidden horizontal overflow scrolling', () => {
    render(
      <TabBar ariaLabel="Test tabs">
        <div>tabs</div>
      </TabBar>
    )

    const tablist = screen.getByRole('tablist', { name: 'Test tabs' })
    expect(tablist).toHaveClass('overflow-x-auto', 'no-scrollbar')

    fireEvent.wheel(tablist, { deltaY: 48 })

    expect(tablist.scrollLeft).toBe(48)
  })

  it('closes a tab on middle-click without selecting it', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <TabBar ariaLabel="Test tabs">
        <Tab label="One" selected={false} onSelect={onSelect} onClose={onClose} />
      </TabBar>
    )

    const tab = screen.getByRole('tab', { name: 'One' })
    fireEvent.mouseDown(tab, { button: 1 })
    fireEvent(tab, new MouseEvent('auxclick', { bubbles: true, button: 1 }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders the domain icon and scrolls a newly selected tab into view', () => {
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView

    try {
      const view = render(
        <TabBar ariaLabel="Test tabs">
          <Tab
            icon={<span data-testid="domain-icon">icon</span>}
            label="One"
            selected={false}
            onSelect={vi.fn()}
            onClose={vi.fn()}
          />
        </TabBar>
      )

      view.rerender(
        <TabBar ariaLabel="Test tabs">
          <Tab
            icon={<span data-testid="domain-icon">icon</span>}
            label="One"
            selected
            onSelect={vi.fn()}
            onClose={vi.fn()}
          />
        </TabBar>
      )

      expect(screen.getByTestId('domain-icon')).toBeInTheDocument()
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  it('wraps roving keyboard navigation and selects the focused tab', () => {
    const selectOne = vi.fn()
    const selectTwo = vi.fn()
    render(
      <TabBar ariaLabel="Test tabs">
        <Tab label="One" selected onSelect={selectOne} onClose={vi.fn()} />
        <Tab label="Two" selected={false} onSelect={selectTwo} onClose={vi.fn()} />
      </TabBar>
    )

    const one = screen.getByRole('tab', { name: 'One' })
    const two = screen.getByRole('tab', { name: 'Two' })
    one.focus()
    fireEvent.keyDown(one, { key: 'ArrowLeft' })

    expect(two).toHaveFocus()
    expect(selectTwo).toHaveBeenCalledOnce()
    expect(selectOne).not.toHaveBeenCalled()
  })
})
