import type { CommandPaletteViewCommand, CommandPaletteViewProps } from './command-palette-view'

const noop = (): void => undefined

const navigationCommands: readonly CommandPaletteViewCommand[] = [
  { id: 'navigation.projects', title: 'Go to Projects', category: 'Navigation' },
  { id: 'navigation.global-chat', title: 'Go to Global Chat', category: 'Navigation' },
  { id: 'navigation.settings', title: 'Open Settings', category: 'Navigation' }
]

const workspaceCommands: readonly CommandPaletteViewCommand[] = [
  { id: 'workspace.toggle-left-panel', title: 'Toggle Left Panel', category: 'Workspace' },
  { id: 'workspace.toggle-side-pane', title: 'Toggle Side Pane', category: 'Workspace' }
]

const baseFixture = {
  invocationError: null,
  isOpen: true,
  query: '',
  onClose: noop,
  onInvokeCommand: noop,
  onQueryChange: noop,
  onSelectedCommandChange: noop
} satisfies Omit<CommandPaletteViewProps, 'commands' | 'selectedCommandId'>

export const defaultOpenCommandPaletteFixture = {
  ...baseFixture,
  commands: [...navigationCommands, ...workspaceCommands],
  selectedCommandId: 'navigation.projects'
} satisfies CommandPaletteViewProps

export const searchResultsCommandPaletteFixture = {
  ...baseFixture,
  commands: [navigationCommands[2]],
  query: 'settings',
  selectedCommandId: 'navigation.settings'
} satisfies CommandPaletteViewProps

export const noResultsCommandPaletteFixture = {
  ...baseFixture,
  commands: [],
  query: 'deploy production',
  selectedCommandId: ''
} satisfies CommandPaletteViewProps

export const groupedCommandsCommandPaletteFixture = {
  ...baseFixture,
  commands: [
    ...navigationCommands,
    ...workspaceCommands,
    { id: 'sessions.new', title: 'New Project Session', category: 'Sessions' },
    { id: 'sessions.resume', title: 'Resume Project Session', category: 'Sessions' }
  ],
  selectedCommandId: 'navigation.projects'
} satisfies CommandPaletteViewProps

export const shortcutDisplayCommandPaletteFixture = {
  ...baseFixture,
  commands: [
    {
      id: 'workspace.command-palette',
      title: 'Open Command Palette',
      category: 'Workspace',
      shortcut: '⌘K'
    },
    {
      id: 'workspace.toggle-left-panel',
      title: 'Toggle Left Panel',
      category: 'Workspace',
      shortcut: '⌘B'
    },
    {
      id: 'navigation.settings',
      title: 'Open Settings',
      category: 'Navigation',
      shortcut: '⌘,'
    }
  ],
  selectedCommandId: 'workspace.command-palette'
} satisfies CommandPaletteViewProps

export const unavailableCommandPaletteFixture = {
  ...baseFixture,
  commands: [
    { id: 'navigation.projects', title: 'Go to Projects', category: 'Navigation' },
    {
      id: 'projects.clone',
      title: 'Clone Repository',
      category: 'Projects',
      disabled: true,
      unavailableReason: 'Unavailable while GitHub is disconnected'
    }
  ],
  selectedCommandId: 'navigation.projects'
} satisfies CommandPaletteViewProps
