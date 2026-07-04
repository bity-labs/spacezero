import { fireEvent, render, screen, within } from '@testing-library/react'

import { App } from './App'

describe('App', () => {
  it('renders a three-column base workspace layout', () => {
    render(<App />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Left panel' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Right panel' })).toBeInTheDocument()
    expect(screen.queryByText('Desktop foundation')).not.toBeInTheDocument()
  })

  it('toggles the side columns from the top bar corner buttons', () => {
    render(<App />)

    const topBar = screen.getByRole('banner')
    fireEvent.click(within(topBar).getByRole('button', { name: 'Hide left panel' }))
    fireEvent.click(within(topBar).getByRole('button', { name: 'Hide right panel' }))

    expect(screen.queryByRole('complementary', { name: 'Left panel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Right panel' })).not.toBeInTheDocument()
    expect(within(topBar).getByRole('button', { name: 'Show left panel' })).toBeInTheDocument()
    expect(within(topBar).getByRole('button', { name: 'Show right panel' })).toBeInTheDocument()
  })

  it('toggles between dark and light mode from the titlebar', () => {
    render(<App />)

    const topBar = screen.getByRole('banner')
    expect(within(topBar).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Hide left panel',
      'Switch to light mode',
      'Hide right panel'
    ])
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'dark' })

    fireEvent.click(within(topBar).getByRole('button', { name: 'Switch to light mode' }))

    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'light' })
    expect(within(topBar).getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
  })

  it('supports keyboard resizing for side columns', () => {
    render(<App />)

    const leftResize = screen.getByRole('separator', { name: 'Resize left panel' })
    const rightResize = screen.getByRole('separator', { name: 'Resize right panel' })

    expect(leftResize).toHaveAttribute('aria-valuenow', '280')
    expect(rightResize).toHaveAttribute('aria-valuenow', '320')

    fireEvent.keyDown(leftResize, { key: 'ArrowRight' })
    fireEvent.keyDown(rightResize, { key: 'ArrowLeft' })

    expect(leftResize).toHaveAttribute('aria-valuenow', '304')
    expect(rightResize).toHaveAttribute('aria-valuenow', '344')
  })
})
