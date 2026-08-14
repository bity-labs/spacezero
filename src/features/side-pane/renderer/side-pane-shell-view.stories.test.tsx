import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import * as stories from './side-pane-shell-view.stories'

const { NarrowPane, PreviewTab } = composeStories(stories)

describe('Side Pane layout stories', () => {
  it.each([
    ['narrow pane', NarrowPane, ['app.tsx', 'settings-screen.tsx', 'README.md', 'Space Zero Docs']],
    ['preview tab', PreviewTab, ['app.tsx', 'README.md preview']]
  ])('renders %s tabs as peers above the active tool content', (_name, Story, tabNames) => {
    render(<Story />)

    const pane = screen.getByRole('complementary', { name: 'Side Pane' })
    const tablist = screen.getByRole('tablist', { name: 'Side Pane Tabs' })
    const panel = screen.getByRole('tabpanel')

    expect(pane).toContainElement(tablist)
    expect(pane).toContainElement(panel)
    expect([...pane.children].indexOf(tablist)).toBeLessThan([...pane.children].indexOf(panel))

    for (const tabName of tabNames) {
      expect(screen.getByRole('tab', { name: new RegExp(tabName) })).toBeInTheDocument()
    }
  })
})
