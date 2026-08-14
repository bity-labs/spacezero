import { render } from '@testing-library/react'

import { PromptSuggestionItem, PromptSuggestionMenu } from './prompt-suggestion-menu'

describe('PromptSuggestionItem', () => {
  it('scrolls the selected item into view for keyboard navigation', () => {
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView

    try {
      render(
        <PromptSuggestionMenu id="suggestions" label="Suggestions">
          <PromptSuggestionItem icon={<span />} title="First" onSelect={vi.fn()} />
          <PromptSuggestionItem icon={<span />} title="Selected" selected onSelect={vi.fn()} />
        </PromptSuggestionMenu>
      )

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView
    }
  })
})
