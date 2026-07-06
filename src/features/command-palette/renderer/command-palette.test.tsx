import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'

import { i18n } from '@renderer/i18n'

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
    expect(screen.getByRole('combobox', { name: 'Search commands' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Open Workspace/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /Open Settings/ })).toBeInTheDocument()
  })

  it('filters commands by search text', () => {
    const registry = new AppCommandRegistry()
    registry.register(command({ id: 'workspace.open', title: 'Open Workspace', category: 'Navigation' }))
    registry.register(command({ id: 'settings.open', title: 'Open Settings', category: 'Navigation', keywords: ['preferences'] }))

    renderPalette(registry)

    fireEvent.change(screen.getByRole('combobox', { name: 'Search commands' }), { target: { value: 'pref' } })

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

    const input = screen.getByRole('combobox', { name: 'Search commands' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Open Settings/ })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(invocations).toEqual(['settings'])
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('clears the search when closed externally and reopened', () => {
    const registry = new AppCommandRegistry()
    registry.register(command({ id: 'workspace.open', title: 'Open Workspace', category: 'Navigation' }))
    const { onClose, rerender } = renderPalette(registry)

    fireEvent.change(screen.getByRole('combobox', { name: 'Search commands' }), { target: { value: 'missing' } })
    expect(screen.getByText('No commands found.')).toBeInTheDocument()

    rerender(<CommandPalette isOpen={false} registry={registry} onClose={onClose} />)
    rerender(<CommandPalette isOpen registry={registry} onClose={onClose} />)

    expect(within(screen.getByRole('listbox', { name: 'Commands' })).getByRole('option', { name: /Open Workspace/ })).toBeInTheDocument()
  })

  it('localizes palette labels with the active language', async () => {
    await i18n.changeLanguage('fr')
    const registry = new AppCommandRegistry()
    registry.register(command({ id: 'workspace.open', title: 'Ouvrir l’espace de travail', category: 'Navigation' }))

    renderPalette(registry)

    const palette = screen.getByRole('dialog', { name: 'Palette de commandes' })
    expect(within(palette).getByRole('combobox', { name: 'Rechercher des commandes' })).toHaveAttribute(
      'placeholder',
      'Rechercher des commandes…'
    )
    expect(within(palette).getByRole('listbox', { name: 'Commandes' })).toBeInTheDocument()
  })

  it('makes the background inert while open and restores focus on close', async () => {
    const registry = new AppCommandRegistry()
    registry.register(command({ id: 'workspace.open', title: 'Open Workspace', category: 'Navigation' }))

    function Harness(): React.JSX.Element {
      const [isOpen, setIsOpen] = useState(false)

      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open palette
          </button>
          <button type="button">Background action</button>
          <CommandPalette isOpen={isOpen} registry={registry} onClose={() => setIsOpen(false)} />
        </>
      )
    }

    render(<Harness />)

    const openButton = screen.getByRole('button', { name: 'Open palette' })
    openButton.focus()
    fireEvent.click(openButton)

    expect(screen.queryByRole('button', { name: 'Background action' })).not.toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search commands' }), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument())
    expect(openButton).toHaveFocus()
  })
})
