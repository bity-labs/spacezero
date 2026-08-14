import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import * as stories from './settings-layout.stories'

const {
  General,
  Models,
  GitHubAccount,
  AppearanceSelected,
  AboutSelected,
  NarrowSidebar,
  WideSidebar
} = composeStories(stories)

describe('Settings layout stories', () => {
  it.each([
    ['General', General, 'Space Zero Home'],
    ['Models', Models, 'Providers'],
    ['Account', GitHubAccount, '@octocat'],
    ['Appearance', AppearanceSelected, 'Choose the interface typeface.'],
    ['About', AboutSelected, 'Restart ready']
  ])('renders the real %s screen inside the pure Settings layout', (_name, Story, text) => {
    render(<Story />)

    expect(screen.getByRole('main', { name: 'Settings content' })).toHaveTextContent(text)
    expect(screen.getByRole('list', { name: 'Settings navigation' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Account menu' })).toBeInTheDocument()
  })

  it.each([
    ['narrow', NarrowSidebar, '220px'],
    ['wide', WideSidebar, '320px']
  ])('renders the %s sidebar layout width variant', (_name, Story, width) => {
    render(<Story />)

    expect(screen.getByRole('complementary')).toHaveStyle({ width })
  })
})
