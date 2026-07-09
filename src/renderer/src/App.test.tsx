import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { App } from './App'
import { router } from './router'

describe('App', () => {
  beforeEach(async () => {
    window.location.hash = ''
    await router.navigate({ to: '/' })
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
  })

  it('renders the workspace route at /', async () => {
    render(<App />)

    expect(await screen.findByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Left panel' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Right panel' })).toBeInTheDocument()
    expect(screen.queryByText('Desktop foundation')).not.toBeInTheDocument()
  })

  it('toggles the side columns from the top bar corner buttons', async () => {
    render(<App />)

    const topBar = await screen.findByRole('banner')
    fireEvent.click(within(topBar).getByRole('button', { name: 'Hide left panel' }))
    fireEvent.click(within(topBar).getByRole('button', { name: 'Hide right panel' }))

    expect(screen.queryByRole('complementary', { name: 'Left panel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Right panel' })).not.toBeInTheDocument()
    expect(within(topBar).getByRole('button', { name: 'Show left panel' })).toBeInTheDocument()
    expect(within(topBar).getByRole('button', { name: 'Show right panel' })).toBeInTheDocument()
  })

  it('toggles between dark and light mode from the titlebar', async () => {
    render(<App />)

    const topBar = await screen.findByRole('banner')
    expect(
      within(topBar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual([
      'Hide left panel',
      'Switch to light mode',
      'Open command palette',
      'Hide right panel'
    ])
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'dark' })

    fireEvent.click(within(topBar).getByRole('button', { name: 'Switch to light mode' }))

    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'light' })
    expect(within(topBar).getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
  })

  it('supports keyboard resizing for side columns', async () => {
    render(<App />)

    await screen.findByRole('banner')
    const leftResize = screen.getByRole('separator', { name: 'Resize left panel' })
    const rightResize = screen.getByRole('separator', { name: 'Resize right panel' })

    expect(leftResize).toHaveAttribute('aria-valuenow', '280')
    expect(rightResize).toHaveAttribute('aria-valuenow', '320')

    fireEvent.keyDown(leftResize, { key: 'ArrowRight' })
    fireEvent.keyDown(rightResize, { key: 'ArrowLeft' })

    expect(leftResize).toHaveAttribute('aria-valuenow', '304')
    expect(rightResize).toHaveAttribute('aria-valuenow', '344')
  })

  it('keeps the left sidebar width in sync between workspace and Settings', async () => {
    render(<App />)

    await screen.findByRole('banner')
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize left panel' }), {
      key: 'ArrowRight'
    })

    fireEvent.click(screen.getByRole('link', { name: 'Open app settings' }))

    expect(await screen.findByRole('main', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Resize left panel' })).toHaveAttribute(
      'aria-valuenow',
      '304'
    )

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize left panel' }), {
      key: 'ArrowRight'
    })
    fireEvent.click(screen.getByRole('link', { name: 'Back to Workspace' }))

    expect(await screen.findByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Resize left panel' })).toHaveAttribute(
      'aria-valuenow',
      '328'
    )
  })

  it('navigates from the workspace to Settings and back', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))

    expect(await screen.findByRole('main', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/settings')

    fireEvent.click(screen.getByRole('link', { name: 'Back to Workspace' }))

    expect(await screen.findByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Workspace' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/')
  })

  it('toggles back to the workspace from the Settings account button', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))
    expect(await screen.findByRole('main', { name: 'Settings' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Close settings' }))

    expect(await screen.findByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/')
  })

  it('opens the command palette, searches, and invokes a navigation command', async () => {
    render(<App />)

    const topBar = await screen.findByRole('banner')
    fireEvent.click(within(topBar).getByRole('button', { name: 'Open command palette' }))

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' })
    const input = within(palette).getByRole('combobox', { name: 'Search commands' })
    fireEvent.change(input, { target: { value: 'settings' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByRole('main', { name: 'Settings' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
    )
  })

  it('invokes renderer-local workspace UI commands from the command palette', async () => {
    render(<App />)

    const topBar = await screen.findByRole('banner')
    fireEvent.click(within(topBar).getByRole('button', { name: 'Open command palette' }))

    const input = await screen.findByRole('combobox', { name: 'Search commands' })
    fireEvent.change(input, { target: { value: 'right panel' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.queryByRole('complementary', { name: 'Right panel' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
    )
  })

  it('does not open the command palette through a hard-coded keyboard shortcut', async () => {
    render(<App />)

    await screen.findByRole('banner')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
  })

  it('toggles the workspace left panel through the app command keyboard shortcut', async () => {
    render(<App />)

    await screen.findByRole('banner')
    expect(screen.getByRole('complementary', { name: 'Left panel' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })

    expect(screen.queryByRole('complementary', { name: 'Left panel' })).not.toBeInTheDocument()
  })

  it('updates the language from Settings without requiring a restart', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))
    const languageSelect = await screen.findByRole('combobox', { name: 'Language' })

    fireEvent.click(languageSelect)
    const frenchOption = await screen.findByRole('option', { name: 'French' })
    fireEvent.pointerDown(frenchOption)
    fireEvent.pointerUp(frenchOption)
    fireEvent.click(frenchOption)

    expect(await screen.findByRole('heading', { name: 'Paramètres' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Général' })).toBeInTheDocument()
    expect(screen.getByText('Compte Space Zero')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Notifications système' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Retour à l’espace de travail' }))
    expect(
      await screen.findByRole('main', { name: 'Espace de travail principal' })
    ).toBeInTheDocument()
    expect(screen.getByText('Nouvel agent')).toBeInTheDocument()
    expect(screen.getByText('Dépôts')).toBeInTheDocument()
  })

  it('keeps the app-wide theme when navigating between routes', async () => {
    render(<App />)

    const topBar = await screen.findByRole('banner')
    fireEvent.click(within(topBar).getByRole('button', { name: 'Switch to light mode' }))

    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'light' })

    fireEvent.click(screen.getByRole('link', { name: 'Open app settings' }))
    expect(await screen.findByRole('main', { name: 'Settings' })).toBeInTheDocument()
    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'light' })

    fireEvent.click(screen.getByRole('link', { name: 'Back to Workspace' }))
    await screen.findByRole('main', { name: 'Main workspace' })
    const workspaceTopBar = screen.getByRole('banner')

    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'light' })
    expect(
      within(workspaceTopBar).getByRole('button', { name: 'Switch to dark mode' })
    ).toBeInTheDocument()
  })
})
