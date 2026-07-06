import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { AppCommandRegistry } from '../../app-commands/renderer/app-command-registry'
import type { AppCommand } from '../../app-commands/renderer/app-command.model'
import { CommandPalette } from './command-palette'

function command(overrides: Partial<AppCommand> & Pick<AppCommand, 'id' | 'title'>): AppCommand {
  return {
    category: 'General',
    handler: () => undefined,
    ...overrides
  }
}

function renderPalette(registry: AppCommandRegistry, onClose = vi.fn()) {
  return {
    onClose,
    ...render(<CommandPalette isOpen registry={registry} onClose={onClose} />)
  }
}

describe('CommandPalette', () => {
  it('renders a searchable list of app commands when open', () => {
    const registry = new AppCommandRegistry()
    registry.register(command({ id: 'workspace.open', title: 'Open Workspace', category: 'Navigation' }))
    registry.register(command({ id: 'settings.open', title: 'Open Settings', category: 'Navigation', keywords: ['preferences'] }))

    renderPalette(registry)

    expect(screen.getByRole('dialog', { name: 'Command Palette' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search commands' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Open Workspace/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /Open Settings/ })).toBeInTheDocument()
  })

  it('filters commands by search text', () => {
    const registry = new AppCommandRegistry()
    registry.register(command({ id: 'workspace.open', title: 'Open Workspace', category: 'Navigation' }))
    registry.register(command({ id: 'settings.open', title: 'Open Settings', category: 'Navigation', keywords: ['preferences'] }))

    renderPalette(registry)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search commands' }), { target: { value: 'pref' } })

    expect(screen.getByRole('option', { name: /Open Settings/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Open Workspace/ })).not.toBeInTheDocument()
  })

  it('supports keyboard navigation and invokes the selected command', async () => {
    const registry = new AppCommandRegistry()
    const invocations: string[] = []
    registry.register(command({ id: 'workspace.open', title: 'Open Workspace', category: 'Navigation' }))
    registry.register(
      command({
        id: 'settings.open',
        title: 'Open Settings',
        category: 'Navigation',
        handler: () => {
          invocations.push('settings')
        }
      })
    )
    const { onClose } = renderPalette(registry)

    const dialog = screen.getByRole('dialog', { name: 'Command Palette' })
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Open Settings/ })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(dialog, { key: 'Enter' })

    expect(invocations).toEqual(['settings'])
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('closes with Escape and clears the search on the next open', () => {
    const registry = new AppCommandRegistry()
    registry.register(command({ id: 'workspace.open', title: 'Open Workspace', category: 'Navigation' }))
    const { onClose, rerender } = renderPalette(registry)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search commands' }), { target: { value: 'missing' } })
    expect(screen.getByText('No commands found.')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Command Palette' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(<CommandPalette isOpen={false} registry={registry} onClose={onClose} />)
    rerender(<CommandPalette isOpen registry={registry} onClose={onClose} />)

    expect(within(screen.getByRole('listbox', { name: 'Commands' })).getByRole('option', { name: /Open Workspace/ })).toBeInTheDocument()
  })
})
