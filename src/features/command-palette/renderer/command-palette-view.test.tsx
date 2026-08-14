import { fireEvent, render, screen, within } from '@testing-library/react'

import { CommandPaletteView, type CommandPaletteViewProps } from './command-palette-view'

const noop = (): void => undefined

function renderView(overrides: Partial<CommandPaletteViewProps> = {}) {
  return render(
    <CommandPaletteView
      commands={[
        { id: 'workspace.open', title: 'Open Workspace', category: 'Navigation' },
        {
          id: 'settings.open',
          title: 'Open Settings',
          category: 'Navigation',
          shortcut: '⌘,'
        },
        { id: 'session.new', title: 'New Project Session', category: 'Sessions' }
      ]}
      invocationError={null}
      isOpen
      query=""
      selectedCommandId="workspace.open"
      onClose={noop}
      onInvokeCommand={noop}
      onQueryChange={noop}
      onSelectedCommandChange={noop}
      {...overrides}
    />
  )
}

describe('CommandPaletteView', () => {
  it('renders grouped command results and keyboard shortcuts from visual props', () => {
    renderView()

    const palette = screen.getByRole('dialog', { name: 'Command Palette' })
    expect(within(palette).getByRole('group', { name: 'Navigation' })).toBeInTheDocument()
    expect(within(palette).getByRole('group', { name: 'Sessions' })).toBeInTheDocument()
    expect(within(palette).getByText('⌘,')).toBeInTheDocument()
  })

  it('emits search, selection, invocation, and close intent through callbacks', () => {
    const onClose = vi.fn()
    const onInvokeCommand = vi.fn()
    const onQueryChange = vi.fn()
    const onSelectedCommandChange = vi.fn()
    renderView({ onClose, onInvokeCommand, onQueryChange, onSelectedCommandChange })

    const input = screen.getByRole('combobox', { name: 'Search commands' })
    fireEvent.change(input, { target: { value: 'settings' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('option', { name: /Open Settings/ }))
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onQueryChange).toHaveBeenCalledWith('settings')
    expect(onSelectedCommandChange).toHaveBeenCalled()
    expect(onInvokeCommand).toHaveBeenCalledWith('settings.open')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows unavailable commands without allowing invocation', () => {
    const onInvokeCommand = vi.fn()
    renderView({
      commands: [
        {
          id: 'project.clone',
          title: 'Clone Repository',
          category: 'Projects',
          disabled: true,
          unavailableReason: 'Unavailable while GitHub is disconnected'
        }
      ],
      selectedCommandId: '',
      onInvokeCommand
    })

    const unavailableCommand = screen.getByRole('option', { name: /Clone Repository/ })
    expect(unavailableCommand).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Unavailable while GitHub is disconnected')).toBeInTheDocument()

    fireEvent.click(unavailableCommand)
    expect(onInvokeCommand).not.toHaveBeenCalled()
  })

  it('renders the no-results state supplied by the connected palette', () => {
    renderView({ commands: [], query: 'missing', selectedCommandId: '' })

    expect(screen.getByText('No commands found.')).toBeInTheDocument()
  })
})
