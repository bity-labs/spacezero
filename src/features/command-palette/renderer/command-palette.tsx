import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AppCommand, AppCommandId } from '../../app-commands/renderer/app-command.model'
import { CommandPaletteView } from './command-palette-view'

type CommandPaletteProps = {
  commands: readonly AppCommand[]
  isOpen: boolean
  invokeCommand: (commandId: AppCommandId) => void | Promise<void>
  searchCommands: (query: string) => AppCommand[]
  onClose: () => void
}

/**
 * Connects App Command Registry behavior to the pure Command Palette view.
 * The controller above this component remains responsible for the registry and invocation context.
 */
export function CommandPalette({
  commands,
  isOpen,
  invokeCommand,
  searchCommands,
  onClose
}: CommandPaletteProps): React.JSX.Element {
  if (!isOpen) return <></>

  return (
    <ConnectedCommandPalette
      commands={commands}
      invokeCommand={invokeCommand}
      searchCommands={searchCommands}
      onClose={onClose}
    />
  )
}

type ConnectedCommandPaletteProps = Omit<CommandPaletteProps, 'isOpen'>

function ConnectedCommandPalette({
  commands,
  invokeCommand,
  searchCommands,
  onClose
}: ConnectedCommandPaletteProps): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedCommandId, setSelectedCommandId] = useState<AppCommandId>('')
  const [invocationError, setInvocationError] = useState<string | null>(null)
  const filteredCommands = query ? searchCommands(query) : [...commands]
  const activeCommandId = filteredCommands.some((command) => command.id === selectedCommandId)
    ? selectedCommandId
    : (filteredCommands[0]?.id ?? '')

  async function handleInvokeCommand(commandId: AppCommandId): Promise<void> {
    setInvocationError(null)

    try {
      await invokeCommand(commandId)
      onClose()
    } catch {
      setInvocationError(t('commandPalette.invocationError'))
    }
  }

  return (
    <CommandPaletteView
      commands={filteredCommands}
      invocationError={invocationError}
      isOpen
      query={query}
      selectedCommandId={activeCommandId}
      onClose={onClose}
      onInvokeCommand={(commandId) => void handleInvokeCommand(commandId)}
      onQueryChange={(nextQuery) => {
        setQuery(nextQuery)
        setSelectedCommandId('')
      }}
      onSelectedCommandChange={setSelectedCommandId}
    />
  )
}
